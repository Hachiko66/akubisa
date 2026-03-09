const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendEmail, emailTemplates } = require('../config/email');

const makeToken = () => crypto.randomBytes(32).toString('hex');

const signJWT = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES }
);

exports.register = async (req, res) => {
  const { full_name, email, password, role, city, phone } = req.body;
  if (!full_name || !email || !password || !role)
    return res.status(400).json({ message: 'Semua field wajib diisi' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length > 0)
      return res.status(409).json({ message: 'Email sudah terdaftar' });

    const hash = await bcrypt.hash(password, 10);
    const verifyToken = makeToken();

    const result = await pool.query(
      `INSERT INTO users (full_name, email, password, role, city, phone, verify_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING id, full_name, email, role, city, email_verified`,
      [full_name, email, hash, role, city||null, phone||null, verifyToken]
    );
    const user = result.rows[0];
    const token = signJWT(user);

    // Kirim email verifikasi (non-blocking)
    const tmpl = emailTemplates.verification(full_name, verifyToken);
    sendEmail({ to: email, ...tmpl });

    res.status(201).json({
      message: 'Registrasi berhasil! Cek email untuk verifikasi.',
      token, user,
      emailSent: true
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.verifyEmail = async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      `UPDATE users SET email_verified=true, verify_token=null, is_verified=true
       WHERE verify_token=$1 RETURNING id, full_name, email`,
      [token]
    );
    if (!result.rows.length)
      return res.status(400).send('<h2>Link tidak valid atau sudah digunakan.</h2>');
    const user = result.rows[0];
    // Kirim welcome email
    const tmpl = emailTemplates.welcome(user.full_name);
    sendEmail({ to: user.email, ...tmpl });
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:3rem">
        <h2 style="color:#e8521a">Email Terverifikasi! ✅</h2>
        <p>Akunmu sudah aktif. Silakan login.</p>
        <a href="${process.env.APP_URL}/#login" style="background:#e8521a;color:white;padding:.8rem 2rem;border-radius:8px;text-decoration:none">Login Sekarang</a>
      </body></html>
    `);
  } catch(e) { res.status(500).send('Server error'); }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email dan password wajib diisi' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    if (!result.rows.length)
      return res.status(404).json({ message: 'Email tidak ditemukan' });
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Password salah' });
    const token = signJWT(user);
    const { password: _, verify_token, reset_token, ...userData } = user;
    res.json({ message: 'Login berhasil!', token, user: userData });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email wajib diisi' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    // Selalu response sukses (security: tidak reveal apakah email ada)
    if (!result.rows.length)
      return res.json({ message: 'Jika email terdaftar, link reset akan dikirim.' });
    const user = result.rows[0];
    const resetToken = makeToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 jam
    await pool.query(
      'UPDATE users SET reset_token=$1, reset_token_expires=$2 WHERE id=$3',
      [resetToken, expires, user.id]
    );
    const tmpl = emailTemplates.resetPassword(user.full_name, resetToken);
    await sendEmail({ to: email, ...tmpl });
    res.json({ message: 'Jika email terdaftar, link reset akan dikirim.' });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.resetPassword = async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;
  if (!password || password.length < 6)
    return res.status(400).json({ message: 'Password minimal 6 karakter' });
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE reset_token=$1 AND reset_token_expires > NOW()',
      [token]
    );
    if (!result.rows.length)
      return res.status(400).json({ message: 'Link tidak valid atau sudah kadaluarsa' });
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password=$1, reset_token=null, reset_token_expires=null WHERE id=$2',
      [hash, result.rows[0].id]
    );
    res.json({ message: 'Password berhasil direset! Silakan login.' });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.switchRole = async (req, res) => {
  const { role } = req.body;
  if (!['worker','client'].includes(role))
    return res.status(400).json({ message: 'Role tidak valid' });
  try {
    const result = await pool.query(
      'UPDATE users SET role=$1, updated_at=NOW() WHERE id=$2 RETURNING id, full_name, email, role',
      [role, req.user.id]
    );
    const user = result.rows[0];
    const token = signJWT(user);
    res.json({ message: `Role berhasil diganti ke ${role}`, token, user });
  } catch(e) { res.status(500).json({ message: e.message }); }
};

exports.me = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, role, avatar, bio, city, phone,
              is_verified, email_verified, created_at, social_twitter, social_linkedin, social_github, social_tiktok, social_youtube, social_telegram
       FROM users WHERE id=$1`,
      [req.user.id]
    );
    if (!result.rows.length) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json(result.rows[0]);
  } catch(e) { res.status(500).json({ message: e.message }); }
};
