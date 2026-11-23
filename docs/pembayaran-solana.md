# Pembayaran AkuBisa — Solana + USDC (Escrow Kustodial)

> Keputusan final Yuyun, 2026-11-23 10:46 WIB. Semua gateway fiat
> (Pakasir, Duitku, Xendit) **dihapus dari kode** — Pakasir menutup
> layanan dan Yuyun tidak punya akun gateway fiat lain. Satu-satunya
> rel pembayaran adalah **Solana + USDC**.

## 1. Ringkasan

| Aspek | Aturan |
|---|---|
| Rel bayar | Transfer USDC (SPL token) di Solana ke wallet escrow platform |
| Harga di sistem | Tetap **Rupiah (Rp)** — USDC hanya alat bayar |
| Fee platform | **5%** dari nilai transaksi, dibebankan ke **client** di atas harga worker (sempat 10% di ronde crypto, dikembalikan ke 5% per keputusan produk 2026-11-23). Default bisa di-override env `PLATFORM_FEE_PERCENT` |
| Fee produk digital | **5%** dari harga, dibebankan ke **pembeli** di atas harga; penjual menerima harga penuh, fee mengendap di escrow |
| Biaya penarikan | **1%** dari jumlah withdraw (min Rp1.000, maks Rp10.000); dipotong dari yang dikirim, fee tetap di escrow; **gratis untuk member Pro** |
| AkuBisa Pro | **Rp49.000 / 30 hari**: badge PRO, listing tampil lebih dulu, bebas biaya penarikan |
| Masa berlaku kunci kurs | **24 jam** sejak `rate_locked_at`; kunci kedaluwarsa ditolak verify-payment, disegarkan saat pembayaran dibuka lagi |
| DP | 50% dari tagihan (harga + fee); pelunasan 50% sisanya |
| Minimum transaksi | Rp 10.000 (tetap) |
| Minimum withdraw | Rp 50.000 (tetap) |
| Jendela auto-release | 7 hari setelah worker submit tanpa respon client (tetap) |
| Jaringan default | **devnet** (aman). Mainnet hanya via env eksplisit |

## 2. Arsitektur escrow kustodial

```
Client (wallet sendiri, mis. Phantom)
   │ kirim USDC persis jumlah terkunci
   ▼
Wallet ESCROW platform  ← alamat publik di env ESCROW_SOLANA_ADDRESS
   │ dana mengendap sampai transaksi selesai
   │   (pelunasan / auto-release 7 hari / putusan dispute 'release')
   ▼
Saldo IDR worker (worker_balances)  ← total_amount penuh, tanpa potongan fee
   │ worker request withdraw
   ▼
Admin approve → backend kirim USDC dari escrow ke alamat payout Solana worker
```

- **Escrow kustodial**: platform memegang dana client di wallet escrow
  sampai pekerjaan selesai. Ini yang membuat perlindungan escrow dan
  dispute bermakna — dan ini juga yang membuat keypair escrow menjadi
  aset paling sensitif di sistem (lihat §7).
- **Saldo internal tetap Rupiah.** USDC hanya bergerak on-chain saat
  (a) client membayar ke escrow dan (b) admin mencairkan withdraw.
  Semua pembukuan (saldo worker, fee, kredit) dalam Rupiah.
- **Tidak ada lagi webhook/hosted payment page.** Client membayar dari
  wallet-nya sendiri, lalu menyerahkan *signature* transaksi ke backend
  untuk diverifikasi.

## 3. Penguncian kurs (rate lock)

- Saat transaksi/order dibuat, backend mengambil kurs **IDR per 1 USDC**
  dari **CoinGecko** (`usd-coin` vs `idr`, gratis tanpa key). Bila
  CoinGecko gagal dan env `USDC_IDR_FALLBACK_RATE` terisi, dipakai kurs
  fallback (dengan peringatan di log). Bila keduanya tidak ada,
  pembuatan transaksi **gagal tertutup (503)** — transaksi tanpa kurs
  terkunci tidak boleh dibuat.
- Kurs ditolak bila di luar pita kewarasan **Rp 5.000–50.000/USDC**
  (tanda API ngaco).
