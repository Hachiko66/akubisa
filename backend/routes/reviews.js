const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');

// GET reviews untuk user tertentu
router.get('/user/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT r.*,
        u.full_name as reviewer_name,
        u.avatar as reviewer_avatar,
        l.title as listing_title
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      LEFT JOIN listings l ON r.listing_id = l.id
      WHERE r.reviewed_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total,
        ROUND(AVG(rating),1) as avg_rating,
        COUNT(CASE WHEN rating=5 THEN 1 END) as five,
        COUNT(CASE WHEN rating=4 THEN 1 END) as four,
        COUNT(CASE WHEN rating=3 THEN 1 END) as three,
        COUNT(CASE WHEN rating=2 THEN 1 END) as two,
        COUNT(CASE WHEN rating=1 THEN 1 END) as one
      FROM reviews WHERE reviewed_id = $1
    `, [req.params.id]);

    res.json({ reviews: result.rows, stats: stats.rows[0] });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST buat review baru
router.post('/', auth, async (req, res) => {
  const { reviewed_id, listing_id, rating, comment } = req.body;
  if (!reviewed_id || !rating) return res.status(400).json({ message: 'User dan rating wajib diisi' });
  if (rating < 1 || rating > 5) return res.status(400).json({ message: 'Rating harus antara 1-5' });
  if (parseInt(reviewed_id) === req.user.id) return res.status(400).json({ message: 'Tidak bisa review diri sendiri' });
  try {
    // Cek apakah sudah pernah review listing ini
    if (listing_id) {
      const exists = await pool.query(
        'SELECT id FROM reviews WHERE reviewer_id=$1 AND listing_id=$2',
        [req.user.id, listing_id]
      );
      if (exists.rows.length > 0) return res.status(409).json({ message: 'Kamu sudah memberikan ulasan untuk penawaran ini' });
    }
    const result = await pool.query(`
      INSERT INTO reviews (reviewer_id, reviewed_id, listing_id, rating, comment)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
    `, [req.user.id, reviewed_id, listing_id||null, rating, comment||null]);
    res.status(201).json({ message: 'Ulasan berhasil dikirim!', review: result.rows[0] });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// DELETE hapus review milik sendiri
router.delete('/:id', auth, async (req, res) => {
  try {
    const check = await pool.query('SELECT reviewer_id FROM reviews WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Review tidak ditemukan' });
    if (check.rows[0].reviewer_id !== req.user.id) return res.status(403).json({ message: 'Tidak diizinkan' });
    await pool.query('DELETE FROM reviews WHERE id=$1', [req.params.id]);
    res.json({ message: 'Ulasan dihapus!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
