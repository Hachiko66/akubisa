const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const pool = require('../config/db');

// Setup multer untuk upload foto
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar_${req.user.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    const ok = allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase());
    ok ? cb(null, true) : cb(new Error('Hanya file gambar yang diizinkan'));
  }
});

// GET profile publik by ID
router.get('/:id', async (req, res) => {
  try {
    const u = await pool.query(
      `SELECT u.id, u.full_name, u.avatar, u.bio, u.city, u.is_verified, u.created_at, u.badge_level,
              u.social_twitter, u.social_linkedin, u.social_github, u.social_tiktok, u.social_youtube, u.social_telegram,
              COUNT(DISTINCT l.id) as listing_count,
              COALESCE(AVG(r.rating),0) as avg_rating,
              COUNT(DISTINCT r.id) as review_count,
              COUNT(DISTINCT t.id) as completed_transactions
       FROM users u
       LEFT JOIN listings l ON l.user_id = u.id AND l.is_active = true
       LEFT JOIN reviews r ON r.reviewed_id = u.id
       LEFT JOIN transactions t ON t.worker_id = u.id AND t.status = 'completed'
       WHERE u.id = $1
       GROUP BY u.id`, [req.params.id]
    );
    if (!u.rows.length) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json(u.rows[0]);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// PUT update profile
router.put('/me', auth, async (req, res) => {
  const { full_name, bio, city, phone, social_twitter, social_linkedin, social_github, social_tiktok, social_youtube, social_telegram } = req.body;
  if (!full_name) return res.status(400).json({ message: 'Nama wajib diisi' });
  try {
    const result = await pool.query(
      `UPDATE users SET full_name=$1, bio=$2, city=$3, phone=$4,
       social_twitter=$5, social_linkedin=$6, social_github=$7, social_tiktok=$8, social_youtube=$9, social_telegram=$10,
       updated_at=NOW()
       WHERE id=$11 RETURNING id, full_name, email, role, avatar, bio, city, phone, is_verified,
       social_twitter, social_linkedin, social_github, social_tiktok, social_youtube, social_telegram`,
      [full_name, bio||null, city||null, phone||null,
       social_twitter||null, social_linkedin||null, social_github||null, social_tiktok||null, social_youtube||null, social_telegram||null,
       req.user.id]
    );
    const user = result.rows[0];
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES });
    res.json({ message: 'Profil diperbarui!', user, token });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST upload avatar
router.post('/me/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'File tidak ditemukan' });
  try {
    const avatarUrl = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar=$1, updated_at=NOW() WHERE id=$2', [avatarUrl, req.user.id]);
    res.json({ message: 'Foto profil diperbarui!', avatar: avatarUrl });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET reviews untuk user
router.get('/:id/reviews', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, u.full_name as reviewer_name, u.avatar as reviewer_avatar
       FROM reviews r
       JOIN users u ON r.reviewer_id = u.id
       WHERE r.reviewed_id = $1
       ORDER BY r.created_at DESC`, [req.params.id]
    );
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;

// POST upload gambar untuk deskripsi listing
const imgStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `img_${req.user.id}_${Date.now()}${ext}`);
  }
});
const uploadImg = multer({
  storage: imgStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar'));
  }
});
router.post('/upload-image', auth, uploadImg.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File tidak ditemukan' });
    res.json({ url: `/uploads/images/${req.file.filename}` });
  } catch(e) { res.status(500).json({ message: e.message }); }
});