- Jumlah USDC disimpan sebagai **micro-USDC** (integer, 1 USDC =
  1.000.000) di kolom `*_usdc_amount`, dibulatkan **ke atas** supaya
  platform tidak pernah menerima kurang dari nilai Rupiah-nya
  (selisih < 1 micro-USDC ≈ Rp 0,016).
- Kurs + waktu penguncian disimpan di baris transaksi
  (`usdc_rate_locked`, `rate_locked_at`). **Verifikasi pembayaran
  on-chain harus cocok persis dengan jumlah yang terkunci itu.**
- Produk digital dan boost mengunci kurs dengan cara yang sama saat
  order dibuat. Produk digital dikenai fee **5%** (keputusan produk
  2026-11-23): pembeli membayar harga + 5%, penjual menerima harga
  penuh; fee mengendap di escrow sebagai pemasukan platform.

## 4. Verifikasi pembayaran on-chain

`backend/utils/solana.js` — `verifyUsdcPayment()`:

1. Ambil transaksi dari Solana RPC (`getTransaction`, commitment
   `confirmed`, jaringan sesuai env `SOLANA_NETWORK`).
2. Signature harus ada; transaksi harus **sukses** (`meta.err` null).
3. Cari di `postTokenBalances` transfer token **USDC** (mint sesuai
   jaringan) ke **alamat escrow**; selisih saldo sebelum/sesudah
   (`preTokenBalances` → `postTokenBalances`) harus **sama persis**
   dengan jumlah micro-USDC yang terkunci.
4. **Satu signature hanya dipakai sekali** di seluruh sistem
   (tabel `payment_signatures`, PK = signature; diisi dalam transaksi
   DB yang sama dengan perubahan status, jadi verifikasi ganda /
   pemakaian ulang ditolak — 409).

Kegagalan verifikasi (jumlah salah, tujuan salah, transaksi gagal,
signature tidak ditemukan) dijawab 400 dengan alasan yang jelas —
dana client tidak hilang: ia bisa mengirim ulang jumlah yang benar
atau menghubungi admin.

## 5. State machine transaksi (TETAP)

```
waiting_dp → dp_paid → submitted → waiting_final → completed
                │            │             │
                └─ dispute ──┴─ dispute ───┘
                                  disputed → completed (release)
                                           → refunded (kredit klien)
submitted ──(7 hari tanpa respon)──▶ completed (auto-release, job tiap 15 mnt)
```

- Auto-release: job `setInterval` tiap 15 menit di `server.js`
  (`autoReleaseDueTransactions`) — UPDATE ber-guard
  `WHERE status='submitted' AND auto_release_at <= NOW()`, kredit
  worker hanya untuk baris yang berhasil dikunci (idempotent).
- Dispute `release`: worker dikredit `total_amount` penuh.
- Dispute `refund`: **tidak ada refund otomatis** (tidak ada gateway
  fiat yang bisa me-refund). Refund dicatat sebagai **kredit klien**
  (`client_credits`, sebesar DP yang dibayar, dalam Rupiah). USDC yang
  sudah masuk escrow tetap di escrow sampai admin mencairkan kredit
  itu — bila client minta uangnya kembali dalam USDC, admin mengirim
  dari escrow sebesar kredit/kurs saat itu dan mencatatnya.
  Pemakaian kredit di checkout adalah pekerjaan lanjutan.

## 6. Withdraw (pencairan worker)

1. Worker mengisi **alamat payout Solana** di profil
   (`users.solana_address`, divalidasi base58 32-byte; tidak tampil
   di profil publik).
2. Worker request withdraw (jumlah Rupiah, min **Rp 50.000**). Saldo
   dibekukan. Alamat payout **di-snapshot** di baris
   `withdraw_requests` (bila worker mengganti alamat profil setelah
   request, dana tetap ke alamat yang ia konfirmasi saat request).
   Kurs saat request dihitung sebagai **estimasi tampilan** saja
   (`usdc_estimate`).
3. Admin approve → backend **mengunci kurs saat itu** (momen transfer)
   dan mengirim USDC dari escrow ke alamat snapshot
   (`sendUsdc()` — membuat ATA penerima bila belum ada, cek saldo
   escrow dulu). Bila pengiriman gagal (saldo escrow kurang / RPC
   down / keypair belum dikonfigurasi), request **tetap `pending`** —
   tidak ditandai approved — supaya bisa dicoba lagi.
