const router = require('express').Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COUNT(l.id) as listing_count
      FROM categories c LEFT JOIN listings l ON l.category_id = c.id AND l.is_active=true
      GROUP BY c.id ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
