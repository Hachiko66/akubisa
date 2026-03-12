// ===== STATE =====
let currentUser = null;
let currentPage = 'home';
let categories  = [];
let currentCategory = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof applyTranslations === 'function') applyTranslations();
  // Panggil render untuk halaman awal
  const token = localStorage.getItem('akubisa_token');
  if (token) {
    try {
      const res = await api.me();
      if (res.id) {
        currentUser = res;
        localStorage.setItem('akubisa_user', JSON.stringify(res));
      } else {
        localStorage.clear();
      }
    } catch(e) { localStorage.clear(); }
  }
  await loadCategories();
  renderNav();
  if (currentUser) startNotifPoll();
  const hash = location.hash.replace('#','') || 'home';
  // Handle direct listing link e.g. #listing-26
  if (hash.startsWith('listing-')) {
    const listingId = parseInt(hash.replace('listing-', ''));
    navigate('explore');
    renderNav();
    renderExplore();
    setTimeout(() => openListingDetail(listingId), 800);
    return;
  }
  navigate(hash);
  renderNav();
  if (hash === 'home' || hash === '') renderHome();
  if (hash === 'dashboard') renderDashboard();
  if (hash === 'explore')   { renderExplore(); loadExplore(); }
  if (hash === 'profile')   renderProfile();
  if (hash === 'messages')  renderMessages();
  if (hash === 'job-requests') renderJobRequests();
  if (hash === 'transactions') renderTransactions();
  if (hash === 'wallet') renderWallet();
  if (hash === 'bookmarks') renderBookmarks();
  // Cek reset token setelah semua init selesai
  checkResetToken();
});

window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#','') || 'home';
  if (page.startsWith('listing-')) {
    const listingId = parseInt(page.replace('listing-', ''));
    navigate('explore');
    renderNav();
    renderExplore();
    setTimeout(() => openListingDetail(listingId), 800);
    return;
  }
  if (page.startsWith('reset-password/')) {
    const token = page.replace('reset-password/', '');
    if (typeof resetToken !== 'undefined') resetToken = token;
    else window._resetToken = token;
    navigate('reset-password');
    renderNav();
    return;
  }
  navigate(page);
  renderNav();
  if (page === 'home')      renderHome();
  if (page === 'explore')   { renderExplore(); loadExplore(currentCategory); }
  if (page === 'dashboard') renderDashboard();
  if (page === 'profile')   renderProfile();
  if (page === 'messages')  renderMessages();
  if (page === 'job-requests') renderJobRequests();
  if (page === 'transactions') renderTransactions();
  if (page === 'wallet') renderWallet();
  if (page === 'bookmarks') renderBookmarks();
  if (page === 'admin')     renderAdmin();
  if (page === 'terms' || page === 'privacy') {} // static pages
  if (!document.getElementById('page-' + page)) { navigate('404'); }
  if (page === 'terms' || page === 'privacy') {} // static pages
  if (!document.getElementById('page-' + page)) { navigate('404'); }
});

// ===== ROUTER — FIXED =====
function navigate(page) {
  currentPage = page;
  const authPages = ['login','register','forgot-password','reset-password'];

  // Sembunyikan semua pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = '';
  });

  // Tampilkan halaman aktif
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  if (typeof applyTranslations === 'function') applyTranslations();

  // Navbar: sembunyikan di auth pages
  const nav = document.getElementById('main-nav');
  if (nav) nav.style.display = authPages.includes(page) ? 'none' : 'flex';

  updateNavTheme(page);
  window.scrollTo(0, 0);
}

function goTo(page) {
  location.hash = page;
  navigate(page);
  renderNav();
  if (page === 'home')      renderHome();
  if (page === 'explore')   { renderExplore(); loadExplore(currentCategory); }
  if (page === 'dashboard') renderDashboard();
  if (page === 'profile')   renderProfile();
  if (page === 'messages')  renderMessages();
  if (page === 'job-requests') renderJobRequests();
  if (page === 'transactions') renderTransactions();
  if (page === 'wallet') renderWallet();
  if (page === 'bookmarks') renderBookmarks();
  if (page === 'admin')     renderAdmin();
  if (page === 'terms' || page === 'privacy') {} // static pages
  if (!document.getElementById('page-' + page)) { navigate('404'); }
  if (page === 'terms' || page === 'privacy') {} // static pages
  if (!document.getElementById('page-' + page)) { navigate('404'); }
}

