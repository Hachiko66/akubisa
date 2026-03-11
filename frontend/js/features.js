
// ===== BOOST LISTING =====
let boostListingId = null;
let boostSelectedPkg = null;

const BOOST_PACKAGES = {
  '3day':  { days: 3,   amount: 15000,  label: 'Boost 3 Hari',   price: 'Rp 15.000' },
  '7day':  { days: 7,   amount: 25000,  label: 'Boost 7 Hari',   price: 'Rp 25.000' },
  '30day': { days: 30,  amount: 75000,  label: 'Boost 30 Hari',  price: 'Rp 75.000' },
  '1year': { days: 365, amount: 300000, label: 'Boost 1 Tahun',  price: 'Rp 300.000' },
};

function openBoostModal(listingId, title) {
  boostListingId = listingId;
  boostSelectedPkg = '7day';
  document.getElementById('boost-listing-title').textContent = title;
  
  const pkgContainer = document.getElementById('boost-packages');
  pkgContainer.innerHTML = Object.entries(BOOST_PACKAGES).map(([key, p]) => `
    <div class="boost-pkg-card ${key === '7day' ? 'selected' : ''}" onclick="selectBoostPkg('${key}')" data-pkg="${key}"
      style="border:2px solid ${key === '7day' ? '#e8521a' : '#e0ddd8'};border-radius:12px;padding:.8rem 1rem;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:all .2s;background:${key === '7day' ? '#fff8f5' : 'white'}">
      <div>
        <div style="font-weight:700;font-size:.9rem;color:#0f0e0d">${p.label}</div>
        <div style="font-size:.75rem;color:#888;margin-top:.1rem">Aktif selama ${p.days} hari</div>
      </div>
      <div style="font-weight:800;font-size:1rem;color:${key === '7day' ? '#e8521a' : '#0f0e0d'}">${p.price}</div>
    </div>
  `).join('');

  document.getElementById('boost-modal').style.display = 'flex';
}

function selectBoostPkg(pkg) {
  boostSelectedPkg = pkg;
  document.querySelectorAll('.boost-pkg-card').forEach(el => {
    const isSelected = el.dataset.pkg === pkg;
    el.style.borderColor = isSelected ? '#e8521a' : '#e0ddd8';
    el.style.background = isSelected ? '#fff8f5' : 'white';
    el.querySelector('div > div:first-child').style.color = '#0f0e0d';
    el.querySelector('div:last-child').style.color = isSelected ? '#e8521a' : '#0f0e0d';
  });
}

function closeBoostModal() {
  document.getElementById('boost-modal').style.display = 'none';
  boostListingId = null;
  boostSelectedPkg = null;
}

