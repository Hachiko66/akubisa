const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');

const REASONS = ['spam','penipuan','konten tidak pantas','informasi palsu','lainnya'];

router.post('/', auth, async (req, res) => {
  const { reported_user_id, reported_listing_id, reason, description } = req.body;
  if (!reason || !REASONS.includes(reason))
    return res.status(400).json({ message: 'Alasan laporan tidak valid', valid_reasons: REASONS });
  if (!reported_user_id && !reported_listing_id)
    return res.status(400).json({ message: 'Pilih user atau listing yang dilaporkan' });
  try {
    await pool.query(
      `INSERT INTO reports (reporter_id, reported_user_id, reported_listing_id, reason, description)
       VALUES ($1,$2,$3,$4,$5)`,
      [req.user.id, reported_user_id||null, reported_listing_id||null, reason, description||null]
    );
    res.status(201).json({ message: 'Laporan berhasil dikirim. Tim kami akan meninjau dalam 1x24 jam.' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