4. **Fallback manual:** bila admin mengirim USDC manual dari wallet
   escrow (mis. RPC backend down), admin mencatat signature lewat
   `POST /admin/withdrawals/:id/record-tx`. Signature **tetap
   diverifikasi on-chain** (transfer USDC ke alamat payout, jumlah
   dalam toleransi ±2% dari yang seharusnya pada kurs saat itu).
5. Admin reject → saldo dikembalikan (tidak berubah dari dulu).

## 7. Keypair escrow — SYARAT PENGELOLAAN (baca sebelum go-live)

> ⚠️ **Keypair escrow memegang dana user.** Siapa pun yang memegang
> file keypair bisa mengosongkan seluruh escrow. Kehilangan atau
> kebocoran keypair = kehilangan dana user yang belum dicairkan.

- **Private key TIDAK PERNAH ada di repo, di `.env`, di backup chat,
  atau di screenshot.** Hanya **path file** yang ada di env
  (`ESCROW_KEYPAIR_PATH`); file-nya sendiri hidup di VPS di luar repo.
- File keypair: format JSON array 64 byte (Solana CLI), **mode 600**
  (`chmod 600`), milik user yang menjalankan backend (PM2/root).
  Backend memperingatkan di log bila mode-nya terlalu terbuka, dan
  **menolak jalan** bila alamat publik keypair tidak cocok dengan
  `ESCROW_SOLANA_ADDRESS`.
- **Pembuatan keypair produksi** (sekali saja, oleh Yuyun / orang yang
  dipercaya, di mesin yang aman):
  1. Di VPS (atau mesin offline), jalankan
     `solana-keygen new --outfile /var/www/akubisa/escrow-keypair.json`
     (atau `npx @solana/web3.js` script sekali pakai — jangan simpan
     script-nya di repo).
  2. `chmod 600` file tersebut; catat **alamat publiknya** ke
     `ESCROW_SOLANA_ADDRESS` di `.env` VPS.
  3. **Backup seed phrase / file keypair di tempat terenkripsi yang
     terpisah dari VPS** (mis. password manager + kertas di brankas).
     Bila VPS hilang tanpa backup, dana escrow **tidak bisa
     diselamatkan**.
  4. **Jangan pernah** mengirim file/seed phrase lewat chat, email,
     atau menyimpannya di Google Drive tanpa enkripsi.
  5. Jangan memakai keypair ini untuk hal lain (bukan wallet pribadi).
- **JANGAN buat keypair produksi di VM ini / di repo ini.** Keypair
  DEV untuk tes lokal hanya boleh hidup di `/tmp`, berlabel jelas,
  dan tidak pernah di-commit.
- Bila keypair dicurigai bocor: segera pindahkan dana escrow ke wallet
  baru (dari mesin aman), ganti `ESCROW_KEYPAIR_PATH` +
  `ESCROW_SOLANA_ADDRESS`, dan umumkan ke user.

## 8. Risiko yang harus dipahami

- **Risiko kurs (FX) ditanggung platform.** Client mengunci USDC saat
  transaksi dibuat; worker dicairkan dengan kurs saat approve. Bila
  Rupiah melemah di antara keduanya, platform membayar USDC lebih
  banyak daripada yang diterima. Mitigasi: cairkan withdraw segera,
  jaga buffer USDC di escrow, dan pertimbangkan fee menutup drift ini.
- **Escrow harus selalu cukup.** Saldo USDC escrow ≈ total DP/final
  yang masuk − withdraw yang keluar. Bila escrow kurang, approve
  withdraw gagal tertutup (request tetap pending) — admin harus
  mengisi escrow dulu. Pantau saldo escrow berkala
  (`getEscrowUsdcBalance()`).
- **Jaringan default devnet.** Produksi wajib `SOLANA_NETWORK=
  mainnet-beta` + RPC mainnet sendiri (RPC publik rate-limit-nya
  ketat) + mint USDC mainnet. Jangan ke mainnet sebelum uji
  end-to-end di devnet lolos.
- **Biaya transaksi Solana (SOL)** untuk pengiriman withdraw
  (ATA creation + transfer) dibayar dari wallet escrow — escrow
  butuh sedikit SOL di samping USDC.

## 9. Kebijakan: transaksi di luar platform DILARANG

