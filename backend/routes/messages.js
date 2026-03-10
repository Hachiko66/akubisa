const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { sendEmailNotif } = require('../config/email');

// GET semua conversation user
router.get('/conversations', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*,
        CASE WHEN c.user1_id = $1 THEN u2.full_name ELSE u1.full_name END as other_name,
        CASE WHEN c.user1_id = $1 THEN u2.avatar ELSE u1.avatar END as other_avatar,
        CASE WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END as other_id,
        l.title as listing_title,
        (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.receiver_id = $1 AND m.is_read = false) as unread_count
      FROM conversations c
      JOIN users u1 ON c.user1_id = u1.id
      JOIN users u2 ON c.user2_id = u2.id
      LEFT JOIN listings l ON c.listing_id = l.id
      WHERE c.user1_id = $1 OR c.user2_id = $1
      ORDER BY c.last_message_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// GET messages dalam conversation
router.get('/conversations/:id', auth, async (req, res) => {
  try {
    // Tandai pesan sebagai dibaca
    await pool.query(
      'UPDATE messages SET is_read=true WHERE conversation_id=$1 AND receiver_id=$2',
      [req.params.id, req.user.id]
    );
    const msgs = await pool.query(`
      SELECT m.*, u.full_name as sender_name, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at ASC
    `, [req.params.id]);
    res.json(msgs.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST kirim pesan (buat conversation jika belum ada)
router.post('/send', auth, async (req, res) => {
  const { receiver_id, content, listing_id } = req.body;
  if (!receiver_id || !content?.trim()) return res.status(400).json({ message: 'Penerima dan pesan wajib diisi' });
  if (parseInt(receiver_id) === req.user.id) return res.status(400).json({ message: 'Tidak bisa kirim pesan ke diri sendiri' });
  try {
    const u1 = Math.min(req.user.id, receiver_id);
    const u2 = Math.max(req.user.id, receiver_id);
    // Buat atau ambil conversation
    let conv = await pool.query(
      'SELECT id FROM conversations WHERE user1_id=$1 AND user2_id=$2', [u1, u2]
    );
    let convId;
    if (conv.rows.length === 0) {
      const newConv = await pool.query(
        'INSERT INTO conversations (user1_id, user2_id, listing_id, last_message, last_message_at) VALUES ($1,$2,$3,$4,NOW()) RETURNING id',
        [u1, u2, listing_id||null, content.trim()]
      );
      convId = newConv.rows[0].id;
    } else {
      convId = conv.rows[0].id;
      await pool.query(
        'UPDATE conversations SET last_message=$1, last_message_at=NOW() WHERE id=$2',
        [content.trim(), convId]
      );
    }
    // Simpan pesan
    const msg = await pool.query(
      'INSERT INTO messages (sender_id, receiver_id, conversation_id, content) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.user.id, receiver_id, convId, content.trim()]
    );
    res.status(201).json({ message: 'Pesan terkirim!', data: msg.rows[0], conversation_id: convId });
    // Kirim email notif ke penerima (fire and forget)
    const sender = await pool.query('SELECT full_name FROM users WHERE id=$1', [req.user.id]);
    sendEmailNotif(receiver_id, 'new_message', {
      senderName: sender.rows[0]?.full_name || 'Seseorang',
      preview: content.trim().slice(0, 100)
    }, pool);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
