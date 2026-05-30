/**
 * server.js — EV Connect 2026
 *
 * Changes from previous version:
 *  1. Added byte-range video middleware → fixes ERR_CACHE_OPERATION_NOT_SUPPORTED
 *  2. Static files served from 'public/' (put index.html + assets there)
 *  3. 409 duplicate-email response now returns existing code (frontend handles it)
 *  4. SMTP verify failure is a warning, not a crash
 *  5. Removed redundant require, added graceful shutdown
 */

const express    = require('express');
const fs         = require('fs');
const path       = require('path');
const compression = require('compression');
const helmet     = require('helmet');
const nodemailer = require('nodemailer');
const axios      = require('axios');
require('dotenv').config();

const app    = express();
const PORT   = process.env.PORT || 6001;
const PUBLIC = path.join(__dirname, 'public');

/* ============================================================
   MIDDLEWARE
============================================================ */
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(express.json({ limit: '10kb' }));

/* ============================================================
   VIDEO BYTE-RANGE MIDDLEWARE
   Must come BEFORE express.static so .mp4/.webm get proper
   206 Partial Content responses (required for <video> seek).
   Fixes: ERR_CACHE_OPERATION_NOT_SUPPORTED
============================================================ */
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogv']);
const VIDEO_MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg' };

app.use(function videoRangeMiddleware(req, res, next) {
    const ext = path.extname(req.path).toLowerCase();
    if (!VIDEO_EXTS.has(ext)) return next();

    const filePath = path.join(PUBLIC, req.path);

    fs.stat(filePath, function (err, stat) {
        if (err) return next(); /* file not found — fall through to 404 */

        const fileSize = stat.size;
        const range    = req.headers.range;
        const mime     = VIDEO_MIME[ext];

        if (range) {
            /* Partial content — browser is seeking */
            const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
            const start     = parseInt(startStr, 10);
            const end       = endStr ? parseInt(endStr, 10) : fileSize - 1;
            const chunkSize = end - start + 1;

            res.writeHead(206, {
                'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges':  'bytes',
                'Content-Length': chunkSize,
                'Content-Type':   mime,
                'Cache-Control':  'public, max-age=31536000',
            });

            fs.createReadStream(filePath, { start, end }).pipe(res);

        } else {
            /* Full file */
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type':   mime,
                'Accept-Ranges':  'bytes',
                'Cache-Control':  'public, max-age=31536000',
            });

            fs.createReadStream(filePath).pipe(res);
        }
    });
});

/* ============================================================
   REGISTER MIME TYPES at Express level
   This fixes MIME errors regardless of OS mime.types file
============================================================ */
express.static.mime.define({
    'application/javascript': ['js', 'mjs'],
    'text/css':               ['css'],
    'image/svg+xml':          ['svg'],
    'image/webp':             ['webp'],
    'video/mp4':              ['mp4'],
    'video/webm':             ['webm'],
});

/* ============================================================
   BLOCK sensitive files
============================================================ */
app.use(function blockSensitiveFiles(req, res, next) {
    const blocked = /^\/data\/|^\/\.env|\.log$|\.sh$|\.key$|\.pem$|\.crt$|registrations/i;
    if (blocked.test(req.path)) return res.status(403).end();
    next();
});

/* ============================================================
   STATIC FILES — serve ONLY from public/
   ✅ Put index.html, script.js, images/, videos/ all in public/
============================================================ */
app.use(express.static(PUBLIC, {
    maxAge: '1d',
    etag:   true,
    setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.html') {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        }
    }
}));

/* ============================================================
   HEALTH CHECK
============================================================ */
app.get('/health', function (req, res) {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/* ============================================================
   SMTP TRANSPORTER (Mailcow / any SMTP)
============================================================ */
const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT || 587),
    secure: false, /* STARTTLS */
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false }
});

/* Verify on startup — warn only, don't crash */
transporter.verify()
    .then(() => console.log('✅ SMTP verified — Mailcow ready'))
    .catch(err => console.warn('⚠️  SMTP verify failed (emails disabled):', err.message));

