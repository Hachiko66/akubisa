const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/search', async (req, res) => {
  const { q = '', limit = 20 } = req.query;
  try {
    const result = await pool.query(`
      SELECT u.id, u.full_name, u.avatar, u.bio, u.city, u.is_verified, u.badge_level,
             COUNT(DISTINCT l.id) as listing_count,
             COALESCE(AVG(r.rating), 0) as avg_rating,
             COUNT(DISTINCT t.id) as completed_transactions
      FROM users u
      LEFT JOIN listings l ON l.user_id = u.id AND l.is_active = true
      LEFT JOIN reviews r ON r.reviewed_id = u.id
      LEFT JOIN transactions t ON t.worker_id = u.id AND t.status = 'completed'
      WHERE u.role = 'worker' AND u.email_verified = true
        AND ($1 = '' OR u.full_name ILIKE $2 OR u.bio ILIKE $2 OR u.city ILIKE $2)
      GROUP BY u.id
      ORDER BY COUNT(DISTINCT t.id) DESC, COUNT(DISTINCT l.id) DESC
      LIMIT $3
    `, [q, '%' + q + '%', parseInt(limit)]);
    res.json({ users: result.rows });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
