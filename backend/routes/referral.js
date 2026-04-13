const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const auth = require('../middleware/auth');

// GET my referral code & stats
router.get('/my', auth, async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT referral_code FROM users WHERE id=$1', [req.user.id]
    );
    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT u.id) as total_referred,
        COUNT(DISTINCT CASE WHEN ref.status='paid' THEN ref.id END) as paid_referrals,
        COALESCE(SUM(CASE WHEN ref.status='paid' THEN ref.commission_amount END), 0) as total_commission
      FROM users u
      LEFT JOIN referrals ref ON ref.referrer_id = $1
      WHERE u.referred_by = $1
    `, [req.user.id]);

    const referred = await pool.query(`
      SELECT u.full_name, u.created_at, u.avatar
      FROM users u
      WHERE u.referred_by = $1
      ORDER BY u.created_at DESC LIMIT 10
    `, [req.user.id]);

    res.json({
      referral_code: user.rows[0]?.referral_code,
      referral_url: `https://akubisa.co/r/${user.rows[0]?.referral_code}`,
      stats: stats.rows[0],
      referred_users: referred.rows
    });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Validate referral code saat register
router.get('/validate/:code', async (req, res) => {
  try {
    const user = await pool.query(
      'SELECT id, full_name FROM users WHERE referral_code = UPPER($1)',
      [req.params.code]
    );
    if (!user.rows.length) return res.status(404).json({ valid: false, message: 'Kode referral tidak valid' });
    res.json({ valid: true, referrer: user.rows[0].full_name });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