async function submitBoost() {
  if (!boostListingId || !boostSelectedPkg) return;
  const btn = document.getElementById('boost-pay-btn');
  btn.disabled = true;
  btn.textContent = 'Memproses...';
  try {
    const res = await api.post('/boost/buy', { listing_id: boostListingId, package: boostSelectedPkg });
    if (res.invoice_url) {
      closeBoostModal();
      window.open(res.invoice_url, '_blank');
      showToast('Halaman pembayaran dibuka! Listing aktif otomatis setelah bayar.', 'success');
    } else {
      showToast(res.message || 'Gagal membuat order', 'error');
    }
  } catch(e) {
    showToast(t('toast_error'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Bayar & Aktifkan Boost';
  }
}

// ===== ONBOARDING =====
let currentOnboardStep = 1;
const totalOnboardSteps = 4;

function showOnboarding() {
  if (localStorage.getItem('akubisa_onboarded')) return;
  const modal = document.getElementById('onboarding-modal');
  if (modal) { modal.style.display = 'flex'; currentOnboardStep = 1; updateOnboardStep(); }
}

function closeOnboarding() {
  localStorage.setItem('akubisa_onboarded', '1');
  const modal = document.getElementById('onboarding-modal');
  if (modal) modal.style.display = 'none';
}

function goToStep(step) {
  currentOnboardStep = step;
  updateOnboardStep();
}

function onboardNext() {
  if (currentOnboardStep < totalOnboardSteps) {
    currentOnboardStep++;
    updateOnboardStep();
  } else {
    closeOnboarding();
  }
}

function onboardPrev() {
  if (currentOnboardStep > 1) {
    currentOnboardStep--;
    updateOnboardStep();
  }
}

function updateOnboardStep() {
  // Show/hide steps
  for (let i = 1; i <= totalOnboardSteps; i++) {
    const el = document.getElementById('onboard-step-' + i);
    if (el) el.style.display = i === currentOnboardStep ? 'block' : 'none';
  }
  // Update progress bar
  const progress = document.getElementById('onboard-progress');
  if (progress) progress.style.width = (currentOnboardStep / totalOnboardSteps * 100) + '%';
  // Update dots
  document.querySelectorAll('.onboard-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === currentOnboardStep);
  });
  // Update nav buttons
  const prev = document.getElementById('onboard-prev');
  const next = document.getElementById('onboard-next');
  if (prev) prev.style.display = currentOnboardStep > 1 ? 'block' : 'none';
  if (next) {
    next.textContent = currentOnboardStep === totalOnboardSteps ? '🚀 Mulai!' : 'Lanjut →';
    if (currentOnboardStep === totalOnboardSteps) next.onclick = closeOnboarding;
    else next.onclick = onboardNext;
  }
}
// ===================================================
// BOOKMARKS
// ===================================================
async function renderBookmarks() {
  if (!currentUser) { goTo('login'); return; }
  document.getElementById('bookmarks-grid').innerHTML =
    '<p style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted)">Memuat...</p>';
  try {
    const items = await api.getBookmarks();
    if (!Array.isArray(items) || items.length === 0) {
      document.getElementById('bookmarks-grid').innerHTML =
        `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">
          <div style="font-size:2.5rem;margin-bottom:.8rem">🔖</div>
          <p>Belum ada penawaran tersimpan.</p>
          <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="goTo('explore')">Jelajahi Penawaran</button>
        </div>`;
      return;
    }
    document.getElementById('bookmarks-grid').innerHTML = items.map(l =>
      listingCardHTML(l) // reuse existing card
    ).join('');
  } catch(e) {
    document.getElementById('bookmarks-grid').innerHTML =
      '<p style="grid-column:1/-1;text-align:center;color:var(--danger);padding:2rem">Gagal memuat bookmark.</p>';
  }
}

async function toggleBookmark(listingId, btn) {
  if (!currentUser) { goTo('login'); return; }
  const isBookmarked = btn.dataset.bookmarked === 'true';
  try {
    const res = isBookmarked ? await api.removeBookmark(listingId) : await api.addBookmark(listingId);
    btn.dataset.bookmarked = (!isBookmarked).toString();
    btn.textContent = isBookmarked ? '🔖' : '🔖✓';
    btn.style.color = isBookmarked ? 'var(--muted)' : 'var(--accent)';
    showToast(res.message, 'success');
  } catch(e) { showToast('Gagal', 'error'); }
}

// ===================================================
// NOTIFICATIONS
// ===================================================
let notifPanelOpen = false;

async function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  notifPanelOpen = !notifPanelOpen;
  panel.style.display = notifPanelOpen ? 'flex' : 'none';
  if (notifPanelOpen) await loadNotifPanel();
}

function closeNotifPanel() {
  notifPanelOpen = false;
  document.getElementById('notif-panel').style.display = 'none';
}

