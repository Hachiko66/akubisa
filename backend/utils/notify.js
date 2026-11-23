// ===================================================
// NOTIFIKASI IN-APP — helper bersama (best-effort)
// ===================================================
// Dipakai semua route yang perlu memberitahu user lain
// (pesan, lamaran, follow/like/komentar, status transaksi).
// TIDAK PERNAH melempar: gagal insert tidak boleh merusak
// aksi utama (kirim pesan, apply, like, dsb).
// Kolom: notifications(user_id, type, title, message, link)
//   type: message | job | social | transaction | wallet | review
//         | kyc | listing | broadcast | system
//   link: hash halaman tujuan, mis. '#messages', '#feed',
//         '#transactions', '#wallet', '#job-requests'.
const pool = require('../config/db');

async function notifyUser(userId, { type, title, body, link = null } = {}) {
  if (!userId || !title) return;
  try {
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES ($1,$2,$3,$4,$5)',
      [userId, type || 'system', title, body || null, link]
    );
  } catch (e) { console.error('Notif error:', e.message); }
}

module.exports = { notifyUser };
