// ===== AKUBISA PRO — membership pekerja Rp49.000 / 30 hari =====
//
// Manfaat Pro (keputusan produk 2026-11-23):
// (a) Badge PRO di profil + listing.
// (b) Listing Pro tampil lebih dulu di Jelajahi dan di strip
//     "Talent untuk Diikuti" (di bawah listing yang di-Boost,
//     di atas yang non-Pro) — lihat listingController.getAll +
//     routes/social.js (discover).
// (c) BEBAS biaya penarikan (lihat routes/wallet.js + admin.js).
//
// Pembayaran mengikuti pola verify-payment yang sudah ada:
// subscribe mengunci kurs (usdc_amount + rate_idr_per_usdc +
// rate_locked_at di baris subscription), pembeli mengirim USDC ke
// escrow, lalu POST /verify-payment memverifikasi signature
// on-chain (utils/solana.js) dan mengaktifkan Pro 30 hari.
// TIDAK ada perpanjangan otomatis (tidak ada cron / auto-charge):
// masa aktif berakhir sendiri; member memperpanjang dengan
// subscribe lagi. TIDAK ada refund untuk sisa masa.
const router = require('express').Router();
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { getUsdcIdrRate, idrToMicroUsdc, formatUsdc, escrowAddress, verifyUsdcPayment, reserveSignature } = require('../utils/solana');
const { PRO_PRICE_RP, PRO_DURATION_DAYS, PRO_PLAN, rateLockExpiresAt, isRateLockExpired, isPro, getActiveProSubscription } = require('../utils/revenue');

