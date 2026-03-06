const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.id as bookmark_id, b.created_at as bookmarked_at,
             l.*, c.name as category_name, c.slug as category_slug, c.icon as category_icon,
             u.full_name, u.avatar, u.is_verified, u.city as user_city
      FROM bookmarks b
      JOIN listings l ON b.listing_id = l.id
      LEFT JOIN categories c ON l.category_id = c.id
      LEFT JOIN users u ON l.user_id = u.id
      WHERE b.user_id = $1 AND l.is_active = true
      ORDER BY b.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.post('/:listing_id', auth, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO bookmarks (user_id, listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.listing_id]
    );
    res.json({ message: 'Disimpan ke bookmark!', bookmarked: true });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.delete('/:listing_id', auth, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM bookmarks WHERE user_id=$1 AND listing_id=$2',
      [req.user.id, req.params.listing_id]
    );
    res.json({ message: 'Dihapus dari bookmark!', bookmarked: false });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.get('/check/:listing_id', auth, async (req, res) => {
  try {
    const r = await pool.query(
      'SELECT id FROM bookmarks WHERE user_id=$1 AND listing_id=$2',
      [req.user.id, req.params.listing_id]
    );
    res.json({ bookmarked: r.rows.length > 0 });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
