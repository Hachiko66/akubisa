// ===== SOLANA + USDC — satu-satunya rel pembayaran AkuBisa =====
//
// KEPUTUSAN PRODUK (2026-11-23): Yuyun tidak punya akun layanan
// pembayaran fiat sama sekali, dan Pakasir sudah menutup layanan.
// Semua gateway fiat (Pakasir, Duitku, Xendit) DIHAPUS dari kode.
// Satu-satunya cara bayar adalah transfer USDC (stablecoin Solana)
// ke wallet escrow kustodial platform, lalu diverifikasi on-chain.
//
// ALUR:
// 1. Saat transaksi dibuat, kurs IDR->USDC DIKUNCI dari CoinGecko
//    (fallback: env USDC_IDR_FALLBACK_RATE) dan jumlah USDC untuk DP
//    dan pelunasan disimpan di baris transaksi. Pembayaran on-chain
//    HARUS cocok persis dengan jumlah yang terkunci itu.
// 2. Client mengirim USDC dari wallet-nya sendiri (Phantom dsb.) ke
//    alamat escrow, lalu menyerahkan signature transaksi ke backend.
// 3. Backend memverifikasi via Solana RPC: signature ada + confirmed,
//    transfer USDC ke alamat escrow, jumlah persis, dan satu signature
//    hanya dipakai sekali (tabel payment_signatures).
// 4. Dana mengendap di escrow sampai transaksi selesai (pelunasan /
//    auto-release / putusan dispute), lalu masuk saldo IDR worker.
//    Worker mencairkan saldo lewat withdraw: admin approve -> backend
//    mengirim USDC dari escrow ke alamat payout Solana worker.
//
// KEAMANAN KEYPAIR — BACA INI:
// - Alamat escrow dibaca dari env ESCROW_SOLANA_ADDRESS (public key,
//   aman ditampilkan ke client sebagai alamat tujuan bayar).
// - Private key TIDAK PERNAH ada di repo, di .env, atau di chat.
//   Keypair dimuat dari FILE di path env ESCROW_KEYPAIR_PATH (format
//   JSON array 64 byte ala Solana CLI), file mode 600, milik user
//   yang menjalankan backend. loadEscrowKeypair() di bawah adalah
//   SATU-SATUNYA tempat private key dibaca.
// - Keypair ini memegang DANA USER (semua escrow yang belum cair).
//   Siapa pun yang memegang file ini bisa mengosongkan escrow.
//   JANGAN pernah menyalinnya ke laptop lain, ke repo, ke backup
//   yang tidak terenkripsi, atau ke chat. Lihat docs/pembayaran-solana.md
//   untuk syarat pengelolaan sebelum go-live.
// - JANGAN buat keypair produksi di VM ini. Keypair DEV untuk tes lokal
//   hanya boleh hidup di /tmp dan berlabel jelas, tidak pernah di-commit.
//
// JARINGAN: default DEVNET (aman). Mainnet HANYA bila env
// SOLANA_NETWORK=mainnet-beta + SOLANA_RPC_URL + USDC_MINT mainnet
// diisi eksplisit. Jangan pernah mengarahkan kode ini ke mainnet
// dengan dana asli tanpa uji end-to-end di devnet terlebih dahulu.
const fs = require('fs');
const { Connection, PublicKey, Keypair, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction, TOKEN_PROGRAM_ID } = require('@solana/spl-token');