1. **Semua pembayaran wajib merujuk ke transaksi platform.**
   State machine memaksakannya: dana hanya masuk saldo worker bila
   ada transaksi platform yang selesai (DP → submit → pelunasan /
   auto-release / putusan dispute). Tidak ada jalur "bayar langsung
   ke worker" di dalam sistem.
2. **Peringatan di aplikasi.** Halaman chat dan halaman transaksi
   menampilkan peringatan: pembayaran di luar AkuBisa membatalkan
   perlindungan escrow & dispute dan dapat berujung penindakan akun
   (peringatan, pembekuan, atau penutupan akun).
3. **Tidak ada penyadapan/filter chat.** AkuBisa tidak membaca,
   memindai, atau memfilter isi chat demi privasi dan menghindari
   false positive. Penegakan dilakukan lewat laporan user
   (`/api/reports`), review admin, dan bukti transaksi.
4. Pelanggaran yang terbukti (mis. mengarahkan pembayaran ke luar
   platform): peringatan → pembekuan sementara → penutupan akun,
   sesuai keputusan admin.

## 10. Checklist go-live (butuh Yuyun)

- [ ] Keypair escrow produksi dibuat + disimpan sesuai §7; alamat
      publiknya diisi ke `ESCROW_SOLANA_ADDRESS` di `.env` VPS;
      file keypair di `ESCROW_KEYPAIR_PATH` (mode 600).
- [ ] Backup keypair/seed phrase di tempat terenkripsi terpisah.
- [ ] RPC endpoint dipilih (`SOLANA_RPC_URL`); untuk mainnet pakai
      RPC berbayar (Helius/QuickNode/dsb.), bukan RPC publik.
- [ ] `SOLANA_NETWORK=mainnet-beta` + `USDC_MINT` mainnet di `.env`
      VPS (atau tetap devnet untuk uji).
- [ ] Migrasi DB dijalankan di DB live (file
      `backend/config/schema.sql` — auto-migrate di `server.js`
      menjalankannya tiap boot; verifikasi kolom/tabel baru ada).
- [ ] Isi escrow dengan sedikit SOL (biaya transaksi) + USDC awal
      bila perlu (untuk withdraw pertama sebelum ada pemasukan).
- [ ] Uji end-to-end di **devnet** dulu: buat transaksi → bayar DP
      USDC devnet → verifikasi signature → submit → approve →
      pelunasan → auto-release → withdraw → admin approve (USDC
      terkirim) → produk digital → boost. Baru pindah mainnet.
- [ ] (Opsional) Isi `USDC_IDR_FALLBACK_RATE` di `.env` bila ingin
      transaksi tetap bisa dibuat saat CoinGecko down.

## 11. File yang berubah (2026-11-23)

- **Dihapus:** `backend/routes/pakasir.js`, `backend/routes/duitku.js`,
  `backend/utils/pakasir.js`, `backend/routes/transactions.js.bak`.
  Semua referensi Pakasir/Duitku/Xendit di kode + UI dibersihkan.
- **Baru:** `backend/utils/solana.js` (kurs, konversi, verifikasi
  on-chain, kirim USDC, keypair), `docs/pembayaran-solana.md` (file ini).
- **Diubah:** `backend/package.json` (+`@solana/web3.js`,
  `@solana/spl-token`), `backend/routes/transactions.js` (fee 5%,
  rate lock, `payment-info`, `verify-payment`),
  `backend/routes/wallet.js` (withdraw USDC),
  `backend/routes/admin.js` (approve withdraw kirim USDC +
  `record-tx` manual, komentar refund),
  `backend/routes/profile.js` + `backend/controllers/authController.js`
  (`solana_address`), `backend/routes/listings.js` (beli digital USDC
  + `verify-payment`), `backend/routes/boost.js` (beli boost USDC +
  `verify-payment` + featured benar-benar aktif),
  `backend/server.js` (hapus mount Pakasir; pesan auto-release),
  `backend/utils/ledger.js` (komentar fee 5%),
  `backend/config/schema.sql` (kolom/tabel USDC),
  `backend/.env.example` (variabel Solana),
  frontend: `js/pages.js`, `js/features.js`, `js/api.js`, `js/app.js`,
  `js/i18n.js`, `index.html` (alir bayar USDC, peringatan
  off-platform, fee 5%, withdraw Solana).
