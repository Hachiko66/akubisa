const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { sendEmailNotif } = require('../config/email');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const dir = '/var/www/akubisa/frontend/uploads/kyc/';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dir),
  filename: (req, file, cb) => cb(null, `kyc_${req.user.id}_${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/jpeg|jpg|png/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Hanya JPG/PNG'));
  }
});

// GET status KYC user sendiri
router.get('/status', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM kyc_submissions WHERE user_id=$1', [req.user.id]);
    res.json(result.rows[0] || null);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// POST submit KYC
router.post('/submit', auth, upload.fields([
  { name: 'ktp', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), async (req, res) => {
  try {
    const { full_name_ktp, nik } = req.body;
    if (!req.files?.ktp || !req.files?.selfie) return res.status(400).json({ message: 'KTP dan selfie wajib diupload' });
    const ktp_url = `/uploads/kyc/${req.files.ktp[0].filename}`;
    const selfie_url = `/uploads/kyc/${req.files.selfie[0].filename}`;

    const existing = await pool.query('SELECT * FROM kyc_submissions WHERE user_id=$1', [req.user.id]);
    if (existing.rows[0] && existing.rows[0].status === 'approved') {
      return res.status(400).json({ message: 'Identitas kamu sudah terverifikasi' });
    }

    await pool.query(`
      INSERT INTO kyc_submissions (user_id, ktp_url, selfie_url, full_name_ktp, nik, status, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        ktp_url=$2, selfie_url=$3, full_name_ktp=$4, nik=$5, status='pending', submitted_at=NOW(), admin_note=NULL
    `, [req.user.id, ktp_url, selfie_url, full_name_ktp || '', nik || '']);

    const admins = await pool.query("SELECT id FROM users WHERE role='admin'");
    for (const admin of admins.rows) {
      await pool.query(`
        INSERT INTO notifications (user_id, type, title, message, link)
        VALUES ($1,'kyc','🪪 KYC Baru','Ada pengajuan verifikasi identitas baru menunggu review.','/admin')
      `, [admin.id]);
    }

    res.json({ message: 'Pengajuan KYC berhasil! Admin akan mereview dalam 1x24 jam.' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ADMIN - GET list KYC
router.get('/admin/list', admin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const status = req.query.status || 'pending';
    const result = await pool.query(`
      SELECT k.*, u.full_name, u.email
      FROM kyc_submissions k
      JOIN users u ON k.user_id = u.id
      WHERE k.status=$1
      ORDER BY k.submitted_at DESC
    `, [status]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ADMIN - Approve
router.patch('/admin/:id/approve', admin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const kyc = await pool.query('SELECT * FROM kyc_submissions WHERE id=$1', [req.params.id]);
    if (!kyc.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    await pool.query(`UPDATE kyc_submissions SET status='approved', reviewed_at=NOW(), reviewed_by=$1, admin_note=$2 WHERE id=$3`, [req.user.id, req.body.note||'', req.params.id]);
    await pool.query('UPDATE users SET is_verified=true WHERE id=$1', [kyc.rows[0].user_id]);
    await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'kyc','✅ Identitas Terverifikasi!','Selamat! Identitas kamu telah diverifikasi. Badge terverifikasi kini tampil di profilmu.','#profile')`, [kyc.rows[0].user_id]);
    sendEmailNotif(kyc.rows[0].user_id, 'kyc_approved', {}, pool);
    res.json({ message: 'KYC disetujui!' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

// ADMIN - Reject
router.patch('/admin/:id/reject', admin, async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const kyc = await pool.query('SELECT * FROM kyc_submissions WHERE id=$1', [req.params.id]);
    if (!kyc.rows[0]) return res.status(404).json({ message: 'Tidak ditemukan' });
    const note = req.body.note || 'Dokumen tidak valid';
    await pool.query(`UPDATE kyc_submissions SET status='rejected', reviewed_at=NOW(), reviewed_by=$1, admin_note=$2 WHERE id=$3`, [req.user.id, note, req.params.id]);
    sendEmailNotif(kyc.rows[0].user_id, 'kyc_rejected', { note }, pool);
    await pool.query(`INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,'kyc','❌ KYC Ditolak','Pengajuan verifikasi ditolak. Alasan: ${note}. Silakan ajukan ulang.','#profile')`, [kyc.rows[0].user_id]);
    res.json({ message: 'KYC ditolak' });
  } catch(e) { res.status(500).json({ message: e.message }); }
});

module.exports = router;