// ===== NAV =====
function updateNavTheme(page) {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  // Navbar selalu dark solid
  nav.setAttribute('data-theme', 'dark');
  nav.style.background = 'var(--ink)';
  nav.style.borderBottom = 'none';
  nav.style.boxShadow = 'none';
}

function renderNav() {
  const links = document.getElementById('nav-links');
  const mobileLinks = document.getElementById('mobile-nav-links');
  if (!links) return;

  if (!currentUser) {
    // ===== GUEST NAV =====
    links.innerHTML = `
      <a onclick="goTo('explore')" style="font-size:.88rem;color:rgba(255,255,255,.75);transition:color .2s" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,.75)'">${t('nav_explore')}</a>
      <a onclick="scrollToHow()" style="font-size:.88rem;color:rgba(255,255,255,.75);transition:color .2s" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,.75)'">${t('nav_how')}</a>
      <a onclick="goTo('login')" style="font-size:.88rem;color:rgba(255,255,255,.75);transition:color .2s" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,.75)'">${t('nav_login')}</a>
      <button class="btn btn-primary btn-sm" onclick="goTo('register')" style="border-radius:100px;padding:.4rem 1.1rem;font-size:.85rem">${t('nav_register')}</button>
      <button class="lang-switch-btn" onclick="switchLang(getCurrentLang()==='id'?'en':'id')" style="background:none;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.7);border-radius:100px;padding:.3rem .7rem;font-size:.75rem;cursor:pointer">${getCurrentLang()==='id'?'🇬🇧 EN':'🇮🇩 ID'}</button>`;

    if (mobileLinks) mobileLinks.innerHTML = `
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('explore'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">${t('nav_explore')}</a>
      <a onclick="scrollToHow();closeMobileMenu()" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">${t('nav_how')}</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('job-requests'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">${t('nav_job_requests')}</a>
      <div style="display:flex;gap:.8rem;margin-top:.5rem">
        <button class="btn btn-outline" onclick="closeMobileMenu();setTimeout(()=>goTo('login'),100)" style="color:white;border-color:rgba(255,255,255,.3);border-radius:100px;padding:.6rem 1.5rem">${t('nav_login')}</button>
        <button class="btn btn-primary" onclick="closeMobileMenu();setTimeout(()=>goTo('register'),100)" style="border-radius:100px;padding:.6rem 1.5rem">${t('nav_register')}</button>
      </div>
      <button class="lang-switch-btn" onclick="switchLang(getCurrentLang()==='id'?'en':'id');closeMobileMenu()" style="margin-top:.5rem;background:none;border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.8);border-radius:100px;padding:.5rem 1.2rem;font-size:.85rem;cursor:pointer;align-self:flex-start">${getCurrentLang()==='id'?'🇬🇧 Switch to English':'🇮🇩 Ganti ke Indonesia'}</button>`;
  } else {
    // ===== USER NAV =====
    const ini = initials(currentUser.full_name);
    const av = avColor(currentUser.full_name);
    const avatarHTML = currentUser.avatar
      ? `<img src="${currentUser.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.2)">`
      : `<div style="width:32px;height:32px;border-radius:50%;background:${av};display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;color:white;border:2px solid rgba(255,255,255,.2)">${ini}</div>`;

    links.innerHTML = `
      <a onclick="goTo('explore')" class="nav-link-adaptive">${t('nav_explore')}</a>
      <a onclick="goTo('job-requests')" class="nav-link-adaptive">${t('nav_job_requests')}</a>
      <a onclick="goTo('messages')" class="nav-link-adaptive">${t('nav_messages')}</a>
      <button class="lang-switch-btn" onclick="switchLang(getCurrentLang()==='id'?'en':'id')" style="background:none;border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.7);border-radius:100px;padding:.25rem .6rem;font-size:.72rem;cursor:pointer">${getCurrentLang()==='id'?'🇬🇧 EN':'🇮🇩 ID'}</button>
      <div style="position:relative;display:inline-flex;align-items:center">
        <button onclick="toggleNotifPanel()" class="nav-icon-btn" style="background:none;border:none;cursor:pointer;padding:.3rem;font-size:1.1rem;line-height:1" ">🔔</button>
        <span id="notif-badge" style="display:none;position:absolute;top:-2px;right:-2px;background:var(--accent);color:white;font-size:.55rem;font-weight:800;min-width:15px;height:15px;border-radius:50%;align-items:center;justify-content:center;padding:0 2px;z-index:1"></span>
      </div>
      <button onclick="goTo('profile')" style="background:none;border:none;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:.5rem" title="${currentUser.full_name}">
        ${avatarHTML}
      </button>`;

    if (mobileLinks) mobileLinks.innerHTML = `
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('dashboard'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Dashboard</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('explore'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Jelajahi</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('job-requests'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Aku Butuh</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('messages'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Pesan</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('bookmarks'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Tersimpan</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('transactions'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Transaksi</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('wallet'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Dompet</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('profile'),100)" style="font-size:1.1rem;color:rgba(255,255,255,.85);font-weight:500">Profil Saya</a>
      <div style="margin-top:.5rem">
        <button class="btn btn-danger" onclick="logout();closeMobileMenu()" style="border-radius:100px;padding:.6rem 1.8rem">${t('nav_logout')}</button>
        <button onclick="switchLang(getCurrentLang()==='id'?'en':'id');closeMobileMenu()" style="background:none;border:1px solid rgba(255,255,255,.3);color:rgba(255,255,255,.8);border-radius:100px;padding:.5rem 1.2rem;font-size:.85rem;cursor:pointer">${getCurrentLang()==='id'?'🇬🇧 Switch to English':'🇮🇩 Ganti ke Indonesia'}</button>
      </div>`;
  }
}