async function loadNotifPanel() {
  const list = document.getElementById('notif-list');
  list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:.83rem">Memuat...</div>';
  try {
    const res = await api.getNotifications();
    const notifs = res.notifications || [];
    updateNotifBadge(res.unread_count || 0);
    if (notifs.length === 0) {
      list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted);font-size:.85rem">Tidak ada notifikasi</div>';
      return;
    }
    list.innerHTML = notifs.map(n => {
      const meta = n.metadata ? (typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata) : null;
      const trxId = meta ? (meta.transaction_id || null) : null;
      const action = n.action || '';
      return `<div onclick="clickNotif(${n.id},'${n.link||''}',${trxId},'${action}')"
        style="padding:.9rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:.8rem;align-items:flex-start;background:${n.is_read?'white':'#fff8f6'};transition:background .2s"
        onmouseover="this.style.background='var(--warm)'" onmouseout="this.style.background='${n.is_read?'white':'#fff8f6'}'">
        <div style="font-size:1.1rem;margin-top:.1rem">${notifIcon(n.type)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.82rem;font-weight:${n.is_read?'500':'700'}">${n.title}</div>
          ${n.message ? `<div style="font-size:.75rem;color:var(--muted);margin-top:.2rem;line-height:1.4">${n.message}</div>` : ''}
          <div style="font-size:.68rem;color:var(--muted);margin-top:.3rem">${timeAgo(n.created_at)}</div>
        </div>
        ${!n.is_read ? '<div style="width:7px;height:7px;border-radius:50%;background:var(--accent);flex-shrink:0;margin-top:.3rem"></div>' : ''}
      </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--danger);font-size:.83rem">Gagal memuat</div>';
  }
}

function notifIcon(type) {
  const icons = { message:'💬', review:'⭐', bookmark:'🔖', system:'📢', listing:'📋', transaction:'💳', wallet:'💰' };
  return icons[type] || '🔔';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff/60000);
  if (mins < 1) return 'Baru saja';
  if (mins < 60) return `${mins} menit lalu`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs/24)} hari lalu`;
}

async function clickNotif(id, link, trxId, action) {
  await api.readNotif(id);
  closeNotifPanel();
  if (action === 'approve' && trxId) {
    // Langsung approve & buat invoice pelunasan
    goTo('transactions');
    setTimeout(async () => {
      const res = await api.approveTransaction(trxId);
      if (res.invoice_url) {
        showToast('Mengarahkan ke halaman pelunasan...', 'success');
        setTimeout(() => {
          const tab = window.open(res.invoice_url, '_blank');
          if (!tab || tab.closed) window.location.href = res.invoice_url;
        }, 800);
        renderTransactions();
      } else {
        showToast(res.message || 'Gagal membuat invoice', 'error');
      }
    }, 300);
  } else if (link) {
    if (link.startsWith('#')) goTo(link.replace('#',''));
    else location.href = link;
  }
  loadNotifPanel();
}

async function markAllNotifsRead() {
  await api.readAllNotifs();
  updateNotifBadge(0);
  await loadNotifPanel();
  showToast('Semua notifikasi ditandai dibaca', 'success');
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.cssText = 'display:flex!important;position:absolute;top:-5px;right:-5px;background:var(--accent);color:white;font-size:.6rem;font-weight:800;min-width:17px;height:17px;border-radius:50%;align-items:center;justify-content:center;padding:0 3px';
  } else {
    badge.style.display = 'none';
  }
}

// Poll notif badge setiap 10 detik (dipanggil dari app.js setelah login)
async function pollNotifBadge() {
  if (!currentUser) return;
  try {
    const res = await api.getNotifications();
    updateNotifBadge(res.unread_count || 0);
  } catch(e) {}
}

// Tutup panel jika klik di luar
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const bell = e.target.closest('[onclick="toggleNotifPanel()"]');
  if (notifPanelOpen && panel && !panel.contains(e.target) && !bell) {
    closeNotifPanel();
  }
});

// ===================================================
// FORGOT & RESET PASSWORD
// ===================================================
async function doForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const successEl = document.getElementById('forgot-success');
  errEl.textContent = '';
  successEl.style.display = 'none';
  if (!email) { errEl.textContent = 'Masukkan email kamu'; return; }
  const btn = document.getElementById('forgot-btn');
  btn.innerHTML = '<span class="spinner"></span>Mengirim...'; btn.disabled = true;
  const res = await api.forgotPassword(email);
  btn.innerHTML = 'Kirim Link Reset'; btn.disabled = false;
  successEl.textContent = res.message || 'Jika email terdaftar, link reset telah dikirim.';
  successEl.style.display = 'block';
}

let resetToken = '';
async function doResetPassword() {
  const password = document.getElementById('reset-pass').value;
  const confirm  = document.getElementById('reset-confirm').value;
  const errEl    = document.getElementById('reset-error');
  errEl.textContent = '';
  if (!password || password.length < 6) { errEl.textContent = 'Password minimal 6 karakter'; return; }
  if (password !== confirm) { errEl.textContent = 'Password tidak cocok'; return; }
  const btn = document.getElementById('reset-btn');
  btn.innerHTML = '<span class="spinner"></span>Menyimpan...'; btn.disabled = true;
  const res = await api.resetPassword(resetToken, password);
  btn.innerHTML = 'Simpan Password Baru'; btn.disabled = false;
  if (res.message?.includes('berhasil')) {
    showToast('Password berhasil direset! Silakan login.', 'success');
    goTo('login');
  } else {
    errEl.textContent = res.message || 'Gagal reset password';
  }
}

// Handle reset password dari URL: /#reset-password/TOKEN
function checkResetToken() {
  const hash = location.hash.replace('#', '');
  const match = hash.match(/^reset-password\/(.+)$/);
  if (match) {
    resetToken = match[1];
    navigate('reset-password');
    renderNav();
  } else if (window._resetToken) {
    resetToken = window._resetToken;
    delete window._resetToken;
  }
}

