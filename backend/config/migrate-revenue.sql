-- ============================================================
-- MIGRASI PENDAPATAN (REVENUE) — AkuBisa (2026-11-23)
-- Jalankan SEKALI di database LIVE (VPS), mis:
--   psql "$DATABASE_URL" -f backend/config/migrate-revenue.sql
-- atau biarkan auto-migrate server.js (membaca config/schema.sql
-- tiap boot) yang menjalankannya — pernyataan di sini IDEMPOTEN,
-- aman di-run berulang kali. Isi file ini = blok yang sama di
-- backend/config/schema.sql (bagian "PENDAPATAN").
--
-- Isi:
-- 1. Kunci kurs 24 jam: kolom rate_locked_at di boost_orders +
--    digital_purchases (transactions sudah punya); baris lama
--    diisi dari created_at supaya masa berlakunya terhitung.
-- 2. Fee produk digital 5%: kolom platform_fee + total_amount
--    di digital_purchases.
-- 3. Biaya penarikan 1% (min Rp1.000, maks Rp10.000): kolom
--    fee_rp + fee_usdc di withdraw_requests.
-- 4. Membership Pro: tabel subscriptions.
-- ============================================================

-- 1. Kunci kurs 24 jam (rate_locked_at) untuk boost + produk digital
ALTER TABLE boost_orders ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMP;
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS rate_locked_at TIMESTAMP;
-- Baris lama: kunci dihitung sejak order/purchase dibuat.
UPDATE boost_orders SET rate_locked_at = created_at WHERE rate_locked_at IS NULL;
UPDATE digital_purchases SET rate_locked_at = created_at WHERE rate_locked_at IS NULL;

-- 2. Fee produk digital 5% (pembeli bayar harga + fee, penjual
--    terima harga penuh; fee mengendap di escrow)
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS platform_fee INT NOT NULL DEFAULT 0;
ALTER TABLE digital_purchases ADD COLUMN IF NOT EXISTS total_amount INT;
-- Baris lama (dibuat sebelum fee): total = harga (tanpa fee).
UPDATE digital_purchases SET total_amount = amount WHERE total_amount IS NULL;

-- 3. Biaya penarikan 1% (min Rp1.000, maks Rp10.000; 0 untuk Pro)
--    fee_rp: biaya dalam Rupiah (dihitung saat admin approve).
--    fee_usdc: nilai fee itu dalam micro-USDC pada kurs approve.
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fee_rp INT NOT NULL DEFAULT 0;
ALTER TABLE withdraw_requests ADD COLUMN IF NOT EXISTS fee_usdc BIGINT;

-- 4. Membership Pro (Rp49.000 / 30 hari)
--    status: 'pending' (menunggu verifikasi bayar USDC) | 'active'
--    (sudah bayar, berlaku sampai expires_at) | 'expired'
--    (tidak dipakai aktif — kedaluwarsa dibaca dari expires_at).
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan VARCHAR(20) NOT NULL DEFAULT 'pro' CHECK (plan IN ('pro')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired')),
  amount INT NOT NULL DEFAULT 49000,
  usdc_amount BIGINT,
  rate_idr_per_usdc NUMERIC(12,2),
  rate_locked_at TIMESTAMP,
  started_at TIMESTAMP,
  expires_at TIMESTAMP,
  tx_signature VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, plan, status, expires_at);