// ===== LOGOUT =====
function logout() {
  localStorage.clear();
  currentUser = null;
  stopNotifPoll();
  renderNav();
  showToast('Berhasil keluar 👋', 'success');
  goTo('home');
}

// ===== CATEGORIES =====
async function loadCategories() {
  try {
    const res = await api.getCategories();
    if (Array.isArray(res)) categories = res;
  } catch(e) {}
}

// ===== TOAST =====
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3500);
}

// ===== LISTING CARD =====
function extractImages(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return Array.from(tmp.querySelectorAll('img')).map(img => img.src).filter(Boolean);
}

function stripHTML(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  return tmp.textContent || tmp.innerText || '';
}

// ===== SHARE LISTING =====
function shareListing(id, title, event) {
  if (event) event.stopPropagation();
  const url = encodeURIComponent(window.location.origin + '/#listing-' + id);
  const text = encodeURIComponent('Lihat penawaran ini di AkuBisa: ' + title);
  const panel = document.getElementById('share-panel-' + id);
  if (panel) {
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    return;
  }
}
function shareToTwitter(id, title) {
  const url = encodeURIComponent(window.location.origin + '/#listing-' + id);
  const text = encodeURIComponent(title + ' — temukan di AkuBisa');
  window.open('https://twitter.com/intent/tweet?text=' + text + '&url=' + url, '_blank');
}
function shareToLinkedin(id, title) {
  const url = encodeURIComponent(window.location.origin + '/#listing-' + id);
  window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank');
}
function copyListingLink(id, btn) {
  const url = window.location.origin + '/#listing-' + id;
  navigator.clipboard.writeText(url).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✅ Tersalin!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}
