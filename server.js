const express = require('express');
const fs = require('fs');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Registration API - persists registrations to a JSON file under /data
app.post('/api/register', async (req, res) => {
  const { name, email, phone, type, message } = req.body || {};

  if (!name || !email || !phone || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const registration = {
    name: String(name).trim(),
    email: String(email).trim(),
    phone: String(phone).trim(),
    type: String(type).trim(),
    message: message ? String(message).trim() : '',
    submittedAt: new Date().toISOString()
  };

  try {
    const dataDir = path.join(__dirname, 'data');
    await fs.promises.mkdir(dataDir, { recursive: true });
    const filePath = path.join(dataDir, 'registrations.json');

    let existing = [];
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      existing = JSON.parse(content || '[]');
      if (!Array.isArray(existing)) existing = [];
    } catch (e) {
      existing = [];
    }

    existing.push(registration);
    await fs.promises.writeFile(filePath, JSON.stringify(existing, null, 2), 'utf8');

    return res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error saving registration:', err);
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
