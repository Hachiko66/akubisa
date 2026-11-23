// ===== LEDGER — satu-satunya tempat uang bergerak di AkuBisa =====
//
// ATURAN UANG (jangan diubah tanpa keputusan produk):
// - Worker menerima total_amount PENUH saat transaksi selesai.
//   Fee platform 10% SUDAH dibebankan ke client di atas total_amount
//   (billed_amount = total_amount + platform_fee, lihat POST /api/transactions),
//   jadi TIDAK ada potongan dari worker. Aturan lama di admin dispute
//   (total_amount - platform_fee) SALAH: worker dipotong fee yang sudah
//   dibayar client — sudah diperbaiki ke aturan ini.
// - Semua jalur yang menyelesaikan transaksi (verifikasi on-chain
//   pelunasan USDC, auto-release, putusan dispute 'release', penjualan
//   produk digital) WAJIB memakai creditWorker() di bawah, supaya tidak
//   ada lagi tiga versi kredit yang berbeda.
// - Refund TIDAK menggerakkan uang keluar lewat gateway (tidak ada lagi
//   gateway fiat — Pakasir tutup, Duitku/Xendit dihapus).
//   Refund dicatat sebagai kredit klien (creditClient) sebesar DP yang
//   sudah dibayar; admin menindaklanjuti pencairannya secara manual.
//   Jangan pernah menandai 'refunded' tanpa mencatat kewajiban ini.
//
// Semua fungsi di sini idempotent di tingkat pemanggil: pemanggil HARUS
// memastikan baris yang dikredit sudah "terkunci" oleh UPDATE ber-guard
// status (mis. UPDATE ... WHERE status='submitted' RETURNING ...)
// dan hanya memanggil credit* untuk baris yang BERHASIL dikunci.
// Memanggil creditWorker dua kali untuk transaksi yang sama = double-credit.
async function creditWorker(pool, workerId, amount) {
  const amt = parseInt(amount, 10);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('creditWorker: amount tidak valid: ' + amount);
  await pool.query(`
    INSERT INTO worker_balances (worker_id, total_earned, balance)
    VALUES ($1, $2, $2)
    ON CONFLICT (worker_id) DO UPDATE SET
      total_earned = worker_balances.total_earned + $2,
      balance = worker_balances.balance + $2,
      updated_at = NOW()
  `, [workerId, amt]);
  return amt;
}

// Catat kredit klien (mis. refund dispute). Satu baris = satu kewajiban.
// status: 'available' (belum dipakai) | 'applied' (sudah dipakai) | 'voided' (dibatalkan).
// Pemakaian kredit saat checkout adalah pekerjaan lanjutan — sampai saat itu,
// kredit ini adalah kewajiban platform yang terlihat di tabel client_credits.
async function creditClient(pool, { userId, amount, transactionId = null, reason = '' }) {
  const amt = parseInt(amount, 10);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error('creditClient: amount tidak valid: ' + amount);
  const res = await pool.query(`
    INSERT INTO client_credits (user_id, transaction_id, amount, reason, status)
    VALUES ($1, $2, $3, $4, 'available')
    RETURNING *
  `, [userId, transactionId, amt, reason || null]);
  return res.rows[0];
}

// Badge worker dari jumlah transaksi completed. Dipakai setiap kali
// transaksi selesai (FINAL, auto-release, dispute release).
async function updateWorkerBadge(pool, workerId) {
  const wc = await pool.query(
    "SELECT COUNT(*) FROM transactions WHERE worker_id=$1 AND status='completed'",
    [workerId]
  );
  const n = parseInt(wc.rows[0].count, 10);
  const level = n >= 50 ? 'elite' : n >= 20 ? 'expert' : n >= 5 ? 'pro' : 'pemula';
  await pool.query('UPDATE users SET badge_level=$1 WHERE id=$2', [level, workerId]);
  return level;
}

module.exports = { creditWorker, creditClient, updateWorkerBadge };