function listingCardHTML(l) {
  const cs = catStyle[l.category_slug] || catStyle['jasa'];
  const av = avColor(l.full_name || '');
  const ini = initials(l.full_name || '?');
  return `
    <div class="listing-card" onclick="openListingDetail(${l.id})">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <span class="cat-tag" style="background:${cs.bg};color:${cs.color}">${l.category_icon||'📌'} ${l.category_name||'Umum'}</span>
        <div style="position:relative">
          <button onclick="event.stopPropagation();document.getElementById('share-panel-'+${l.id}).style.display=document.getElementById('share-panel-'+${l.id}).style.display==='none'?'flex':'none'" style="background:none;border:none;cursor:pointer;padding:.2rem .4rem;font-size:.85rem;color:var(--muted);border-radius:6px;transition:background .2s" onmouseover="this.style.background='var(--warm)'" onmouseout="this.style.background='none'" title="Bagikan">↗ Bagikan</button>
          <div id="share-panel-${l.id}" style="display:none;position:absolute;right:0;top:110%;background:white;border:1.5px solid var(--border);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.12);padding:.5rem;flex-direction:column;gap:.3rem;z-index:10;min-width:160px">
            <button onclick="event.stopPropagation();shareToTwitter(${l.id},'${l.title.replace(/'/g,'\\\'')}')" style="background:none;border:none;cursor:pointer;padding:.4rem .8rem;font-size:.8rem;text-align:left;border-radius:8px;display:flex;align-items:center;gap:.5rem;color:var(--ink);white-space:nowrap" onmouseover="this.style.background='var(--warm)'" onmouseout="this.style.background='none'">𝕏 Twitter / X</button>
            <button onclick="event.stopPropagation();shareToLinkedin(${l.id},'${l.title.replace(/'/g,'\\\'')}')" style="background:none;border:none;cursor:pointer;padding:.4rem .8rem;font-size:.8rem;text-align:left;border-radius:8px;display:flex;align-items:center;gap:.5rem;color:var(--ink);white-space:nowrap" onmouseover="this.style.background='var(--warm)'" onmouseout="this.style.background='none'">💼 LinkedIn</button>
            <button onclick="event.stopPropagation();copyListingLink(${l.id},this)" style="background:none;border:none;cursor:pointer;padding:.4rem .8rem;font-size:.8rem;text-align:left;border-radius:8px;display:flex;align-items:center;gap:.5rem;color:var(--ink);white-space:nowrap" onmouseover="this.style.background='var(--warm)'" onmouseout="this.style.background='none'">🔗 Salin Link</button>
          </div>
        </div>
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:1rem;font-weight:700;line-height:1.3;margin-bottom:.5rem">${l.title}</div>
      <p style="font-size:.82rem;color:var(--muted);line-height:1.55;margin-bottom:1rem">${stripHTML(l.description).slice(0,110)}${stripHTML(l.description).length>110?'…':''}</p>
      ${(()=>{const imgs=extractImages(l.description);if(!imgs.length)return '';const shown=imgs.slice(0,3);const extra=imgs.length-3;return `<div style="display:flex;gap:.4rem;margin-bottom:.8rem;overflow:hidden" onclick="event.stopPropagation();openImageSlider(${l.id},${JSON.stringify(imgs).replace(/"/g,'&quot;')},0)">${shown.map((src,i)=>`<div style="position:relative;flex:1;height:72px;border-radius:8px;overflow:hidden;cursor:pointer"><img src="${src}" style="width:100%;height:100%;object-fit:cover">${i===2&&extra>0?`<div style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:white;font-weight:800;font-size:1rem">+${extra}</div>`:''}</div>`).join('')}</div>`;})()}
      <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:.8rem">
        <div style="display:flex;align-items:center;gap:.5rem">
          <div class="avatar" style="background:${av};width:28px;height:28px;font-size:.7rem">${ini}</div>
          <div>
            <div style="font-size:.78rem;font-weight:600;cursor:pointer;color:var(--ink)" onclick="event.stopPropagation();openPublicProfile(${l.user_id})">${l.full_name||'Anonim'}</div>
            <div style="font-size:.68rem;color:var(--muted)">${l.city||'Indonesia'}${l.is_verified?' · ✓':''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'Syne',sans-serif;font-size:.9rem;font-weight:800;color:var(--accent)">${l.price||'Nego'}</div>
          <div style="font-size:.65rem;color:var(--muted)">${l.price_unit||''}</div>
        </div>
      </div>
    </div>`;
}