// ===================================================
// REPORT
// ===================================================
function openReportModal(userId, userName, listingId) {
  if (!currentUser) { goTo('login'); return; }
  document.getElementById('report-user-id').value = userId || '';
  document.getElementById('report-listing-id').value = listingId || '';
  document.getElementById('report-target-name').textContent = userName;
  document.getElementById('report-reason').value = '';
  document.getElementById('report-desc').value = '';
  document.getElementById('report-error').textContent = '';
  document.getElementById('report-modal').classList.add('open');
}

function closeReportModal() {
  document.getElementById('report-modal').classList.remove('open');
}

async function submitReport() {
  const reason = document.getElementById('report-reason').value;
  const description = document.getElementById('report-desc').value.trim();
  const reported_user_id = document.getElementById('report-user-id').value;
  const reported_listing_id = document.getElementById('report-listing-id').value;
  const errEl = document.getElementById('report-error');
  if (!reason) { errEl.textContent = 'Pilih alasan laporan'; return; }
  const btn = document.getElementById('report-btn');
  btn.innerHTML = '<span class="spinner"></span>Mengirim...'; btn.disabled = true;
  const res = await api.sendReport({
    reason, description,
    reported_user_id: reported_user_id || null,
    reported_listing_id: reported_listing_id || null
  });
  btn.innerHTML = 'Kirim Laporan'; btn.disabled = false;
  if (res.message) {
    closeReportModal();
    showToast(res.message, 'success');
  } else {
    errEl.textContent = res.message || 'Gagal mengirim laporan';
  }
}

// ===================================================
// PROMOTE / FEATURED LISTING
// ===================================================
let selectedPromoteDays = 0;

function openPromoteModal(listingId, title) {
  if (!currentUser) { goTo('login'); return; }
  document.getElementById('promote-listing-id').value = listingId;
  document.getElementById('promote-listing-title').textContent = title;
  document.getElementById('promote-selected').textContent = '';
  document.getElementById('promote-btn').disabled = true;
  document.getElementById('promote-btn').style.opacity = '.5';
  selectedPromoteDays = 0;
  // Reset pkg selection
  document.querySelectorAll('.promote-pkg').forEach(p => {
    p.style.borderColor = p.dataset.days == 14 ? 'var(--accent)' : 'var(--border)';
    p.style.background  = p.dataset.days == 14 ? '#fff8f6' : '';
    p.style.transform = '';
  });
  document.getElementById('promote-modal').classList.add('open');
}

function closePromoteModal() {
  document.getElementById('promote-modal').classList.remove('open');
}

function selectPkg(el, days, price) {
  selectedPromoteDays = days;
  document.querySelectorAll('.promote-pkg').forEach(p => {
    p.style.borderColor = 'var(--border)';
    p.style.background = '';
    p.style.transform = '';
  });
  el.style.borderColor = 'var(--accent)';
  el.style.background = '#fff8f6';
  el.style.transform = 'translateY(-2px)';
  document.getElementById('promote-selected').textContent =
    `Paket dipilih: ${days} hari — ${price}`;
  const btn = document.getElementById('promote-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
}

async function submitPromote() {
  if (!selectedPromoteDays) return;
  const listingId = document.getElementById('promote-listing-id').value;
  const btn = document.getElementById('promote-btn');
  btn.innerHTML = '<span class="spinner"></span>Mengaktifkan...';
  btn.disabled = true;

  try {
    const res = await api.adminFeatureListing
      ? await fetch(`/api/admin/listings/${listingId}/feature`, {
          method: 'PATCH',
          headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${getToken()}` },
          body: JSON.stringify({ days: selectedPromoteDays })
        }).then(r => r.json())
      : { message: null };

    // Fallback: pakai endpoint khusus user promote
    if (!res.message) {
      const res2 = await fetch(`/api/listings/${listingId}/promote`, {
        method: 'PATCH',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${getToken()}` },
        body: JSON.stringify({ days: selectedPromoteDays })
      }).then(r => r.json());
      btn.innerHTML = 'Aktifkan Sekarang';
      if (res2.message) {
        closePromoteModal();
        showToast(`⭐ Penawaran berhasil dipromosikan selama ${selectedPromoteDays} hari!`, 'success');
        renderDashboard();
      } else {
        showToast(res2.message || 'Gagal', 'error');
        btn.disabled = false;
      }
      return;
    }

    btn.innerHTML = 'Aktifkan Sekarang';
    closePromoteModal();
    showToast(`⭐ Penawaran berhasil dipromosikan selama ${selectedPromoteDays} hari!`, 'success');
    renderDashboard();
  } catch(e) {
    btn.innerHTML = 'Aktifkan Sekarang';
    btn.disabled = false;
    showToast('Gagal mengaktifkan promosi', 'error');
  }
}

