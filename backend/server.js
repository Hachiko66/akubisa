require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const fs = require('fs');

const app = express();

// Security
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// Rate limiters
const globalLimiter = rateLimit({ windowMs: 15*60*1000, max: 500, message: { message: 'Terlalu banyak request.' } });
const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: 20,  message: { message: 'Terlalu banyak percobaan login.' } });
const msgLimiter    = rateLimit({ windowMs: 60*1000,    max: 120,  message: { message: 'Terlalu banyak pesan.' } });

app.use(globalLimiter);
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads/digital', express.static(path.join(__dirname, 'uploads/digital')));
app.use('/uploads/portfolio', require('express').static('/var/www/akubisa/frontend/uploads/portfolio'));
app.use('/uploads/images', express.static(path.join(__dirname, 'uploads/images')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Auto-migrate schema
const pool = require('./config/db');
(async () => {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'config/schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('✅ Schema ready!');
  } catch(e) {
    console.log('Schema note:', e.message.slice(0, 80));
  }
})();

// Routes
app.use('/api/auth',          authLimiter, require('./routes/auth'));
app.use('/api/listings',                   require('./routes/listings'));
app.use('/api/categories',                 require('./routes/categories'));
app.use('/api/profile',                    require('./routes/profile'));
app.use('/api/wallet', require('./routes/wallet'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/job-requests', require('./routes/jobRequests'));
app.use('/api/messages',      msgLimiter,  require('./routes/messages'));
app.use('/api/reviews',                    require('./routes/reviews'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/bookmarks',                  require('./routes/bookmarks'));
app.use('/api/notifications',              require('./routes/notifications'));
app.use('/api/reports',                    require('./routes/reports'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', version: '1.0.0', message: 'AkuBisa API berjalan!' });
});

// Admin panel — halaman terpisah
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin/index.html'));
});
app.get('/admin/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/admin/index.html'));
});

// Serve frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server berjalan di http://localhost:${PORT}`);
});