// ===== LISTING DETAIL MODAL =====
async function openListingDetail(id) {
  // Pastikan currentUser ter-load sebelum render modal
  if (!currentUser) {
    const token = localStorage.getItem('akubisa_token');
    if (token) {
      try {
        const res = await api.me();
        if (res.id) currentUser = res;
      } catch(e) {}
    }
  }
  const l = await api.getListing(id);
  if (!l || !l.id) { showToast('Gagal memuat detail', 'error'); return; }
  const cs = catStyle[l.category_slug] || catStyle['jasa'];
  const av = avColor(l.full_name||'');
  const ini = initials(l.full_name||'?');
  document.getElementById('listing-modal-body').innerHTML = `
    <span class="cat-tag" style="background:${cs.bg};color:${cs.color}">${l.category_icon} ${l.category_name}</span>
    <h2 style="font-family:'Syne',sans-serif;font-size:1.3rem;font-weight:800;margin:.5rem 0 1rem;line-height:1.3">${l.title}</h2>
    <div class="listing-description" style="font-size:.9rem;line-height:1.7;color:#333;margin-bottom:1.5rem">${l.description}</div>
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;align-items:center;gap:1rem">
        <div class="avatar" style="background:${av};width:48px;height:48px;font-size:1rem;flex-shrink:0">${ini}</div>
        <div style="flex:1">
          <div style="font-weight:700">${l.full_name} ${l.is_verified?'<span style="font-size:.7rem;color:var(--accent2)">✓ Terverifikasi</span>':''}</div>
          <div style="font-size:.8rem;color:var(--muted)">${l.user_city||''}</div>
          ${l.bio?`<div style="font-size:.8rem;margin-top:.3rem;color:#555">${l.bio}</div>`:''}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap">
      <div>
        <div style="font-family:'Syne',sans-serif;font-size:1.4rem;font-weight:800;color:var(--accent)">${l.price||'Hubungi untuk harga'}</div>
        <div style="font-size:.75rem;color:var(--muted)">${l.price_unit||''}</div>
      </div>
      ${currentUser && currentUser.id !== l.user_id
        ? `<div style="display:flex;gap:.6rem;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="contactSeller(${l.user_id},'${(l.full_name||'').replace(/'/g,"\'")}',${l.id})">💬 Hubungi</button>
        <button class="btn btn-primary btn-sm" style="background:var(--accent2)" onclick="closeListingModal();openCreateTrxModal(${l.user_id},'${(l.full_name||'').replace(/'/g,"\'")}',${l.id},'listing')">💳 Bayar via AkuBisa</button>
        <button class="btn btn-outline btn-sm" onclick="openReviewModal(${l.user_id},'${(l.full_name||'').replace(/'/g,"\\'")}',${l.id})">⭐ Beri Ulasan</button>
        <button class="btn btn-outline btn-sm" onclick="closeListingModal();openPublicProfile(${l.user_id})">👤 Lihat Profil</button>
        <button class="btn btn-outline btn-sm" data-bookmarked="false" onclick="toggleBookmark(${l.id},this)" style="color:var(--muted)">🔖 Simpan</button>
        <button class="btn btn-outline btn-sm" onclick="shareToTwitter(${l.id},'${l.title.replace(/'/g,"\\'")}')">𝕏 Share</button>
        <button class="btn btn-outline btn-sm" onclick="shareToLinkedin(${l.id},'${l.title.replace(/'/g,"\\'")}')">💼 LinkedIn</button>
        <button class="btn btn-outline btn-sm" onclick="copyListingLink(${l.id},this)">🔗 Salin Link</button>
        <button class="btn btn-outline btn-sm" onclick="closeListingModal();setTimeout(()=>openReportModal(${l.user_id},'${(l.full_name||'').replace(/'/g,"\\'")}'," ${l.id}),200)" style="color:var(--danger);border-color:var(--danger)">🚩 Laporkan</button>
      </div>`
        : !currentUser ? `<button class="btn btn-primary" onclick="goTo('register');closeListingModal()">Daftar untuk Menghubungi</button>` : ''}
    </div>`;
  document.getElementById('listing-modal').classList.add('open');
}