// --- Konfigurasi (env) ---
const NETWORK = process.env.SOLANA_NETWORK || 'devnet'; // 'devnet' | 'mainnet-beta'
const RPC_URL = process.env.SOLANA_RPC_URL
  || (NETWORK === 'mainnet-beta' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com');
const USDC_MINT = new PublicKey(process.env.USDC_MINT
  || (NETWORK === 'mainnet-beta'
    ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'   // USDC mainnet
    : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU')); // USDC devnet
const USDC_DECIMALS = 6;
const ESCROW_ADDRESS = process.env.ESCROW_SOLANA_ADDRESS || null;
const ESCROW_KEYPAIR_PATH = process.env.ESCROW_KEYPAIR_PATH || null;

// Kurs: CoinGecko gratis tanpa key (usd-coin vs IDR). Dipanggil hanya
// saat transaksi dibuat / withdraw diajukan — jauh di bawah limit.
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=idr';
// Pita kewarasan: tolak kurs di luar rentang ini (tanda API ngaco /
// serangan). USDC wajar ~Rp 15.000-17.000 (Nov 2026); pita longgar.
const RATE_MIN = 5000;
const RATE_MAX = 50000;

let _connection = null;
function getConnection() {
  if (!_connection) _connection = new Connection(RPC_URL, 'confirmed');
  return _connection;
}

function escrowAddress() {
  if (!ESCROW_ADDRESS) throw new Error('Pembayaran Solana belum dikonfigurasi (ESCROW_SOLANA_ADDRESS kosong).');
  return new PublicKey(ESCROW_ADDRESS);
}

// --- Validasi alamat Solana (base58, 32 byte) ---
function isValidSolanaAddress(addr) {
  if (typeof addr !== 'string' || !addr) return false;
  try { new PublicKey(addr); return true; }
  catch { return false; }
}

// --- Kurs IDR -> USDC ---
// Kembalikan { rate, source }: rate = Rupiah per 1 USDC.
// Sumber utama CoinGecko; bila gagal dan env fallback tersedia, pakai
// fallback (dengan log peringatan — kurs fallback bisa basi).
async function getUsdcIdrRate() {
  let rate = null;
  let source = null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(COINGECKO_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    const v = data?.['usd-coin']?.idr;
    if (Number.isFinite(v) && v > 0) { rate = v; source = 'coingecko'; }
  } catch (e) {
    console.warn('[solana] CoinGecko gagal:', e.message);
  }
  if (rate === null) {
    const fb = parseFloat(process.env.USDC_IDR_FALLBACK_RATE || '');
    if (Number.isFinite(fb) && fb > 0) {
      rate = fb; source = 'env-fallback';
      console.warn('[solana] kurs fallback env dipakai:', fb);
    }
  }
  if (rate === null) throw new Error('Kurs USDC/IDR tidak tersedia (CoinGecko gagal dan USDC_IDR_FALLBACK_RATE tidak diisi).');
  if (rate < RATE_MIN || rate > RATE_MAX) {
    throw new Error(`Kurs USDC/IDR di luar pita kewarasan (${rate}); dibatalkan demi keamanan.`);
  }
  return { rate, source };
}

// --- Konversi ---
// IDR -> micro-USDC (satuan terkecil USDC, 1 USDC = 1.000.000).
// Selalu dibulatkan KE ATAS supaya platform tidak pernah menerima
// kurang dari nilai Rupiah-nya (selisih < 1 micro-USDC ~ Rp 0,016).
function idrToMicroUsdc(idrAmount, rate) {
  const idr = parseInt(idrAmount, 10);
  if (!Number.isFinite(idr) || idr <= 0) throw new Error('idrToMicroUsdc: jumlah IDR tidak valid: ' + idrAmount);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('idrToMicroUsdc: kurs tidak valid: ' + rate);
  return Math.ceil((idr / rate) * 10 ** USDC_DECIMALS);
}
// micro-USDC -> IDR (untuk tampilan; dibulatkan ke bawah).
function microUsdcToIdr(microUsdc, rate) {
  return Math.floor((parseInt(microUsdc, 10) / 10 ** USDC_DECIMALS) * rate);
}
// Format jumlah micro-USDC jadi "12.345678 USDC" untuk tampilan.
function formatUsdc(microUsdc) {
  const v = parseInt(microUsdc, 10) / 10 ** USDC_DECIMALS;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 }) + ' USDC';
}

// --- Keypair escrow (SATU-SATUNYA tempat private key dibaca) ---
// Format file: JSON array 64 angka (secret key Solana CLI), mode 600.
// Jangan pernah log isi keypair. Bila file tidak ada / rusak, lempar
// error jelas — pembayaran dan withdraw GAGAL TERTUTUP (fail closed),
// bukan jalan tanpa kunci.
function loadEscrowKeypair() {
  if (!ESCROW_KEYPAIR_PATH) throw new Error('ESCROW_KEYPAIR_PATH belum diisi di .env — keypair escrow tidak ditemukan.');
  let raw;
  try { raw = fs.readFileSync(ESCROW_KEYPAIR_PATH, 'utf8'); }
  catch (e) { throw new Error('Keypair escrow tidak bisa dibaca dari ' + ESCROW_KEYPAIR_PATH + ': ' + e.message); }
  let secret;
  try { secret = Uint8Array.from(JSON.parse(raw)); }
  catch { throw new Error('Keypair escrow rusak: file bukan JSON array 64 byte.'); }
  if (secret.length !== 64) throw new Error('Keypair escrow rusak: panjang secret key harus 64 byte.');
  const kp = Keypair.fromSecretKey(secret);
  try {
    const mode = fs.statSync(ESCROW_KEYPAIR_PATH).mode & 0o777;
    if (mode & 0o077) console.warn(`[solana] PERINGATAN: keypair escrow ${ESCROW_KEYPAIR_PATH} mode ${mode.toString(8)} — batasi ke 600 (chmod 600).`);
  } catch { /* abaikan bila stat gagal */ }
  if (ESCROW_ADDRESS && kp.publicKey.toBase58() !== ESCROW_ADDRESS) {
    throw new Error('Keypair escrow TIDAK COCOK dengan ESCROW_SOLANA_ADDRESS — periksa .env (alamat vs file keypair).');
  }
  return kp;
}

// --- Verifikasi pembayaran on-chain ---
// Periksa satu signature transaksi: ada + confirmed, TIDAK gagal
// (meta.err null), dan mengandung transfer USDC ke `recipientAddress`
// sebesar `expectedMicroUsdc` (dihitung dari selisih saldo token ATA
// penerima sebelum/sesudah transaksi). `toleranceMicroUsdc` opsional
// (default 0 = harus persis; dipakai jalur manual admin saat kurs
// sempat bergeser antara pengiriman dan pencatatan).
// Kembalikan { ok: true, ... } atau { ok: false, reason } — jangan
// pernah throw untuk kasus "tidak cocok", supaya route bisa menjawab
// 400 yang ramah. Throw hanya untuk gangguan RPC.
async function verifyUsdcPayment({ signature, expectedMicroUsdc, recipientAddress, toleranceMicroUsdc = 0 }) {
  const conn = getConnection();
  const recipient = new PublicKey(recipientAddress);
  let tx;
  try {
    tx = await conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  } catch (e) {
    throw new Error('Gagal membaca transaksi dari RPC: ' + e.message);
  }
  if (!tx) return { ok: false, reason: 'Signature tidak ditemukan di jaringan Solana (belum confirmed atau salah jaringan — pastikan ' + NETWORK + ').' };
  if (tx.meta?.err) return { ok: false, reason: 'Transaksi on-chain GAGAL (meta.err: ' + JSON.stringify(tx.meta.err) + ').' };
  const expected = parseInt(expectedMicroUsdc, 10);
  const tolerance = parseInt(toleranceMicroUsdc, 10) || 0;
  const mint = USDC_MINT.toBase58();
  const pre = tx.meta?.preTokenBalances || [];
  const post = tx.meta?.postTokenBalances || [];
  for (const p of post) {
    if (p.mint !== mint || p.owner !== recipient.toBase58()) continue;
    const before = pre.find(b => b.accountIndex === p.accountIndex);
    const delta = parseInt(p.uiTokenAmount.amount, 10) - parseInt(before?.uiTokenAmount?.amount || '0', 10);
    if (Math.abs(delta - expected) <= tolerance) {
      return { ok: true, slot: tx.slot, amountMicroUsdc: delta };
    }
    return { ok: false, reason: `Jumlah USDC tidak cocok: diterima ${formatUsdc(delta)}, yang terkunci ${formatUsdc(expected)}${tolerance ? ' (±' + formatUsdc(tolerance) + ')' : ''}. Kirim persis jumlah yang terkunci.` };
  }
  return { ok: false, reason: 'Tidak ada transfer USDC ke alamat escrow di transaksi ini. Pastikan tujuan transfer adalah alamat escrow AkuBisa.' };
}

// --- Idempotency signature ---
// Satu signature hanya boleh dipakai sekali di SELURUH sistem
// (transaksi DP/final, produk digital, boost). Simpan di tabel
// payment_signatures (PK = signature). HARUS dipanggil di dalam
// transaksi DB yang sama dengan UPDATE status (client pg), dan
// hasilnya diperiksa: false = signature sudah pernah dipakai.
// Dipanggil SETELAH verifikasi on-chain lolos, supaya signature yang
// verifikasinya gagal masih bisa dicoba lagi.
async function reserveSignature(dbClient, signature, context, refId) {
  const res = await dbClient.query(`
    INSERT INTO payment_signatures (signature, context, ref_id)
    VALUES ($1, $2, $3)
    ON CONFLICT (signature) DO NOTHING
    RETURNING signature
  `, [signature, context, refId || null]);
  return res.rows.length > 0;
}

// --- Kirim USDC dari escrow (withdraw) ---
// Mengirim `microUsdc` dari wallet escrow ke `toAddress` (alamat payout
// worker). Membuat ATA penerima bila belum ada. Melempar error bila
// saldo escrow kurang atau pengiriman gagal — pemanggil HARUS
// membiarkan withdraw tetap 'pending' dan TIDAK menandainya approved.
// Kembalikan signature transaksi on-chain.
async function sendUsdc({ toAddress, microUsdc }) {
  const amount = parseInt(microUsdc, 10);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('sendUsdc: jumlah tidak valid: ' + microUsdc);
  if (!isValidSolanaAddress(toAddress)) throw new Error('sendUsdc: alamat tujuan tidak valid: ' + toAddress);
  const conn = getConnection();
  const escrow = loadEscrowKeypair();
  const recipient = new PublicKey(toAddress);

  const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrow.publicKey);
  const recipientAta = await getAssociatedTokenAddress(USDC_MINT, recipient);
  // Cek saldo escrow dulu supaya error-nya jelas (bukan "insufficient funds" mentah).
  const escBal = await conn.getTokenAccountBalance(escrowAta).catch(() => null);
  const escMicro = escBal ? parseInt(escBal.value.amount, 10) : 0;
  if (escMicro < amount) {
    throw new Error(`Saldo USDC escrow tidak cukup (${formatUsdc(escMicro)} tersedia, butuh ${formatUsdc(amount)}). Isi escrow dulu sebelum approve withdraw.`);
  }

  const ixs = [];
  const recipientInfo = await conn.getAccountInfo(recipientAta);
  if (!recipientInfo) {
    ixs.push(createAssociatedTokenAccountInstruction(escrow.publicKey, recipientAta, recipient, USDC_MINT));
  }
  ixs.push(createTransferInstruction(escrowAta, recipientAta, escrow.publicKey, amount, [], TOKEN_PROGRAM_ID));

  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(conn, tx, [escrow], { commitment: 'confirmed' });
  return sig;
}

// Saldo USDC escrow saat ini (micro-USDC), untuk panel admin / monitoring.
async function getEscrowUsdcBalance() {
  const conn = getConnection();
  const escrowAta = await getAssociatedTokenAddress(USDC_MINT, escrowAddress());
  const bal = await conn.getTokenAccountBalance(escrowAta).catch(() => null);
  return bal ? parseInt(bal.value.amount, 10) : 0;
}

module.exports = {
  NETWORK, RPC_URL, USDC_MINT, USDC_DECIMALS,
  getConnection, escrowAddress, isValidSolanaAddress,
  getUsdcIdrRate, idrToMicroUsdc, microUsdcToIdr, formatUsdc,
  loadEscrowKeypair, verifyUsdcPayment, reserveSignature,
  sendUsdc, getEscrowUsdcBalance,
};
