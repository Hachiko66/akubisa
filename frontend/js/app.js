// ===== STATE =====
let currentUser = null;
let currentPage = 'home';
let categories  = [];
let currentCategory = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
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
  checkResetToken();
  const hash = location.hash.replace('#','') || 'home';
  navigate(hash);
  renderNav();
  if (hash === 'home' || hash === '') renderHome();
  if (hash === 'dashboard') renderDashboard();
  if (hash === 'explore')   { renderExplore(); loadExplore(); }
  if (hash === 'profile')   renderProfile();
  if (hash === 'messages')  renderMessages();
  if (hash === 'job-requests') renderJobRequests();
  if (hash === 'bookmarks') renderBookmarks();
});

window.addEventListener('hashchange', () => {
  const page = location.hash.replace('#','') || 'home';
  navigate(page);
  renderNav();
  if (page === 'home')      renderHome();
  if (page === 'explore')   { renderExplore(); loadExplore(currentCategory); }
  if (page === 'dashboard') renderDashboard();
  if (page === 'profile')   renderProfile();
  if (page === 'messages')  renderMessages();
  if (page === 'job-requests') renderJobRequests();
  if (page === 'bookmarks') renderBookmarks();
  if (page === 'admin')     renderAdmin();
});

// ===== ROUTER — FIXED =====
function navigate(page) {
  const authPages = ['login','register','forgot-password','reset-password'];

  // Sembunyikan semua pages
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
    p.style.display = '';
  });

  // Tampilkan halaman aktif
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');

  // Navbar: sembunyikan di auth pages
  const nav = document.getElementById('main-nav');
  if (nav) nav.style.display = authPages.includes(page) ? 'none' : 'flex';

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
  if (page === 'bookmarks') renderBookmarks();
  if (page === 'admin')     renderAdmin();
}

// ===== NAV =====
function renderNav() {
  const links = document.getElementById('nav-links');
  const mobileLinks = document.getElementById('mobile-nav-links');
  if (!links) return;
  if (mobileLinks) mobileLinks.innerHTML = '';

  let desktopHTML = '';
  let mobileHTML = '';

  if (!currentUser) {
    desktopHTML = `
      <a onclick="goTo('explore')">Jelajahi</a>
      <a onclick="goTo('job-requests')">🙋 Aku Butuh</a>
      <a onclick="scrollToHow()">Cara Kerja</a>
      <a onclick="goTo('login')" style="font-weight:600">Masuk</a>
      <button class="btn btn-primary btn-sm" onclick="goTo('register')">Daftar</button>`;
    mobileHTML = `
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('explore'),100)">Jelajahi</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('job-requests'),100)">🙋 Aku Butuh</a>
      <a onclick="scrollToHow();closeMobileMenu()">Cara Kerja</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('login'),100)" style="font-weight:600">Masuk</a>
      <button class="btn btn-primary" onclick="closeMobileMenu();setTimeout(()=>goTo('register'),100)">Daftar</button>`;
  } else {
    const roleBadge = `<span class="role-badge ${currentUser.role==='worker'?'role-worker':'role-client'}" onclick="goTo('profile')" style="cursor:pointer">
      ${currentUser.role==='worker'?'⚡':'🔍'} ${currentUser.role==='worker'?'PEKERJA':'PENCARI'}
    </span>`;
    desktopHTML = `
      <a onclick="goTo('explore')">Jelajahi</a>
      <a onclick="goTo('job-requests')">🙋 Aku Butuh</a>
      <a onclick="goTo('dashboard')">Dashboard</a>
      <a onclick="goTo('bookmarks')">🔖 Simpan</a>
      <a onclick="goTo('messages')">💬 Pesan</a>
      ${roleBadge}
      <div style="position:relative;display:inline-flex;align-items:center">
        <button onclick="toggleNotifPanel()" style="background:var(--warm);border:1.5px solid var(--border);border-radius:100px;padding:.35rem .8rem;cursor:pointer;font-size:.82rem;display:inline-flex;align-items:center;gap:.3rem;font-weight:600;color:var(--ink)">🔔 Notif</button>
        <span id="notif-badge" style="display:none;position:absolute;top:-5px;right:-5px;background:var(--accent);color:white;font-size:.6rem;font-weight:800;min-width:17px;height:17px;border-radius:50%;align-items:center;justify-content:center;padding:0 3px;z-index:1"></span>
      </div>
      <button class="btn btn-outline btn-sm" onclick="goTo('profile')" style="font-weight:700">${initials(currentUser.full_name)}</button>
      <button class="btn btn-primary btn-sm" onclick="logout()">Keluar</button>`;
    mobileHTML = `
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('explore'),100)">Jelajahi</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('job-requests'),100)">🙋 Aku Butuh</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('dashboard'),100)">Dashboard</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('bookmarks'),100)">🔖 Simpan</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('messages'),100)">💬 Pesan</a>
      <a onclick="closeMobileMenu();setTimeout(()=>goTo('profile'),100)">${initials(currentUser.full_name)} — Profil</a>
      <button class="btn btn-primary" onclick="logout();closeMobileMenu()">Keluar</button>`;
  }

  links.innerHTML = desktopHTML;
  if (mobileLinks) mobileLinks.innerHTML = mobileHTML;
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
function listingCardHTML(l) {
  const cs = catStyle[l.category_slug] || catStyle['jasa'];
  const av = avColor(l.full_name || '');
  const ini = initials(l.full_name || '?');
  return `
    <div class="listing-card" onclick="openListingDetail(${l.id})">
      <span class="cat-tag" style="background:${cs.bg};color:${cs.color}">${l.category_icon||'📌'} ${l.category_name||'Umum'}</span>
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
        <button class="btn btn-primary btn-sm" onclick="contactSeller(${l.user_id},'${(l.full_name||'').replace(/'/g,"\\'")}',${l.id})">💬 Hubungi</button>
        <button class="btn btn-outline btn-sm" onclick="openReviewModal(${l.user_id},'${(l.full_name||'').replace(/'/g,"\\'")}',${l.id})">⭐ Beri Ulasan</button>
        <button class="btn btn-outline btn-sm" onclick="closeListingModal();openPublicProfile(${l.user_id})">👤 Lihat Profil</button>
        <button class="btn btn-outline btn-sm" data-bookmarked="false" onclick="toggleBookmark(${l.id},this)" style="color:var(--muted)">🔖 Simpan</button>
        <button class="btn btn-outline btn-sm" onclick="closeListingModal();setTimeout(()=>openReportModal(${l.user_id},'${(l.full_name||'').replace(/'/g,"\\'")}',${l.id}),200)" style="color:var(--danger);border-color:var(--danger)">🚩 Laporkan</button>
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
  }, 8000);
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
    if (link.textContent.trim().includes('Pesan')) {
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

// pollNotifBadge - alias checkUnreadMessages
function pollNotifBadge() {
  checkUnreadMessages();
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