function closeListingModal() {
  document.getElementById('listing-modal').classList.remove('open');
}

function contactSeller(receiverId, name, listingId) {
  openSendMsgModal(receiverId, name, listingId);
}

// ===== NOTIFIKASI PESAN =====
let notifPollInterval = null;
let lastUnreadCount = 0;

function startNotifPoll() {
  if (!currentUser) return;
  stopNotifPoll();
  checkUnreadMessages();
  pollNotifBadge(); // cek notif badge langsung
  notifPollInterval = setInterval(() => {
    checkUnreadMessages();
    pollNotifBadge();
  }, 30000);
}

function stopNotifPoll() {
  if (notifPollInterval) { clearInterval(notifPollInterval); notifPollInterval = null; }
}

async function checkUnreadMessages() {
  if (!currentUser) return;
  try {
    const convs = await api.getConversations();
    if (!Array.isArray(convs)) return;
    const totalUnread = convs.reduce((a,c) => a + parseInt(c.unread_count||0), 0);

    // Update badge di navbar
    updateNavBadge(totalUnread);

    // Tampilkan notifikasi popup jika ada pesan baru
    if (totalUnread > lastUnreadCount && currentPage !== 'messages') {
      const newMsgs = convs.filter(c => parseInt(c.unread_count||0) > 0);
      if (newMsgs.length > 0) {
        const sender = newMsgs[0].other_name;
        const preview = newMsgs[0].last_message || '';
        showNotifPopup(sender, preview.slice(0,50) + (preview.length>50?'…':''), newMsgs[0].id, newMsgs[0].other_id);
      }
    }
    lastUnreadCount = totalUnread;
  } catch(e) {}
}

function updateNavBadge(count) {
  const old = document.getElementById('nav-msg-badge');
  if (old) old.remove();
  if (count <= 0) return;
  const allLinks = document.querySelectorAll('#nav-links a, #mobile-nav-links a');
  let badgeAdded = false;
  allLinks.forEach(link => {
    if (link.getAttribute('onclick') && link.getAttribute('onclick').includes('messages')) {
      const badge = document.createElement('span');
      if (!badgeAdded) badge.id = 'nav-msg-badge';
      badgeAdded = true;
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.cssText = 'background:var(--accent);color:white;font-size:.6rem;font-weight:800;padding:.1rem .4rem;border-radius:100px;margin-left:.3rem;vertical-align:middle;display:inline-block';
      link.appendChild(badge);
    }
  });
  // Fallback: cari di seluruh navbar
  if (!badgeAdded) {
    const navEl = document.getElementById('nav-links');
    if (navEl) {
      const badge = document.createElement('span');
      badge.id = 'nav-msg-badge';
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.cssText = 'background:var(--accent);color:white;font-size:.6rem;font-weight:800;padding:.1rem .4rem;border-radius:100px;margin-left:.3rem;cursor:pointer';
      badge.onclick = () => goTo('messages');
      navEl.appendChild(badge);
    }
  }
}

