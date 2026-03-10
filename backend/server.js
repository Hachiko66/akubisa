require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
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
app.use('/uploads/kyc', require('express').static('/var/www/akubisa/frontend/uploads/kyc'));
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
app.use('/api/kyc', require('./routes/kyc'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/job-requests', require('./routes/jobRequests'));
app.use('/api/messages',      msgLimiter,  require('./routes/messages'));
app.use('/api/reviews',                    require('./routes/reviews'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/bookmarks',                  require('./routes/bookmarks'));
app.use('/api/boost', require('./routes/boost'));
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

// Dynamic Sitemap
app.get('/sitemap.xml', async (req, res) => {
  try {
    const listings = await pool.query("SELECT id, updated_at FROM listings WHERE status='active' ORDER BY updated_at DESC LIMIT 1000");
    const staticUrls = [
      { loc: 'https://akubisa.co/', priority: '1.0', changefreq: 'daily' },
      { loc: 'https://akubisa.co/#explore', priority: '0.9', changefreq: 'hourly' },
      { loc: 'https://akubisa.co/#how-it-works', priority: '0.7', changefreq: 'monthly' },
    ];
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    staticUrls.forEach(u => {
      xml += `  <url><loc>${u.loc}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>\n`;
    });
    listings.rows.forEach(l => {
      const lastmod = new Date(l.updated_at).toISOString().split('T')[0];
      xml += `  <url><loc>https://akubisa.co/#listing-${l.id}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>\n`;
    });
    xml += '</urlset>';
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch(e) {
    res.status(500).send('Error generating sitemap');
  }
});
