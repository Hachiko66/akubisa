// ===== AkuBisa i18n =====
const LANGS = {
  id: {
    // NAV
    nav_explore: 'Jelajahi',
    nav_how: 'Cara Kerja',
    nav_login: 'Masuk',
    nav_register: 'Daftar Gratis',
    nav_messages: 'Pesan',
    nav_dashboard: 'Dashboard',
    nav_profile: 'Profil Saya',
    nav_listings: 'Penawaran Saya',
    nav_wallet: 'Dompet',
    nav_transactions: 'Transaksi',
    nav_job_requests: 'Aku Butuh',
    nav_logout: 'Keluar',
    nav_switch_role: 'Ganti Peran',

    // LANDING
    hero_title: 'Kemampuanmu\nBernilai di Sini.',
    hero_sub: 'Platform freelance Indonesia — temukan talent terbaik atau tawarkan jasamu dengan aman.',
    hero_cta_explore: 'Jelajahi Penawaran',
    hero_cta_post: 'Mulai Menawarkan',
    hero_stat_talent: 'Talent Aktif',
    hero_stat_category: 'Kategori',
    hero_stat_secure: 'Transaksi Aman',
    how_title: 'Cara Kerja',
    how_sub: 'Sederhana, aman, dan terpercaya',
    how_1_title: 'Temukan Talent',
    how_1_desc: 'Cari berdasarkan kategori, keahlian, atau anggaran. Lihat portofolio dan ulasan asli.',
    how_2_title: 'Sepakati & Mulai',
    how_2_desc: 'Chat langsung, sepakati harga dan timeline. Bayar DP 50% ke escrow kami.',
    how_3_title: 'Terima & Lunasi',
    how_3_desc: 'Review hasil kerja, berikan persetujuan, dan lunasi 50% sisanya.',
    featured_title: 'Penawaran Unggulan',
    featured_sub: 'Dipilih dari talent terbaik platform',
    explore_btn: 'Lihat Semua Penawaran →',

    // EXPLORE
    explore_title: 'Jelajahi Penawaran',
    explore_search: 'Cari penawaran...',
    explore_all_cat: 'Semua Kategori',
    explore_sort_newest: 'Terbaru',
    explore_sort_popular: 'Terpopuler',
    explore_sort_price_low: 'Harga Terendah',
    explore_sort_price_high: 'Harga Tertinggi',
    explore_empty: 'Tidak ada penawaran ditemukan',
    explore_load_more: 'Muat Lebih Banyak',

    // LISTING CARD
    listing_from: 'Mulai dari',
    listing_views: 'dilihat',
    listing_contact: 'Hubungi',
    listing_boost_badge: '⚡ Unggulan',

    // DASHBOARD
    dash_title: 'Dashboard',
    dash_welcome: 'Selamat datang',
    dash_listings: 'Penawaran',
    dash_views: 'Total Dilihat',
    dash_transactions: 'Transaksi',
    dash_wallet: 'Saldo Dompet',
    dash_post_listing: '+ Posting Penawaran',
    dash_my_listings: 'Penawaran Saya',
    dash_no_listings: 'Belum ada penawaran',
    dash_kyc_banner: 'Verifikasi identitas untuk akses penuh',
    dash_kyc_btn: 'Verifikasi Sekarang',

    // PROFILE
    profile_edit: 'Edit Profil',
    profile_verified: '✓ Pengguna Terverifikasi',
    profile_listings: 'Penawaran',
    profile_reviews: 'Ulasan',
    profile_portfolio: 'Portofolio',
    profile_member_since: 'Bergabung',
    profile_save: 'Simpan Perubahan',
    profile_name: 'Nama Lengkap',
    profile_bio: 'Bio',
    profile_skills: 'Keahlian',
    profile_location: 'Lokasi',

    // AUTH
    login_title: 'Masuk',
    login_email: 'Email',
    login_password: 'Kata Sandi',
    login_btn: 'Masuk',
    login_forgot: 'Lupa kata sandi?',
    login_no_account: 'Belum punya akun?',
    login_register: 'Daftar',
    register_title: 'Daftar',
    register_name: 'Nama Lengkap',
    register_email: 'Email',
    register_password: 'Kata Sandi',
    register_btn: 'Daftar Gratis',
    register_have_account: 'Sudah punya akun?',
    register_login: 'Masuk',

    // ERRORS
    err_required: 'Wajib diisi',
    err_invalid_email: 'Email tidak valid',
    err_login_failed: 'Email atau kata sandi salah',
    err_server: 'Terjadi kesalahan server',
    err_not_found: 'Tidak ditemukan',
    err_unauthorized: 'Tidak diizinkan',

    // TOAST
    toast_saved: 'Berhasil disimpan!',
    toast_deleted: 'Berhasil dihapus!',
    toast_error: 'Terjadi kesalahan',
    toast_copied: 'Link disalin!',
    toast_login_success: 'Berhasil masuk!',
    toast_logout: 'Berhasil keluar',

    // WALLET
    wallet_title: 'Dompet',
    wallet_balance: 'Saldo Tersedia',
    wallet_withdraw: 'Tarik Dana',
    wallet_history: 'Riwayat',
    wallet_pending: 'Menunggu',

    // TRANSACTIONS
    trx_title: 'Transaksi',
    trx_status_waiting_dp: 'Menunggu DP',
    trx_status_dp_paid: 'DP Dibayar',
    trx_status_submitted: 'Dikerjakan',
    trx_status_waiting_final: 'Menunggu Pelunasan',
    trx_status_completed: 'Selesai',
    trx_status_disputed: 'Dispute',
    trx_status_cancelled: 'Dibatalkan',

    // BOOST
    boost_title: 'Boost Listing',
    boost_desc: 'Listing kamu akan muncul di posisi teratas dan section unggulan.',
    boost_pay: '⚡ Bayar & Aktifkan Boost',
    boost_secure: 'Pembayaran aman via Xendit · Aktif otomatis setelah bayar',

    // TERMS & PRIVACY
    terms_title: 'Syarat & Ketentuan',
    privacy_title: 'Kebijakan Privasi',
    last_updated: 'Terakhir diperbarui',

    // GENERAL
    btn_save: 'Simpan',
    btn_cancel: 'Batal',
    btn_close: 'Tutup',
    btn_back: 'Kembali',
    btn_next: 'Lanjut',
    btn_submit: 'Kirim',
    btn_delete: 'Hapus',
    btn_edit: 'Edit',
    btn_view: 'Lihat',
    loading: 'Memuat...',
    see_all: 'Lihat Semua',
  },

  en: {
    // NAV
    nav_explore: 'Explore',
    nav_how: 'How It Works',
    nav_login: 'Login',
    nav_register: 'Sign Up Free',
    nav_messages: 'Messages',
    nav_dashboard: 'Dashboard',
    nav_profile: 'My Profile',
    nav_listings: 'My Listings',
    nav_wallet: 'Wallet',
    nav_transactions: 'Transactions',
    nav_job_requests: 'Job Requests',
    nav_logout: 'Logout',
    nav_switch_role: 'Switch Role',

    // LANDING
    hero_title: 'Your Skills\nHave Value Here.',
    hero_sub: 'Indonesia\'s freelance platform — find top talent or offer your services safely.',
    hero_cta_explore: 'Explore Services',
    hero_cta_post: 'Start Offering',
    hero_stat_talent: 'Active Talent',
    hero_stat_category: 'Categories',
    hero_stat_secure: 'Secure Transactions',
    how_title: 'How It Works',
    how_sub: 'Simple, secure, and trusted',
    how_1_title: 'Find Talent',
    how_1_desc: 'Search by category, skill, or budget. View portfolios and genuine reviews.',
    how_2_title: 'Agree & Start',
    how_2_desc: 'Chat directly, agree on price and timeline. Pay 50% deposit to our escrow.',
    how_3_title: 'Review & Pay',
    how_3_desc: 'Review the work, give approval, and pay the remaining 50%.',
    featured_title: 'Featured Services',
    featured_sub: 'Handpicked from the best talent on the platform',
    explore_btn: 'View All Services →',

    // EXPLORE
    explore_title: 'Explore Services',
    explore_search: 'Search services...',
    explore_all_cat: 'All Categories',
    explore_sort_newest: 'Newest',
    explore_sort_popular: 'Most Popular',
    explore_sort_price_low: 'Lowest Price',
    explore_sort_price_high: 'Highest Price',
    explore_empty: 'No services found',
    explore_load_more: 'Load More',

    // LISTING CARD
    listing_from: 'Starting from',
    listing_views: 'views',
    listing_contact: 'Contact',
    listing_boost_badge: '⚡ Featured',

    // DASHBOARD
    dash_title: 'Dashboard',
    dash_welcome: 'Welcome back',
    dash_listings: 'Listings',
    dash_views: 'Total Views',
    dash_transactions: 'Transactions',
    dash_wallet: 'Wallet Balance',
    dash_post_listing: '+ Post a Service',
    dash_my_listings: 'My Listings',
    dash_no_listings: 'No listings yet',
    dash_kyc_banner: 'Verify your identity for full access',
    dash_kyc_btn: 'Verify Now',

    // PROFILE
    profile_edit: 'Edit Profile',
    profile_verified: '✓ Verified User',
    profile_listings: 'Listings',
    profile_reviews: 'Reviews',
    profile_portfolio: 'Portfolio',
    profile_member_since: 'Member since',
    profile_save: 'Save Changes',
    profile_name: 'Full Name',
    profile_bio: 'Bio',
    profile_skills: 'Skills',
    profile_location: 'Location',

    // AUTH
    login_title: 'Login',
    login_email: 'Email',
    login_password: 'Password',
    login_btn: 'Login',
    login_forgot: 'Forgot password?',
    login_no_account: 'Don\'t have an account?',
    login_register: 'Sign Up',
    register_title: 'Sign Up',
    register_name: 'Full Name',
    register_email: 'Email',
    register_password: 'Password',
    register_btn: 'Sign Up Free',
    register_have_account: 'Already have an account?',
    register_login: 'Login',

    // ERRORS
    err_required: 'This field is required',
    err_invalid_email: 'Invalid email address',
    err_login_failed: 'Invalid email or password',
    err_server: 'Server error occurred',
    err_not_found: 'Not found',
    err_unauthorized: 'Unauthorized',

    // TOAST
    toast_saved: 'Saved successfully!',
    toast_deleted: 'Deleted successfully!',
    toast_error: 'An error occurred',
    toast_copied: 'Link copied!',
    toast_login_success: 'Logged in successfully!',
    toast_logout: 'Logged out successfully',

    // WALLET
    wallet_title: 'Wallet',
    wallet_balance: 'Available Balance',
    wallet_withdraw: 'Withdraw',
    wallet_history: 'History',
    wallet_pending: 'Pending',

    // TRANSACTIONS
    trx_title: 'Transactions',
    trx_status_waiting_dp: 'Waiting Deposit',
    trx_status_dp_paid: 'Deposit Paid',
    trx_status_submitted: 'In Progress',
    trx_status_waiting_final: 'Awaiting Final Payment',
    trx_status_completed: 'Completed',
    trx_status_disputed: 'Disputed',
    trx_status_cancelled: 'Cancelled',

    // BOOST
    boost_title: 'Boost Listing',
    boost_desc: 'Your listing will appear at the top and in the featured section.',
    boost_pay: '⚡ Pay & Activate Boost',
    boost_secure: 'Secure payment via Xendit · Auto-activated after payment',

    // TERMS & PRIVACY
    terms_title: 'Terms & Conditions',
    privacy_title: 'Privacy Policy',
    last_updated: 'Last updated',

    // GENERAL
    btn_save: 'Save',
    btn_cancel: 'Cancel',
    btn_close: 'Close',
    btn_back: 'Back',
    btn_next: 'Next',
    btn_submit: 'Submit',
    btn_delete: 'Delete',
    btn_edit: 'Edit',
    btn_view: 'View',
    loading: 'Loading...',
    see_all: 'See All',
  }
};

// Active language
let currentLang = localStorage.getItem('akubisa_lang') || 'id';

// Translate function
function t(key) {
  return (LANGS[currentLang] && LANGS[currentLang][key]) || (LANGS['id'] && LANGS['id'][key]) || key;
}

// Switch language
function switchLang(lang) {
  currentLang = lang;
  localStorage.setItem('akubisa_lang', lang);
  document.documentElement.lang = lang;
  // Re-render nav dan halaman aktif
  if (typeof renderNav === 'function') renderNav();
  const activePage = document.querySelector('.page.active');
  if (activePage) {
    const pageId = activePage.id.replace('page-', '');
    if (typeof navigate === 'function') navigate(pageId);
  }
  showToast(lang === 'en' ? '🇬🇧 Switched to English' : '🇮🇩 Beralih ke Bahasa Indonesia', 'success');
}

function getCurrentLang() { return currentLang; }