function showNotifPopup(senderName, preview, convId, senderId) {
  // Hapus notif lama jika ada
  const old = document.getElementById('notif-popup');
  if (old) old.remove();

  const ini = initials(senderName);
  const av  = avColor(senderName);

  const popup = document.createElement('div');
  popup.id = 'notif-popup';
  popup.style.cssText = `
    position:fixed;bottom:5rem;right:2rem;
    background:var(--ink);color:white;
    border-radius:14px;padding:1rem 1.2rem;
    box-shadow:0 8px 32px rgba(0,0,0,.35);
    z-index:9998;cursor:pointer;
    animation:slideIn .3s ease;
    max-width:280px;min-width:220px;
    border-left:3px solid var(--accent);
  `;
  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.4rem">
      <div style="width:30px;height:30px;border-radius:50%;background:${av};display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0">${ini}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:.83rem">💬 Pesan baru</div>
        <div style="font-size:.78rem;color:rgba(255,255,255,.7)">${senderName}</div>
      </div>
      <button onclick="event.stopPropagation();document.getElementById('notif-popup').remove()" style="background:transparent;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:.9rem;padding:0;line-height:1">✕</button>
    </div>
    <div style="font-size:.78rem;color:rgba(255,255,255,.6);line-height:1.4">${preview}</div>
    <div style="font-size:.7rem;color:var(--accent);margin-top:.4rem;font-weight:600">Klik untuk membalas →</div>
  `;
  popup.onclick = () => {
    popup.remove();
    goTo('messages');
    setTimeout(() => openConversation(convId, senderName, senderId, ''), 400);
  };
  document.body.appendChild(popup);

  // Auto hilang setelah 6 detik
  setTimeout(() => { if (document.getElementById('notif-popup')) popup.remove(); }, 6000);
}

function scrollToHow() {
  const isHome = document.getElementById('page-home').classList.contains('active');
  if (!isHome) {
    goTo('home');
    setTimeout(() => {
      const el = document.getElementById('how-it-works');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 350);
  } else {
    const el = document.getElementById('how-it-works');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
}

window.goTo = goTo;
window.closeMobileMenu = closeMobileMenu;

// Hamburger visibility on resize
window.addEventListener('resize', () => {
  const hamburger = document.getElementById('hamburger-btn');
  if (hamburger) {
    hamburger.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
  }
  if (window.innerWidth > 768) closeMobileMenu();
});

// pollNotifBadge - cek pesan + notifikasi
async function pollNotifBadge() {
  checkUnreadMessages();
  // Cek notif badge
  try {
    const res = await api.getNotifications();
    const count = res.unread_count || 0;
    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch(e) {}
}

// ===== QUILL RICH TEXT EDITOR =====
let quillEditor = null;

function initQuillEditor() {
  if (quillEditor) return;
  if (!document.getElementById('post-desc-editor')) return;
  
  quillEditor = new Quill('#post-desc-editor', {
    theme: 'snow',
    placeholder: 'Jelaskan kemampuanmu / produkmu...',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ 'align': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['image', 'link'],
        ['clean']
      ],
      clipboard: { matchVisual: false }
    }
  });

  // Klik gambar → tampil tombol hapus
  quillEditor.root.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') {
      const existing = document.getElementById('quill-img-delete');
      if (existing) existing.remove();
      const btn = document.createElement('button');
      btn.id = 'quill-img-delete';
      btn.textContent = '✕ Hapus Gambar';
      btn.style.cssText = 'position:fixed;background:#ef4444;color:white;border:none;border-radius:6px;padding:.3rem .8rem;font-size:.75rem;font-weight:700;cursor:pointer;z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,.2)';
      btn.style.left = (e.clientX + 8) + 'px';
      btn.style.top = (e.clientY - 36) + 'px';
      btn.onclick = () => {
        e.target.remove();
        btn.remove();
      };
      document.body.appendChild(btn);
      setTimeout(() => { if (document.getElementById('quill-img-delete')) btn.remove(); }, 3000);
    } else {
      const existing = document.getElementById('quill-img-delete');
      if (existing) existing.remove();
    }
  });

  // Handle image upload
  quillEditor.getModule('toolbar').addHandler('image', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { showToast('Gambar max 5MB', 'error'); return; }
      const fd = new FormData();
      fd.append('image', file);
      showToast('Mengupload gambar...', 'info');
      try {
        const res = await fetch('/api/profile/upload-image', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('akubisa_token') },
          body: fd
        });
        const data = await res.json();
        if (data.url) {
          const range = quillEditor.getSelection();
          quillEditor.insertEmbed(range ? range.index : 0, 'image', data.url);
          showToast('Gambar berhasil diupload!', 'success');
        }
      } catch(e) { showToast('Gagal upload gambar', 'error'); }
    };
    input.click();
  });
}

function getQuillContent() {
  if (!quillEditor) return document.getElementById('post-desc').value;
  return quillEditor.root.innerHTML === '<p><br></p>' ? '' : quillEditor.root.innerHTML;
}

function setQuillContent(html) {
  if (!quillEditor) return;
  quillEditor.root.innerHTML = html || '';
}

// ===== IMAGE SLIDER =====
let sliderImages = [];
let sliderIndex = 0;

function openImageSlider(listingId, images, startIndex = 0) {
  sliderImages = images;
  sliderIndex = startIndex;

  const existing = document.getElementById('img-slider-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'img-slider-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem';
  modal.onclick = (e) => { if (e.target === modal) closeImageSlider(); };

  modal.innerHTML = `
    <button onclick="closeImageSlider()" style="position:absolute;top:1rem;right:1rem;background:rgba(255,255,255,.15);border:none;color:white;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:1.1rem">✕</button>
    <div style="position:relative;max-width:90vw;max-height:80vh;display:flex;align-items:center;gap:1rem">
      <button id="slider-prev" onclick="slideImage(-1)" style="background:rgba(255,255,255,.15);border:none;color:white;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.2rem;flex-shrink:0">‹</button>
      <img id="slider-img" src="${images[startIndex]}" style="max-width:80vw;max-height:75vh;object-fit:contain;border-radius:12px;box-shadow:0 8px 40px rgba(0,0,0,.5)">
      <button id="slider-next" onclick="slideImage(1)" style="background:rgba(255,255,255,.15);border:none;color:white;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:1.2rem;flex-shrink:0">›</button>
    </div>
    <div id="slider-dots" style="display:flex;gap:.5rem">
      ${images.map((_, i) => `<div onclick="goToSlide(${i})" style="width:8px;height:8px;border-radius:50%;background:${i===startIndex?'white':'rgba(255,255,255,.3)'};cursor:pointer;transition:background .2s"></div>`).join('')}
    </div>
    <div style="color:rgba(255,255,255,.5);font-size:.78rem">${startIndex+1} / ${images.length}</div>
  `;

  document.body.appendChild(modal);

  // Keyboard navigation
  document.addEventListener('keydown', sliderKeyHandler);
}

function sliderKeyHandler(e) {
  if (e.key === 'ArrowLeft') slideImage(-1);
  if (e.key === 'ArrowRight') slideImage(1);
  if (e.key === 'Escape') closeImageSlider();
}

function slideImage(dir) {
  sliderIndex = (sliderIndex + dir + sliderImages.length) % sliderImages.length;
  updateSlider();
}

function goToSlide(i) {
  sliderIndex = i;
  updateSlider();
}

function updateSlider() {
  document.getElementById('slider-img').src = sliderImages[sliderIndex];
  const dots = document.querySelectorAll('#slider-dots div');
  dots.forEach((d, i) => d.style.background = i === sliderIndex ? 'white' : 'rgba(255,255,255,.3)');
  document.querySelector('#img-slider-modal div:last-child').textContent = `${sliderIndex+1} / ${sliderImages.length}`;
}

function closeImageSlider() {
  const modal = document.getElementById('img-slider-modal');
  if (modal) modal.remove();
  document.removeEventListener('keydown', sliderKeyHandler);
}



// ===== NAVBAR SCROLL =====
window.addEventListener('scroll', () => {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  nav.style.background = 'var(--ink)';
  nav.style.boxShadow = window.scrollY > 10 ? '0 2px 20px rgba(0,0,0,.2)' : 'none';
});