// ===== DIGITAL PRODUCTS =====
function setListingType(type) {
  document.getElementById('post-listing-type').value = type;
  const serviceCard = document.getElementById('type-service-card');
  const digitalCard = document.getElementById('type-digital-card');
  const uploadSection = document.getElementById('digital-upload-section');

  if (type === 'service') {
    serviceCard.style.borderColor = 'var(--accent)';
    serviceCard.style.background = '#fff8f6';
    digitalCard.style.borderColor = 'var(--border)';
    digitalCard.style.background = 'white';
    uploadSection.style.display = 'none';
    document.getElementById('post-price-unit').value = '/jam';
  } else {
    digitalCard.style.borderColor = 'var(--accent)';
    digitalCard.style.background = '#fff8f6';
    serviceCard.style.borderColor = 'var(--border)';
    serviceCard.style.background = 'white';
    uploadSection.style.display = 'block';
    document.getElementById('post-price-unit').value = '/produk';
  }
}

async function handleDigitalFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const status = document.getElementById('upload-status');
  const dropzone = document.getElementById('upload-dropzone');
  
  status.style.display = 'block';
  status.innerHTML = '<span style="color:var(--muted)">⏳ Mengupload...</span>';
  dropzone.style.borderColor = 'var(--accent)';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await api.uploadDigitalFile(formData);
    if (res.file_url) {
      document.getElementById('post-file-url').value = res.file_url;
      document.getElementById('post-file-name').value = res.file_name;
      
      const sizeMB = (res.file_size / 1024 / 1024).toFixed(2);
      status.innerHTML = `<span style="color:var(--success)">✅ ${res.file_name} (${sizeMB} MB) berhasil diupload</span>`;
      dropzone.innerHTML = `
        <div style="font-size:1.5rem">✅</div>
        <div style="font-size:.85rem;font-weight:600;margin-top:.25rem">${res.file_name}</div>
        <div style="font-size:.75rem;color:var(--muted)">${sizeMB} MB · Klik untuk ganti</div>
      `;
    } else {
      status.innerHTML = `<span style="color:var(--error)">❌ ${res.message || 'Upload gagal'}</span>`;
    }
  } catch (e) {
    status.innerHTML = '<span style="color:var(--error)">❌ Koneksi gagal</span>';
  }
}

// Purchase & download digital product dari halaman listing detail
async function purchaseAndDownload(listingId) {
  if (!currentUser) { goTo('login'); return; }
  
  const btn = document.getElementById(`download-btn-${listingId}`);
  btn.disabled = true;
  btn.innerHTML = '⏳ Memproses...';

  try {
    const res = await api.purchaseDigital(listingId);
    if (res.success) {
      showToast('Pembelian berhasil! File sedang didownload...', 'success');
      setTimeout(() => {
        window.open(`/api/listings/${listingId}/download`, '_blank');
        btn.innerHTML = '⬇️ Download Lagi';
        btn.disabled = false;
      }, 500);
    } else {
      showToast(res.message || 'Gagal', 'error');
      btn.disabled = false;
      btn.innerHTML = '🛒 Dapatkan Sekarang';
    }
  } catch(e) {
    showToast('Koneksi gagal', 'error');
    btn.disabled = false;
    btn.innerHTML = '🛒 Dapatkan Sekarang';
  }
}

function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('hamburger-btn');
  const lines = btn.querySelectorAll('.ham-line');
  const isOpen = menu.style.display === 'flex';

  if (!isOpen) {
    menu.style.display = 'flex';
    lines[0].style.transform = 'translateY(7px) rotate(45deg)';
    lines[1].style.opacity = '0';
    lines[2].style.transform = 'translateY(-7px) rotate(-45deg)';
    document.body.style.overflow = 'hidden';
  } else {
    menu.style.display = 'none';
    lines[0].style.transform = '';
    lines[1].style.opacity = '1';
    lines[2].style.transform = '';
    document.body.style.overflow = '';
  }
}

function closeMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  const btn = document.getElementById('hamburger-btn');
  if (!menu) return;
  menu.style.display = 'none';
  if (btn) {
    const lines = btn.querySelectorAll('.ham-line');
    lines[0].style.transform = '';
    lines[1].style.opacity = '1';
    lines[2].style.transform = '';
  }
  document.body.style.overflow = '';
}
