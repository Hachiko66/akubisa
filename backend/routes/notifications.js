const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    const unread = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false',
      [req.user.id]
    );
    res.json({ notifications: result.rows, unread_count: parseInt(unread.rows[0].count) });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/read-all', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true WHERE user_id=$1', [req.user.id]);
    res.json({ message: 'Semua notifikasi ditandai dibaca' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.patch('/:id/read', auth, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET is_read=true WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]);
    res.json({ message: 'OK' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE id=$1 AND user_id=$2',
      [req.params.id, req.user.id]);
    res.json({ message: 'Notifikasi dihapus' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// Helper: buat notifikasi (dipakai route lain)
const createNotif = async (userId, type, title, message, link=null) => {
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5)',
      [userId, type, title, message, link]
    );
  } catch(e) { console.error('Notif error:', e.message); }
};

module.exports = router;
module.exports.createNotif = createNotif;