// GET status Pro user saat ini
router.get('/status', auth, async (req, res) => {
  try {
    const sub = await getActiveProSubscription(pool, req.user.id);
    res.json({
      is_pro: !!sub,
      plan: sub ? PRO_PLAN : null,
      expires_at: sub ? sub.expires_at : null,
      price_rp: PRO_PRICE_RP,
      duration_days: PRO_DURATION_DAYS,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST langganan Pro — kunci kurs, kembalikan info bayar escrow.
// Bila sudah Pro: kembalikan status aktif (tidak membuat order baru).
// Bila ada order pending yang kuncinya masih berlaku: pakai ulang.
// Bila pending tapi kuncinya kedaluwarsa: segarkan dengan kurs baru.
router.post('/subscribe', auth, async (req, res) => {
  try {
    const active = await getActiveProSubscription(pool, req.user.id);
    if (active) {
      return res.json({
        message: 'Kamu sudah member Pro.',
        already_pro: true,
        expires_at: active.expires_at,
        price_rp: PRO_PRICE_RP,
      });
    }

    const existing = await pool.query(
      `SELECT * FROM subscriptions WHERE user_id=$1 AND plan=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1`,
      [req.user.id, PRO_PLAN]
    );
    let sub = existing.rows[0];
    if (sub && !isRateLockExpired(sub.rate_locked_at || sub.created_at)) {
      return res.json({
        message: 'Silakan kirim USDC ke alamat escrow, lalu verifikasi dengan signature transaksimu.',
        subscription_id: sub.id,
        escrow_address: escrowAddress().toBase58(),
        amount: PRO_PRICE_RP,
        amount_usdc: parseInt(sub.usdc_amount, 10),
        amount_usdc_display: formatUsdc(sub.usdc_amount),
        rate_idr_per_usdc: parseFloat(sub.rate_idr_per_usdc),
        rate_locked_at: sub.rate_locked_at,
        rate_locked_until: rateLockExpiresAt(sub.rate_locked_at || sub.created_at),
      });
    }

    let rateInfo;
    try { rateInfo = await getUsdcIdrRate(); }
    catch (e) { return res.status(503).json({ message: 'Pembayaran Solana belum siap: ' + e.message }); }
    const usdcAmount = idrToMicroUsdc(PRO_PRICE_RP, rateInfo.rate);

    if (sub) {
      // Segarkan order pending yang kuncinya kedaluwarsa.
      const upd = await pool.query(
        `UPDATE subscriptions SET usdc_amount=$1, rate_idr_per_usdc=$2, rate_locked_at=NOW() WHERE id=$3 RETURNING *`,
        [usdcAmount, rateInfo.rate, sub.id]
      );
      sub = upd.rows[0];
    } else {
      const ins = await pool.query(
        `INSERT INTO subscriptions (user_id, plan, status, amount, usdc_amount, rate_idr_per_usdc, rate_locked_at)
         VALUES ($1,$2,'pending',$3,$4,$5,NOW()) RETURNING *`,
        [req.user.id, PRO_PLAN, PRO_PRICE_RP, usdcAmount, rateInfo.rate]
      );
      sub = ins.rows[0];
    }

    res.json({
      message: 'Silakan kirim USDC ke alamat escrow, lalu verifikasi dengan signature transaksimu.',
      subscription_id: sub.id,
      escrow_address: escrowAddress().toBase58(),
      amount: PRO_PRICE_RP,
      amount_usdc: usdcAmount,
      amount_usdc_display: formatUsdc(usdcAmount),
      rate_idr_per_usdc: rateInfo.rate,
      rate_locked_at: sub.rate_locked_at,
      rate_locked_until: rateLockExpiresAt(sub.rate_locked_at),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// POST verifikasi pembayaran Pro (member menyerahkan signature).
// Pola yang sama dengan transaksi/boost/produk digital: verifikasi
// on-chain dulu, lalu kunci signature + aktifkan dalam satu
// transaksi DB. Masa aktif 30 hari dihitung dari verifikasi lolos.
router.post('/verify-payment', auth, async (req, res) => {
  const { subscription_id, signature } = req.body;
  if (typeof signature !== 'string' || signature.length < 80 || signature.length > 90) {
    return res.status(400).json({ message: 'Signature transaksi Solana tidak valid.' });
  }
  const client = await pool.connect();
  try {
    const sRes = await client.query(
      'SELECT * FROM subscriptions WHERE id=$1 AND user_id=$2',
      [subscription_id, req.user.id]
    );
    const s = sRes.rows[0];
    if (!s) return res.status(404).json({ message: 'Langganan tidak ditemukan' });
    if (s.status === 'active') return res.json({ message: 'Pro sudah aktif.', expires_at: s.expires_at });
    if (s.status !== 'pending') return res.status(400).json({ message: 'Status langganan tidak valid.' });
    const expected = parseInt(s.usdc_amount, 10);
    if (!Number.isFinite(expected) || expected <= 0) {
      return res.status(400).json({ message: 'Langganan ini dibuat sebelum migrasi (tidak ada jumlah USDC terkunci). Hubungi admin.' });
    }
    // KUNCI KURS 24 JAM: tolak sebelum verifikasi on-chain.
    if (isRateLockExpired(s.rate_locked_at || s.created_at)) {
      return res.status(400).json({ message: 'Kurs sudah berubah, silakan tutup dan buka lagi pembayaran untuk kurs terbaru.' });
    }

    let v;
    try {
      v = await verifyUsdcPayment({ signature, expectedMicroUsdc: expected, recipientAddress: escrowAddress().toBase58() });
    } catch (e) {
      return res.status(503).json({ message: e.message });
    }
    if (!v.ok) return res.status(400).json({ message: v.reason });

    await client.query('BEGIN');
    const reserved = await reserveSignature(client, signature, 'pro', s.id);
    if (!reserved) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Signature ini sudah pernah dipakai untuk pembayaran lain.' });
    }
    const upd = await client.query(
      `UPDATE subscriptions SET status='active', started_at=NOW(),
         expires_at=NOW() + ($1 || ' days')::interval, tx_signature=$2
       WHERE id=$3 AND status='pending' RETURNING *`,
      [PRO_DURATION_DAYS, signature, s.id]
    );
    if (!upd.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Langganan sudah diproses.' });
    }
    const activated = upd.rows[0];
    await client.query(`
      INSERT INTO notifications (user_id, type, title, message, link)
      VALUES ($1,'system','⭐ Selamat datang di AkuBisa Pro!','Membership Pro aktif 30 hari: badge PRO, listing tampil lebih dulu, dan bebas biaya penarikan.','#profile')
    `, [req.user.id]);
    await client.query('COMMIT');
    res.json({ message: `AkuBisa Pro aktif selama ${PRO_DURATION_DAYS} hari!`, signature, expires_at: activated.expires_at });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* abaikan */ }
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
});

module.exports = router;