/* ============================================================
   REGISTRATION API
   POST /api/register
   Body: { name, email, phone, type, message? }
   Returns:
     201 { success: true, code }          — new registration
     400 { error, missing[] }             — validation failure
     409 { error, code }                  — email already registered
     500 { error }                        — server error
============================================================ */
app.post(['/api/register', '/register'], async function (req, res) {
    const { name, email, phone, type, message } = req.body || {};

    /* ── Validation ── */
    const missing = ['name','email','phone','type'].filter(f => !req.body?.[f]);
    if (missing.length) {
        return res.status(400).json({ error: 'Missing required fields', missing });
    }

    const normalize = v => String(v).trim();

    const registration = {
        name:        normalize(name),
        email:       normalize(email).toLowerCase(),
        phone:       normalize(phone),
        type:        normalize(type),
        message:     message ? normalize(message) : '',
        submittedAt: new Date().toISOString()
    };

    const dataDir = path.join(__dirname, 'data');
    const jsonPath = path.join(dataDir, 'registrations.json');
    const csvPath  = path.join(dataDir, 'registrations.csv');

    try {
        await fs.promises.mkdir(dataDir, { recursive: true });

        /* Load existing registrations */
        let existing = [];
        try {
            const content = await fs.promises.readFile(jsonPath, 'utf8');
            existing = JSON.parse(content || '[]');
            if (!Array.isArray(existing)) existing = [];
        } catch { existing = []; }

        /* ── Duplicate email check ── */
        const duplicate = existing.find(
            r => r.email && r.email.toLowerCase() === registration.email
        );
        if (duplicate) {
            return res.status(409).json({
                error: 'Email already registered',
                code:  duplicate.code
            });
        }

        /* ── Generate unique code ── */
        const usedCodes = new Set(existing.map(r => r.code).filter(Boolean));

        const generateCode = () => {
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let prefix = '';
            for (let i = 0; i < 4; i++) prefix += letters[Math.floor(Math.random() * 26)];
            const digits = Math.floor(100000 + Math.random() * 900000);
            return `EVCN-${prefix}-${digits}`;
        };

        let code, attempts = 0;
        do { code = generateCode(); attempts++; }
        while (usedCodes.has(code) && attempts < 50);

        if (usedCodes.has(code)) throw new Error('Could not generate unique code');

        registration.code = code;

        /* ── Google Sheets webhook ── */
        if (process.env.GOOGLE_SHEET_WEBHOOK) {
            axios.post(process.env.GOOGLE_SHEET_WEBHOOK, registration)
                .then(() => console.log('✅ Google Sheet updated'))
                .catch(err => console.warn('⚠️  Google Sheet update failed:', err.message));
        }

        /* ── Persist to JSON ── */
        existing.push(registration);
        await fs.promises.writeFile(jsonPath, JSON.stringify(existing, null, 2));

        /* ── Persist to CSV ── */
        const headers = ['code','name','email','phone','type','message','submittedAt'];
        const csvRow  = headers.map(h => {
            const v = String(registration[h] || '');
            return (v.includes(',') || v.includes('"') || v.includes('\n'))
                ? `"${v.replaceAll('"', '""')}"` : v;
        }).join(',');

        const csvExists = await fs.promises.access(csvPath).then(() => true).catch(() => false);
        if (!csvExists) {
            await fs.promises.writeFile(csvPath, headers.join(',') + '\n' + csvRow + '\n');
        } else {
            await fs.promises.appendFile(csvPath, csvRow + '\n');
        }

        /* ── Respond immediately — email is fire-and-forget ── */
        res.status(201).json({ success: true, code });

        /* ── Send emails (non-blocking) ── */
        sendEmails(registration, code).catch(err =>
            console.error('❌ Email send error:', err.message)
        );

    } catch (err) {
        console.error('❌ Registration server error:', err);
        res.status(500).json({ error: 'Server error. Please try again.' });
    }
});

