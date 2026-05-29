const express = require('express');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 6001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

// Compression middleware
app.use(compression());

// Parse JSON bodies
app.use(express.json({ limit: '10kb' }));

// Serve static files with caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  etag: true
}));

// Health check endpoint for AWS
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Registration API - creates unique registration code, emails user/admin, and saves to CSV
app.post(['/api/register','/register'], async (req, res) => {
  const { name, email, phone, type, message } = req.body || {};

  if (!name || !email || !phone || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const normalize = (v) => String(v).trim();

  const registrationBase = {
    name: normalize(name),
    email: normalize(email),
    phone: normalize(phone),
    type: normalize(type),
    message: message ? normalize(message) : '',
    submittedAt: new Date().toISOString()
  };

  const dataDir = path.join(__dirname, 'data');
  const jsonPath = path.join(dataDir, 'registrations.json');
  const csvPath = path.join(dataDir, 'registrations.csv');

  try {
    await fs.promises.mkdir(dataDir, { recursive: true });

    // Load existing registrations to ensure unique 10-digit code
    let existing = [];
    try {
      const content = await fs.promises.readFile(jsonPath, 'utf8');
      existing = JSON.parse(content || '[]');
      if (!Array.isArray(existing)) existing = [];
    } catch {
      existing = [];
    }

    const usedCodes = new Set(existing.map(r => r.code).filter(Boolean));

    const generateCode = () => {
      // 10-digit numeric code (no leading zero restriction required)
      const n = Math.floor(Math.random() * 10000000000); // 0..9999999999
      return String(n).padStart(10, '0');
    };

    let code = generateCode();
    // retry a few times (extremely unlikely collision)
    for (let i = 0; i < 10 && usedCodes.has(code); i++) {
      code = generateCode();
    }

    const registration = { ...registrationBase, code };

    existing.push(registration);
    await fs.promises.writeFile(jsonPath, JSON.stringify(existing, null, 2), 'utf8');

    // Append to CSV as "spreadsheet"
    const headers = ['code', 'name', 'email', 'phone', 'type', 'message', 'submittedAt'];
    const writeCsvRow = async () => {
      const row = headers.map((h) => {
        const val = registration[h] ?? '';
        const s = String(val);
        // escape quotes
        if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
          return `"${s.replaceAll('"', '""')}"`;
        }
        return s;
      }).join(',');

      const fileExists = await fs.promises
        .access(csvPath)
        .then(() => true)
        .catch(() => false);

      if (!fileExists) {
        await fs.promises.writeFile(csvPath, headers.join(',') + '\n' + row + '\n', 'utf8');
      } else {
        await fs.promises.appendFile(csvPath, row + '\n', 'utf8');
      }
    };

    await writeCsvRow();

    // Email sending via nodemailer
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_USER,
      SMTP_PASS,
      SMTP_FROM,
      MAIL_TO_ADMIN
    } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !SMTP_FROM || !MAIL_TO_ADMIN) {
      // If email is not configured, still accept registration (code saved to JSON/CSV)
      // and let the user see the code on Thank You page.
      console.error('Missing email env vars. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM/MAIL_TO_ADMIN');
      return res.status(201).json({ success: true, code });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: false, // set true if using 465
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    const subject = `EV Connect 2026 Registration Successful - Code ${code}`;
    const userText = `Hello ${registration.name},\n\nThank you for registering for EV Connect 2026.\nYour unique registration code is: ${code}.\n\nEvent Details:\n- Date: June 7, 2026\n- Time: 7:00 AM Onwards\n- Location: NRK Business Park, Indore\n\nPlease keep this code for entry.\n\nTeam EV Connect 2026`;

    const adminText = `New registration received:\n\nCode: ${code}\nName: ${registration.name}\nEmail: ${registration.email}\nPhone: ${registration.phone}\nType: ${registration.type}\nMessage: ${registration.message || '-'}\nSubmitted At: ${registration.submittedAt}`;

    // Send email to user with code
    await transporter.sendMail({
      from: SMTP_FROM,
      to: registration.email,
      subject,
      text: userText
    });

    // Send email to admin (evconnect@evurjaa.com)
    await transporter.sendMail({
      from: SMTP_FROM,
      to: MAIL_TO_ADMIN,
      subject: `Admin: New EV Connect 2026 Registration - ${code}`,
      text: adminText
    });

    return res.status(201).json({ success: true, code });
  } catch (err) {
    // If email fails, still allow frontend to show error page
    // (and keep data in JSON/CSV)

    console.error('Error handling registration:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Serve the landing page for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`EV Connect 2026 server running on port ${PORT}`);
});
