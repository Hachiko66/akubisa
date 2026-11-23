// ===== PENDAPATAN PLATFORM (REVENUE) — satu sumber kebenaran =====
//
// Semua angka pemasukan AkuBisa didefinisikan di sini (keputusan
// produk Yuyun 2026-11-23) supaya backend + frontend + dokumen
// tidak punya tiga versi angka yang berbeda:
// - Fee transaksi 5% (client, di atas harga worker) — sudah ada
//   di routes/transactions.js (PLATFORM_FEE); angka di sini hanya
//   cerminan untuk dipakai jalur lain (produk digital).
// - Fee produk digital 5% (pembeli, di atas harga): penjual tetap
//   menerima harga penuh; fee-nya mengendap di escrow sebagai
//   pemasukan platform (sama seperti fee transaksi).
// - Biaya penarikan 1% dari jumlah withdraw, min Rp1.000, maks
//   Rp10.000; dipotong dari jumlah yang dikirim ke worker (fee TIDAK
//   dikirim, tetap di escrow). Member Pro BEBAS biaya penarikan.
// - AkuBisa Pro Rp49.000 / 30 hari (lihat routes/pro.js).
// - Kunci kurs IDR->USDC berlaku 24 JAM sejak rate_locked_at:
//   kurs bisa bergeser; klien yang menunda bayar berhari-hari tidak
//   boleh membayar dengan kurs lama (selisihnya ditanggung platform).
//   verify-payment menolak kunci kedaluwarsa; payment-info /
//   pemesanan ulang menyegarkan kunci dengan kurs terbaru.
const pool = require('../config/db');

// --- Kunci kurs: masa berlaku 24 jam ---
const RATE_LOCK_TTL_MS = 24 * 60 * 60 * 1000;

function rateLockExpiresAt(lockedAt) {
  if (!lockedAt) return null;
  const t = new Date(lockedAt).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + RATE_LOCK_TTL_MS);
}

// true bila kunci sudah lewat 24 jam. Baris lama tanpa rate_locked_at
// (sebelum migrasi) dianggap TIDAK kedaluwarsa supaya tidak memblokir
// pembayaran yang sudah berjalan — migrasi mengisi rate_locked_at
// dari created_at untuk baris-baris itu.
function isRateLockExpired(lockedAt, nowMs = Date.now()) {
  const exp = rateLockExpiresAt(lockedAt);
  if (!exp) return false;
  return nowMs > exp.getTime();
}

// --- Fee produk digital: 5% dari harga, dibulatkan ke atas ---
const DIGITAL_FEE_PERCENT = 5;
function calcDigitalFee(priceRp) {
  const p = parseInt(priceRp, 10);
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Math.ceil((p * DIGITAL_FEE_PERCENT) / 100);
}

// --- Biaya penarikan: 1%, min Rp1.000, maks Rp10.000 ---
const WITHDRAW_FEE_PERCENT = 1;
const WITHDRAW_FEE_MIN_RP = 1000;
const WITHDRAW_FEE_MAX_RP = 10000;
function calcWithdrawFee(amountRp) {
  const a = parseInt(amountRp, 10);
  if (!Number.isFinite(a) || a <= 0) return 0;
  return Math.min(WITHDRAW_FEE_MAX_RP, Math.max(WITHDRAW_FEE_MIN_RP, Math.round((a * WITHDRAW_FEE_PERCENT) / 100)));
}

// --- AkuBisa Pro ---
const PRO_PRICE_RP = 49000;
const PRO_DURATION_DAYS = 30;
const PRO_PLAN = 'pro';

// Aktif bila ada subscription Pro dengan status active dan
// expires_at masih di masa depan. Pengecekan malas (lazy): tidak
// ada cron yang menonaktifkan — masa berakhir dibaca apa adanya.
// Defensive: bila tabel belum ada (sebelum migrasi) atau DB error,
// kembalikan false supaya /me dan jalur lain tidak 500.
async function isPro(db, userId) {
  if (!userId) return false;
  try {
    const r = await db.query(
      `SELECT 1 FROM subscriptions
        WHERE user_id=$1 AND plan=$2 AND status='active' AND expires_at > NOW()
        LIMIT 1`,
      [userId, PRO_PLAN]
    );
    return r.rows.length > 0;
  } catch (e) {
    return false;
  }
}

// Baris subscription Pro aktif (untuk menampilkan expires_at).
async function getActiveProSubscription(db, userId) {
  try {
    const r = await db.query(
      `SELECT * FROM subscriptions
        WHERE user_id=$1 AND plan=$2 AND status='active' AND expires_at > NOW()
        ORDER BY expires_at DESC LIMIT 1`,
      [userId, PRO_PLAN]
    );
    return r.rows[0] || null;
  } catch (e) {
    return null;
  }
}

module.exports = {
  RATE_LOCK_TTL_MS,
  rateLockExpiresAt,
  isRateLockExpired,
  DIGITAL_FEE_PERCENT,
  calcDigitalFee,
  WITHDRAW_FEE_PERCENT,
  WITHDRAW_FEE_MIN_RP,
  WITHDRAW_FEE_MAX_RP,
  calcWithdrawFee,
  PRO_PRICE_RP,
  PRO_DURATION_DAYS,
  PRO_PLAN,
  isPro,
  getActiveProSubscription,
};