/* ============================================================
   EMAIL HELPER
============================================================ */
async function sendEmails(reg, code) {
    const missing = ['SMTP_HOST','SMTP_USER','SMTP_PASS','SMTP_FROM','MAIL_TO_ADMIN']
        .filter(k => !process.env[k]);

    if (missing.length) {
        console.warn('⚠️  Skipping email — missing env vars:', missing.join(', '));
        return;
    }

    const subject = `EV Connect 2026 Registration Confirmed | ${code}`;

    /* User email */
    await transporter.sendMail({
        from:    `"EV Connect 2026" <${process.env.SMTP_FROM}>`,
        to:      reg.email,
        subject,
        text: `EV CONNECT 2026 — REGISTRATION CONFIRMED

Hello ${reg.name},

Your registration code is: ${code}

Event: 14 June 2026, 7:00 AM onwards
Venue: Vijay Nagar Playground, Near NRK Business Park, Vijay Nagar, Indore

Please keep this code safe — you will need it at check-in.

Regards,
Team EV Connect 2026
Organised by EV Urjaa & 4K Media Marketing`,

        html: `
<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;background:#f9f9f9;border-radius:12px;overflow:hidden">
  <div style="background:#000;padding:28px 32px">
    <h1 style="color:#00ffae;font-size:22px;margin:0">EV Connect 2026</h1>
    <p style="color:#aaa;font-size:13px;margin:6px 0 0">Registration Confirmed</p>
  </div>
  <div style="padding:32px">
    <p style="font-size:16px">Hello <strong>${reg.name}</strong>,</p>
    <p>Thank you for registering for <strong>EV Connect 2026</strong>. Your unique entry code is:</p>
    <div style="background:#000;color:#00ffae;font-size:26px;font-weight:bold;letter-spacing:3px;text-align:center;padding:22px;border-radius:10px;margin:20px 0">
      ${code}
    </div>
    <h3 style="color:#333">Event Details</h3>
    <ul style="color:#555;line-height:2">
      <li><strong>Date:</strong> 14 June 2026</li>
      <li><strong>Reporting Time:</strong> 7:00 AM onwards</li>
      <li><strong>Venue:</strong> Vijay Nagar Playground, Near NRK Business Park, Vijay Nagar, Indore</li>
    </ul>
    <h3 style="color:#333">What to Expect</h3>
    <ul style="color:#555;line-height:2">
      <li>Grand EV Rally through Indore</li>
      <li>EV Startup Showcase &amp; Networking</li>
      <li>Creator &amp; Media Zone</li>
      <li>Technology Displays &amp; Awards</li>
    </ul>
    <p style="background:#fff3cd;padding:14px;border-radius:8px;font-size:13px;color:#856404">
      ⚠ Please carry your registration code (digital or printed) at the venue for check-in.
    </p>
    <p style="color:#777;font-size:13px;margin-top:28px">
      Regards,<br>
      <strong>Team EV Connect 2026</strong><br>
      Organised by EV Urjaa &amp; 4K Media Marketing
    </p>
  </div>
</div>`
    });

    console.log(`✅ User email sent → ${reg.email}`);

    /* Admin notification */
    await transporter.sendMail({
        from:    process.env.SMTP_FROM,
        to:      process.env.MAIL_TO_ADMIN,
        subject: `[Admin] New Registration — ${code}`,
        text:
`Code:        ${code}
Name:        ${reg.name}
Email:       ${reg.email}
Phone:       ${reg.phone}
Category:    ${reg.type}
Message:     ${reg.message || '-'}
Submitted:   ${reg.submittedAt}`
    });

    console.log(`✅ Admin email sent → ${process.env.MAIL_TO_ADMIN}`);
}

/* ============================================================
   FALLBACK — serve index.html for navigation routes only.
   Static asset misses (missing .js/.css/.png) get a real 404
   so the browser error is clear, not a silent HTML response.
============================================================ */
app.get('*', function (req, res) {
    const ext = path.extname(req.path);

    /* If the request looks like a file (has extension) — return 404 */
    if (ext && ext !== '.html') {
        return res.status(404).send(`File not found: ${req.path}`);
    }

    /* Otherwise serve index.html (SPA navigation) */
    res.sendFile(path.join(PUBLIC, 'index.html'));
});

/* ============================================================
   START SERVER
============================================================ */
const server = app.listen(PORT, function () {
    console.log(`\n🚗 EV Connect 2026 server → http://localhost:${PORT}\n`);
});

/* Graceful shutdown */
process.on('SIGTERM', function () {
    server.close(function () {
        console.log('Server closed.');
        process.exit(0);
    });
});