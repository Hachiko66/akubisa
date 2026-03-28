
function renderSocialLinks(profile, darkMode=false) {
  const socials = [
    { key:'social_twitter',  icon:'𝕏', label:'Twitter/X',  url: u => 'https://twitter.com/'+u },
    { key:'social_linkedin', icon:'💼', label:'LinkedIn',   url: u => u.startsWith('http') ? u : 'https://linkedin.com/in/'+u },
    { key:'social_github',   icon:'🐙', label:'GitHub',     url: u => 'https://github.com/'+u },
    { key:'social_tiktok',   icon:'🎵', label:'TikTok',     url: u => 'https://tiktok.com/@'+u },
    { key:'social_youtube',  icon:'▶️', label:'YouTube',    url: u => u.startsWith('http') ? u : 'https://youtube.com/@'+u },
    { key:'social_telegram', icon:'✈️', label:'Telegram',   url: u => 'https://t.me/'+u },
  ];
  const links = socials.filter(s => profile[s.key]);
  if (!links.length) return '';
  const color = darkMode ? 'rgba(255,255,255,.7)' : 'var(--muted)';
  const hoverColor = darkMode ? 'white' : 'var(--ink)';
  return `<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.6rem">
    ${links.map(s => `<a href="${s.url(profile[s.key])}" target="_blank" rel="noopener"
      style="display:inline-flex;align-items:center;gap:.3rem;font-size:.75rem;color:${color};text-decoration:none;background:${darkMode?'rgba(255,255,255,.08)':'var(--warm)'};padding:.25rem .6rem;border-radius:100px;transition:all .2s"
      onmouseover="this.style.color='${hoverColor}';this.style.background='${darkMode?'rgba(255,255,255,.15)':'var(--border)'}'"
      onmouseout="this.style.color='${color}';this.style.background='${darkMode?'rgba(255,255,255,.08)':'var(--warm)'}'">
      ${s.icon} ${profile[s.key]}
    </a>`).join('')}
  </div>`;
}
// ===== HOME PAGE =====
async function renderHome() {
  // Landing page pakai static HTML — hanya isi elemen dinamis
  try {
    // Kategori grid di landing
    const catGrid = document.getElementById('home-categories');
    if (catGrid && categories.length) {
      catGrid.innerHTML = categories.map(c =>
        `<div class="cat-card" onclick="filterAndGo('${c.slug}')">
          <div class="cat-icon">${c.icon}</div>
          <div class="cat-name">${c.name}</div>
          <div class="cat-count">${c.listing_count||0} ${t('cat_listings')}</div>
        </div>`).join('');
    }
    // Stats hero
    loadHeroStats && loadHeroStats();
  } catch(e) { console.error('renderHome error:', e); }
}


function filterAndGo(slug) {
  sessionStorage.setItem('explore_filter', slug);
  goTo('explore');
}

// ===== EXPLORE PAGE =====
let exploreFilter = 'semua';
let exploreSearch = '';

async function renderExplore() {
  const saved = sessionStorage.getItem('explore_filter');
  if (saved) { exploreFilter = saved; sessionStorage.removeItem('explore_filter'); }
  const chipWrap = document.getElementById('explore-chips');
  chipWrap.innerHTML =
    `<div class="chip ${exploreFilter==='semua'?'active':''}" onclick="setExploreFilter('semua',this)">Semua</div>` +
    categories.map(c=>`<div class="chip ${exploreFilter===c.slug?'active':''}" onclick="setExploreFilter('${c.slug}',this)">${c.icon} ${c.name}</div>`).join('');
  await fetchExplore();
}

let explorePage = 1;
let exploreLoading = false;
let exploreHasMore = true;
const EXPLORE_LIMIT = 12;

async function fetchExplore(reset = true) {
  if (reset) {
    explorePage = 1;
    exploreHasMore = true;
    document.getElementById('explore-grid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem"><div style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;display:inline-block"></div></div>`;
  }
  if (exploreLoading || !exploreHasMore) return;
  exploreLoading = true;

  let params = `limit=${EXPLORE_LIMIT}&page=${explorePage}`;
  if (exploreFilter !== 'semua') params += `&category=${exploreFilter}`;
  if (exploreSearch) params += `&search=${encodeURIComponent(exploreSearch)}`;

  try {
    const res = await api.getListings(params);
    const listings = res.listings || [];
    const total = res.total || 0;
    const grid = document.getElementById('explore-grid');

    if (reset) grid.innerHTML = '';

    if (listings.length === 0 && reset) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">Tidak ada penawaran ditemukan.</p>';
    } else {
      listings.forEach(l => {
        const div = document.createElement('div');
        div.innerHTML = listingCardHTML(l);
        grid.appendChild(div.firstElementChild);
      });
    }

    exploreHasMore = (explorePage * EXPLORE_LIMIT) < total;
    explorePage++;

    // Update/hapus sentinel
    const old = document.getElementById('scroll-sentinel');
    if (old) old.remove();
    if (exploreHasMore) {
      const sentinel = document.createElement('div');
      sentinel.id = 'scroll-sentinel';
      sentinel.style.cssText = 'grid-column:1/-1;text-align:center;padding:1rem;color:var(--muted);font-size:.83rem';
      sentinel.innerHTML = '<div style="width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;display:inline-block"></div>';
      grid.appendChild(sentinel);
      scrollObserver.observe(sentinel);
    }
  } catch(e) {
    document.getElementById('explore-grid').innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--danger)">Gagal memuat data.</p>';
  }
  exploreLoading = false;
}

// Infinite scroll observer
const scrollObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) fetchExplore(false);
  });
}, { threshold: 0.1 });

function setExploreFilter(slug, el) {
  exploreFilter = slug;
  document.querySelectorAll('#explore-chips .chip').forEach(c=>c.classList.remove('active'));
  if (el) el.classList.add('active');
  fetchExplore();
}

function doSearch() {
  exploreSearch = document.getElementById('explore-search').value;
  fetchExplore();
}

// ===== PROFILE PAGE =====
function renderQuickActions() {
  const el = document.getElementById('quick-action-buttons');
  if (!el || !currentUser) return;
  // Badge verified di header profil
  const vbadge = document.getElementById('profile-verified-badge');
  if (vbadge) {
    vbadge.style.display = currentUser.is_verified ? 'inline-flex' : 'none';
  }
  const isWorker = currentUser.role === 'worker';
  const isVerified = currentUser.is_verified;
  const kycBtn = isVerified
    ? `<button class="btn btn-sm" style="background:#f0fdf4;color:#166534;border:1.5px solid #bbf7d0;border-radius:100px;padding:.35rem .8rem;font-size:.75rem;cursor:default">✅ ${t('profile_verified')}</button>`
    : `<button class="btn btn-sm" style="background:#fef9c3;color:#854d0e;border:1.5px solid #fde047;border-radius:100px;padding:.35rem .8rem;font-size:.75rem;cursor:pointer;font-weight:600" onclick="openKycModal()">🪪 ${t('dash_kyc_btn')}</button>`;
  el.innerHTML = isWorker ? `
    ${kycBtn}
    <button class="btn btn-primary btn-sm" onclick="openPostModal()">⚡ ${t('dash_post_listing')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('job-requests')">🙋 ${t('nav_job_requests')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('wallet')">💰 ${t('wallet_title')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('transactions')">💳 ${t('trx_title')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('dashboard')">${t('dash_title')}</button>
    <button class="btn btn-outline btn-sm" onclick="openEditProfile()">${t('profile_edit')}</button>
    <button class="btn btn-danger btn-sm" onclick="logout()">${t('nav_logout')}</button>
  ` : `
    ${kycBtn}
    <button class="btn btn-primary btn-sm" onclick="openPostJobModal()">🙋 ${t('btn_post_job')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('job-requests')">${t('nav_job_requests')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('explore')">${t('nav_explore')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('transactions')">💳 ${t('trx_title')}</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('dashboard')">${t('dash_title')}</button>
    <button class="btn btn-outline btn-sm" onclick="openEditProfile()">${t('profile_edit')}</button>
    <button class="btn btn-danger btn-sm" onclick="logout()">${t('nav_logout')}</button>
  `;
}

async function renderProfile() {
  if (!currentUser) { goTo('login'); return; }
  // Refresh currentUser dari API agar is_verified selalu fresh
  try {
    const fresh = await api.me();
    if (fresh.id) {
      currentUser = fresh;
      localStorage.setItem('akubisa_user', JSON.stringify(fresh));
    }
  } catch(e) {}
  renderQuickActions();
  const u = currentUser;
  const ini = initials(u.full_name);
  const av  = avColor(u.full_name);

  // Avatar
  const avatarEl = document.getElementById('profile-avatar');
  if (u.avatar) {
    avatarEl.innerHTML = `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    avatarEl.style.background = av;
    avatarEl.textContent = ini;
  }

  document.getElementById('profile-name').textContent = u.full_name;
  document.getElementById('profile-email').textContent = u.email;
  document.getElementById('profile-city').textContent = u.city || t('profile_no_city');
  document.getElementById('profile-email2').textContent = u.email;
  document.getElementById('profile-city2').textContent = u.city || '-';
  document.getElementById('profile-phone2').textContent = u.phone || '-';
  document.getElementById('profile-role2').textContent = u.role === 'worker' ? t('role_worker_badge') : t('role_client_badge');
  document.getElementById('profile-bio-preview').textContent = u.bio ? u.bio.slice(0,60)+(u.bio.length>60?'…':'') : '';
  // Sosmed links di profil sendiri
  const selfSocialEl = document.getElementById('self-social-links');
  if (selfSocialEl) selfSocialEl.innerHTML = renderSocialLinks(u, true);

  const badge = document.getElementById('profile-role-label');
  badge.textContent = u.role === 'worker' ? t('badge_worker') : t('badge_client');
  badge.className = `role-badge ${u.role==='worker'?'role-worker':'role-client'}`;

  document.getElementById('sw-worker').classList.toggle('active', u.role==='worker');
  document.getElementById('sw-client').classList.toggle('active', u.role==='client');
}

// ===== SWITCH ROLE =====
async function doSwitchRole(role) {
  if (currentUser && currentUser.role === role) {
    showToast(`Kamu sudah dalam mode ${role === 'worker' ? 'Pekerja ⚡' : 'Pencari 🔍'}`, 'error');
    return;
  }
  document.getElementById('sw-worker').classList.toggle('active', role==='worker');
  document.getElementById('sw-client').classList.toggle('active', role==='client');
  try {
    const res = await api.switchRole(role);
    if (res.token) {
      localStorage.setItem('akubisa_token', res.token);
      localStorage.setItem('akubisa_user', JSON.stringify(res.user));
      currentUser = res.user;
      renderNav();
      renderProfile();
      showToast(role === 'worker' ? '⚡ Mode Pekerja aktif!' : '🔍 Mode Pencari aktif!', 'success');
    } else {
      document.getElementById('sw-worker').classList.toggle('active', currentUser.role==='worker');
      document.getElementById('sw-client').classList.toggle('active', currentUser.role==='client');
      showToast(res.message || 'Gagal mengganti mode', 'error');
    }
  } catch(e) { showToast('Koneksi gagal', 'error'); }
}

// ===== DASHBOARD =====
async function renderDashboard() {
  if (!currentUser) { goTo('login'); return; }
  document.getElementById('dash-name').textContent = currentUser.full_name.split(' ')[0];
  document.getElementById('dash-role').textContent = currentUser.role === 'worker' ? t('mode_worker') : t('mode_client');

  if (currentUser.role === 'worker') {
    document.getElementById('dash-worker').classList.remove('hidden');
    document.getElementById('dash-client').classList.add('hidden');
    try {
      const listings = await api.myListings();
      document.getElementById('dash-listing-count').textContent = Array.isArray(listings) ? listings.length : 0;
      const totalViews = Array.isArray(listings) ? listings.reduce((a,l)=>a+(l.views||0),0) : 0;
      document.getElementById('dash-views').textContent = totalViews;
      document.getElementById('dash-my-listings').innerHTML = Array.isArray(listings) && listings.length
        ? listings.map(l => {
            const imgs = extractImages(l.description);
            const thumbs = imgs.slice(0,3);
            const extra = imgs.length - 3;
            const thumbHTML = thumbs.length ? `<div style="display:flex;gap:.4rem;margin-bottom:.8rem" onclick="event.stopPropagation();openImageSlider(${l.id},${JSON.stringify(imgs).replace(/"/g,'&quot;')},0)">${thumbs.map((src,i)=>`<div style="position:relative;flex:1;height:72px;border-radius:8px;overflow:hidden;cursor:pointer"><img src="${src}" style="width:100%;height:100%;object-fit:cover">${i===2&&extra>0?`<div style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:white;font-weight:800">+${extra}</div>`:''}</div>`).join('')}</div>` : '';
            return `
          <div class="listing-card" style="cursor:pointer" onclick="openListingDetail(${l.id})">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.5rem">
              <span class="cat-tag" style="font-size:.7rem">${l.category_icon||'📌'} ${l.category_name||'Umum'}</span>
              <span style="font-size:.72rem;color:${l.is_active?'var(--success)':'var(--muted)'};font-weight:700">● ${l.is_active?'Aktif':'Nonaktif'}</span>
            </div>
            <div style="font-weight:700;font-size:.95rem;margin-bottom:.4rem">${l.title}</div>
            <p style="font-size:.8rem;color:var(--muted);margin-bottom:.8rem">${stripHTML(l.description).slice(0,100)}…</p>
            ${thumbHTML}
            <div style="font-size:.75rem;color:var(--muted);margin-bottom:.8rem">👁 ${l.views||0} ${t('listing_views')}</div>
            <div style="display:flex;gap:.5rem;justify-content:flex-end" onclick="event.stopPropagation()">
              <button class="btn btn-outline btn-sm" onclick="openEditListing(${l.id})">✏️ Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteListing(${l.id})">🗑 Hapus</button>
              <button class="btn btn-sm" style="background:linear-gradient(135deg,#e8521a,#c94415);color:white;border:none;font-size:.75rem;padding:.3rem .8rem;border-radius:8px;cursor:pointer" onclick="openBoostModal(${l.id}, '${l.title.replace(/'/g,'')}')">⚡ Boost</button>
            </div>
          </div>`;
          }).join('')
        : `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">
            <div style="font-size:2rem;margin-bottom:.8rem">📭</div>
            <p>Belum ada penawaran.</p>
            <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="openPostModal()">${t('btn_first_listing')}</button>
          </div>`;
    } catch(e) { console.error(e); }
  } else {
    document.getElementById('dash-worker').classList.add('hidden');
    document.getElementById('dash-client').classList.remove('hidden');
    try {
      const res = await api.getListings('limit=6');
      document.getElementById('dash-client-listings').innerHTML = (res.listings||[]).map(listingCardHTML).join('');
    } catch(e) {}
  }
}

async function deleteListing(id) {
  if (!confirm('Yakin ingin menghapus?')) return;
  const res = await api.deleteListing(id);
  showToast('Penawaran dihapus!', 'success');
  renderDashboard();
}

// ===== POST MODAL =====
let editListingId = null;

async function openPostModal() {
  if (!currentUser) { goTo('login'); return; }
  editListingId = null;
  document.getElementById('post-modal-title').textContent = t('post_modal_title');
  document.getElementById('post-form').reset();
  document.getElementById('post-category').innerHTML = categories.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  document.getElementById('post-modal').classList.add('open');
  setTimeout(initQuillEditor, 100);
}

async function openEditListing(id) {
  editListingId = id;
  const l = await api.getListing(id);
  document.getElementById('post-modal-title').textContent = t('btn_edit_listing');
  document.getElementById('post-category').innerHTML = categories.map(c=>`<option value="${c.id}" ${c.id==l.category_id?'selected':''}>${c.icon} ${c.name}</option>`).join('');
  document.getElementById('post-title').value = l.title;
  document.getElementById('post-desc').value = l.description;
  if (typeof setQuillContent === 'function') setQuillContent(l.description);
  document.getElementById('post-price').value = l.price||'';
  document.getElementById('post-price-unit').value = l.price_unit||'';
  document.getElementById('post-city').value = l.city||'';
  document.getElementById('post-modal').classList.add('open');
}

function closePostModal() { document.getElementById('post-modal').classList.remove('open'); }

async function submitListing() {
  const data = {
    title: document.getElementById('post-title').value.trim(),
    description: (typeof getQuillContent === 'function' ? getQuillContent() : document.getElementById('post-desc').value).trim(),
    category_id: document.getElementById('post-category').value,
    price: document.getElementById('post-price').value.trim(),
    price_unit: document.getElementById('post-price-unit').value.trim(),
    city: document.getElementById('post-city').value.trim(),
    listing_type: document.getElementById('post-listing-type')?.value || 'service',
    file_url: document.getElementById('post-file-url')?.value || null,
    file_name: document.getElementById('post-file-name')?.value || null,
  };
  
  // Validasi file untuk produk digital
  if (data.listing_type === 'digital' && !data.file_url) {
    showToast('Upload file produk terlebih dahulu!', 'error');
    return;
  }
  if (!data.title || !data.description) { showToast('Judul dan deskripsi wajib diisi!', 'error'); return; }
  const btn = document.getElementById('post-submit-btn');
  btn.innerHTML = '<span class="spinner"></span>Menyimpan...';
  btn.disabled = true;
  try {
    const res = editListingId ? await api.updateListing(editListingId, data) : await api.createListing(data);
    btn.innerHTML = t('btn_post_now'); btn.disabled = false;
    if (res.listing || res.message?.includes('berhasil')) {
      showToast(editListingId ? 'Diperbarui! ✅' : 'Berhasil diposting! 🎉', 'success');
      closePostModal();
      renderDashboard();
    } else {
      showToast(res.message || 'Gagal menyimpan', 'error');
    }
  } catch(e) { btn.innerHTML = t('btn_post_now'); btn.disabled = false; showToast('Koneksi gagal', 'error'); }
}

// ===== EDIT PROFILE =====
function openEditProfile() {
  if (!currentUser) return;
  const u = currentUser;
  document.getElementById('ep-name').value  = u.full_name || '';
  document.getElementById('ep-bio').value   = u.bio || '';
  document.getElementById('ep-city').value  = u.city || '';
  document.getElementById('ep-phone').value = u.phone || '';
  document.getElementById('ep-error').textContent = '';
  // Set avatar preview
  const preview = document.getElementById('avatar-preview');
  if (u.avatar) {
    preview.innerHTML = `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    preview.style.background = avColor(u.full_name);
    preview.style.display = 'flex';
    preview.style.alignItems = 'center';
    preview.style.justifyContent = 'center';
    preview.textContent = initials(u.full_name);
  }
  document.getElementById('edit-profile-modal').classList.add('open');
}

function closeEditProfile() {
  document.getElementById('edit-profile-modal').classList.remove('open');
}

async function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran file maksimal 2MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('avatar-preview').innerHTML =
      `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  };
  reader.readAsDataURL(file);
  const form = new FormData();
  form.append('avatar', file);
  document.getElementById('avatar-upload-label').textContent = t('uploading');
  const res = await api.uploadAvatar(form);
  document.getElementById('avatar-upload-label').textContent = t('change_photo');
  if (res.avatar) {
    currentUser.avatar = res.avatar;
    localStorage.setItem('akubisa_user', JSON.stringify(currentUser));
    showToast('Foto profil diperbarui! ✅', 'success');
  } else {
    showToast(res.message || 'Gagal upload', 'error');
  }
}

async function saveProfile() {
  const full_name = document.getElementById('ep-name').value.trim();
  const bio       = document.getElementById('ep-bio').value.trim();
  const city      = document.getElementById('ep-city').value.trim();
  const phone     = document.getElementById('ep-phone').value.trim();
  const errEl     = document.getElementById('ep-error');
  if (!full_name) { errEl.textContent = t('err_name_required'); return; }
  const btn = document.getElementById('ep-save-btn');
  btn.innerHTML = '<span class="spinner"></span>Menyimpan...';
  btn.disabled = true;
  const social_twitter  = document.getElementById('ep-twitter')?.value.trim() || '';
  const social_linkedin = document.getElementById('ep-linkedin')?.value.trim() || '';
  const social_github   = document.getElementById('ep-github')?.value.trim() || '';
  const social_tiktok   = document.getElementById('ep-tiktok')?.value.trim() || '';
  const social_youtube  = document.getElementById('ep-youtube')?.value.trim() || '';
  const social_telegram = document.getElementById('ep-telegram')?.value.trim() || '';
  const res = await api.updateProfile({ full_name, bio, city, phone, social_twitter, social_linkedin, social_github, social_tiktok, social_youtube, social_telegram });
  btn.innerHTML = t('profile_save'); btn.disabled = false;
  if (res.token) {
    localStorage.setItem('akubisa_token', res.token);
    localStorage.setItem('akubisa_user', JSON.stringify(res.user));
    currentUser = res.user;
    renderNav();
    renderProfile();
    closeEditProfile();
    showToast('Profil berhasil diperbarui! 🎉', 'success');
  } else {
    errEl.textContent = res.message || 'Gagal menyimpan';
  }
}

// ===== MESSAGES PAGE =====
let activeConvId = null;
let chatPollInterval = null;

async function renderMessages() {
  if (!currentUser) { goTo('login'); return; }
  stopChatPoll();
  await loadConversations();
}

async function loadConversations() {
  const list = document.getElementById('conversation-list');
  list.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.83rem">Memuat...</div>';
  try {
    const convs = await api.getConversations();
    if (!Array.isArray(convs) || convs.length === 0) {
      list.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:.83rem">Belum ada percakapan.<br>Mulai dari halaman penawaran!</div>';
      return;
    }
    const totalUnread = convs.reduce((a,c)=>a+parseInt(c.unread_count||0),0);
    const badge = document.getElementById('msg-unread-badge');
    if (totalUnread > 0) { badge.textContent = totalUnread + ' baru'; badge.style.display='inline'; }
    else badge.style.display = 'none';

    list.innerHTML = convs.map(c => {
      const av = avColor(c.other_name||'');
      const ini = initials(c.other_name||'?');
      const unread = parseInt(c.unread_count||0);
      const time = new Date(c.last_message_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'});
      return `
        <div onclick="openConversation(${c.id},'${(c.other_name||'').replace(/'/g,"\\'")}',${c.other_id},'${c.listing_title||''}')"
          style="padding:1rem 1.2rem;border-bottom:1px solid var(--border);cursor:pointer;display:flex;gap:.8rem;align-items:center;transition:background .2s;${activeConvId===c.id?'background:var(--warm)':''}"
          onmouseover="this.style.background='var(--warm)'" onmouseout="this.style.background='${activeConvId===c.id?'var(--warm)':'white'}'">
          <div class="avatar" style="background:${av};width:38px;height:38px;font-size:.8rem;flex-shrink:0">${ini}</div>
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:${unread?'700':'600'};font-size:.85rem">${c.other_name}</span>
              <span style="font-size:.7rem;color:var(--muted)">${time}</span>
            </div>
            <div style="font-size:.78rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px">${c.last_message||''}</div>
          </div>
          ${unread?`<span style="background:var(--accent);color:white;font-size:.65rem;font-weight:700;padding:.1rem .5rem;border-radius:100px">${unread}</span>`:''}
        </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--danger);font-size:.83rem">Gagal memuat percakapan</div>';
  }
}

async function openConversation(convId, otherName, otherId, listingTitle) {
  activeConvId = convId;
  document.getElementById('chat-placeholder').style.display = 'none';
  const wrap = document.getElementById('chat-messages-wrap');
  wrap.style.display = 'flex';

  const av = avColor(otherName);
  const ini = initials(otherName);
  document.getElementById('chat-header-avatar').style.background = av;
  document.getElementById('chat-header-avatar').textContent = ini;
  document.getElementById('chat-header-name').textContent = otherName;
  document.getElementById('chat-header-listing').textContent = listingTitle ? 'Re: ' + listingTitle : '';

  await loadMessages(convId);
  loadConversations();
  startChatPoll(convId);
  document.getElementById('chat-input').focus();
}

async function loadMessages(convId) {
  try {
    const msgs = await api.getMessages(convId);
    const container = document.getElementById('chat-messages');
    if (!Array.isArray(msgs)) return;
    container.innerHTML = msgs.map(m => {
      const isMe = m.sender_id === currentUser.id;
      const time = new Date(m.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
      return `
        <div style="display:flex;flex-direction:column;align-items:${isMe?'flex-end':'flex-start'};gap:.2rem">
          <div style="max-width:75%;padding:.6rem .9rem;border-radius:${isMe?'14px 14px 4px 14px':'14px 14px 14px 4px'};background:${isMe?'var(--accent)':'var(--warm)'};color:${isMe?'white':'var(--ink)'};font-size:.85rem;line-height:1.5;word-break:break-word">${m.content}</div>
          <span style="font-size:.65rem;color:var(--muted)">${time}</span>
        </div>`;
    }).join('');
    container.scrollTop = container.scrollHeight;
  } catch(e) {}
}

async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const content = input.value.trim();
  if (!content || !activeConvId) return;

  // Optimistic UI
  const container = document.getElementById('chat-messages');
  const time = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  container.innerHTML += `
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:.2rem">
      <div style="max-width:75%;padding:.6rem .9rem;border-radius:14px 14px 4px 14px;background:var(--accent);color:white;font-size:.85rem;line-height:1.5">${content}</div>
      <span style="font-size:.65rem;color:var(--muted)">${time}</span>
    </div>`;
  container.scrollTop = container.scrollHeight;
  input.value = '';

  // Ambil receiver_id dari conversation
  try {
    const convs = await api.getConversations();
    const conv = convs.find(c=>c.id==activeConvId);
    if (conv) {
      await api.sendMessage({ receiver_id: conv.other_id, content, conversation_id: activeConvId });
      loadConversations();
    }
  } catch(e) {}
}

function startChatPoll(convId) {
  stopChatPoll();
  chatPollInterval = setInterval(() => { if(activeConvId===convId) loadMessages(convId); }, 5000);
}

function stopChatPoll() {
  if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
}

// ===== SEND FIRST MESSAGE MODAL =====
function openSendMsgModal(receiverId, receiverName, listingId) {
  if (!currentUser) { goTo('login'); return; }
  document.getElementById('send-msg-receiver-id').value = receiverId;
  document.getElementById('send-msg-listing-id').value = listingId || '';
  document.getElementById('send-msg-to-name').textContent = receiverName;
  document.getElementById('send-msg-content').value = '';
  document.getElementById('send-msg-modal').classList.add('open');
}

function closeSendMsgModal() { document.getElementById('send-msg-modal').classList.remove('open'); }

async function doSendFirstMessage() {
  const receiver_id = document.getElementById('send-msg-receiver-id').value;
  const listing_id  = document.getElementById('send-msg-listing-id').value;
  const content     = document.getElementById('send-msg-content').value.trim();
  if (!content) { showToast('Tulis pesan dulu!', 'error'); return; }
  const btn = document.getElementById('send-msg-btn');
  btn.innerHTML = '<span class="spinner"></span>Mengirim...'; btn.disabled = true;
  const res = await api.sendMessage({ receiver_id: parseInt(receiver_id), content, listing_id: listing_id||null });
  btn.innerHTML = t('btn_send_msg'); btn.disabled = false;
  if (res.conversation_id) {
    closeSendMsgModal();
    showToast('Pesan terkirim! 💬', 'success');
    goTo('messages');
    setTimeout(() => openConversation(res.conversation_id, document.getElementById('send-msg-to-name').textContent, parseInt(receiver_id), ''), 500);
  } else {
    showToast(res.message || 'Gagal mengirim', 'error');
  }
}

// ===== PUBLIC PROFILE =====
let pubProfileUserId = null;

async function openPublicProfile(userId) {
  pubProfileUserId = userId;
  goTo('public-profile');
  await renderPublicProfile(userId);
}

async function renderPublicProfile(userId) {
  try {
    const [profile, reviewData] = await Promise.all([
      api.getProfile(userId),
      api.getReviews(userId)
    ]);

    // Avatar
    const avatarEl = document.getElementById('pub-avatar');
    const ini = initials(profile.full_name || '?');
    const av  = avColor(profile.full_name || '');
    if (profile.avatar) {
      avatarEl.innerHTML = `<img src="${profile.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    } else {
      avatarEl.style.background = av;
      avatarEl.textContent = ini;
    }

    document.getElementById('pub-name').textContent = profile.full_name || '-';
    document.getElementById('pub-city').textContent = profile.city || 'Indonesia';
    document.getElementById('pub-listings').textContent = (profile.listing_count || 0);
    document.getElementById('pub-bio').textContent = profile.bio || '';
    // Completed transactions
    const completedEl = document.getElementById('pub-completed-trx');
    if (completedEl) completedEl.textContent = profile.completed_transactions || 0;
    // Sosmed links di profil publik
    const pubSocialEl = document.getElementById('pub-social-links');
    if (pubSocialEl) pubSocialEl.innerHTML = renderSocialLinks(profile, true);

    if (profile.is_verified) {
      const badge = document.getElementById('pub-verified');
      badge.style.display = 'inline-flex';
    }

    // Rating badge
    const avg = parseFloat(reviewData.stats?.avg_rating || 0);
    const total = parseInt(reviewData.stats?.total || 0);
    document.getElementById('pub-rating-badge').textContent = avg > 0 ? `⭐ ${avg.toFixed(1)} (${total} ulasan)` : 'Belum ada ulasan';
    document.getElementById('pub-avg-rating').textContent = avg > 0 ? avg.toFixed(1) : '-';
    document.getElementById('pub-stars-display').textContent = starsHTML(avg, true);
    document.getElementById('pub-total-reviews').textContent = total + ' ulasan';

    // Rating bars
    renderRatingBars(reviewData.stats);

    // Tombol aksi
    if (currentUser && currentUser.id !== userId) {
      const msgBtn = document.getElementById('pub-msg-btn');
      msgBtn.style.display = 'block';
      msgBtn.onclick = () => openSendMsgModal(userId, profile.full_name, null);

      const revBtn = document.getElementById('pub-review-btn');
      revBtn.style.display = 'block';
      revBtn.onclick = () => openReviewModal(userId, profile.full_name, null);

      // Tambah report button (hapus dulu jika sudah ada)
      const existing = document.getElementById('pub-report-btn');
      if (existing) existing.remove();
      const reportBtn = document.createElement('button');
      reportBtn.id = 'pub-report-btn';
      reportBtn.className = 'btn btn-sm';
      reportBtn.style.cssText = 'color:var(--danger);border:1.5px solid var(--danger);border-radius:100px;padding:.4rem 1rem;font-size:.8rem;cursor:pointer;background:transparent';
      reportBtn.textContent = '🚩 Laporkan';
      reportBtn.onclick = () => openReportModal(userId, profile.full_name, null);
      document.getElementById('pub-msg-btn').parentElement.appendChild(reportBtn);
    }

    // Load listings
    const listRes = await api.getListings(`user_id=${userId}&limit=12`);
    const myListings = listRes.listings || [];
    document.getElementById('pub-listings-grid').innerHTML = myListings.length
      ? myListings.map(listingCardHTML).join('')
      : '<p style="color:var(--muted);font-size:.85rem">Belum ada penawaran aktif.</p>';

    // Reviews
    renderReviewList(reviewData.reviews || []);
    // Portfolio
    loadPublicPortfolio(userId);
  } catch(e) { console.error('renderPublicProfile error:', e); }
}

async function loadPublicPortfolio(userId) {
  try {
    const items = await api.getPortfolio(userId);
    const section = document.getElementById('pub-portfolio-section');
    const grid = document.getElementById('pub-portfolio-grid');
    if (!section || !grid) return;
    if (!items || !items.length) { section.style.display='none'; return; }
    section.style.display = 'block';
    grid.innerHTML = items.map((p,pi) => {
      const photosJson = JSON.stringify(p.photos||[]).replace(/"/g,'&quot;');
      return `
      <div style="background:white;border:1.5px solid var(--border);border-radius:14px;overflow:hidden;transition:box-shadow .2s;cursor:pointer" onclick="openPortoViewer(${pi})" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow='none'">
        ${p.photos&&p.photos.length
          ? `<div style="position:relative;height:180px;overflow:hidden">
              <img src="${p.photos[0]}" style="width:100%;height:100%;object-fit:cover">
              ${p.photos.length>1?`<span style="position:absolute;bottom:.4rem;right:.4rem;background:rgba(0,0,0,.55);color:white;font-size:.65rem;padding:.2rem .45rem;border-radius:100px">+${p.photos.length-1} foto</span>`:''}
            </div>`
          : `<div style="height:90px;background:linear-gradient(135deg,var(--warm),#e8e0d5);display:flex;align-items:center;justify-content:center;font-size:2.5rem">🗂️</div>`}
        <div style="padding:.9rem 1rem 1rem">
          <div style="font-weight:700;font-size:.92rem;margin-bottom:.3rem;line-height:1.3">${p.title}</div>
          ${p.description?`<p style="font-size:.78rem;color:var(--muted);line-height:1.5;margin-bottom:.5rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${p.description}</p>`:''}
          ${p.client_rating?`<div style="font-size:.78rem;color:#f59e0b">★ ${p.client_rating}/5</div>`:''}
          <div style="font-size:.7rem;color:var(--muted);margin-top:.4rem">${new Date(p.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div>
        </div>
      </div>`;
    }).join('');
    window._portoItems = items;
  } catch(e) { console.error('portfolio publik error:', e); }
}

function openPortoViewer(idx) {
  const items = window._portoItems || [];
  const p = items[idx];
  if (!p) return;
  let photoIdx = 0;
  const photos = p.photos || [];

  // Buat overlay
  const overlay = document.createElement('div');
  overlay.id = 'porto-viewer-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1rem';
  overlay.onclick = (e) => { if(e.target===overlay) closePortoViewer(); };

  window._portoViewerIdx = 0;
  window._portoViewerPhotos = photos;
  window._portoViewerItem = p;

  const renderViewer = () => {
    const ci = window._portoViewerIdx;
    const ph = window._portoViewerPhotos;
    const item = window._portoViewerItem;
    // Update hanya gambar aktif dan thumbnail
    const imgEl = document.getElementById('porto-main-img');
    const counterEl = document.getElementById('porto-counter');
    const thumbsEl = document.getElementById('porto-thumbs');
    if (imgEl) imgEl.src = ph[ci] || '';
    if (counterEl) counterEl.textContent = `${ci+1}/${ph.length}`;
    if (thumbsEl) thumbsEl.querySelectorAll('img').forEach((img,i) => {
      img.style.opacity = i===ci ? '1' : '0.5';
      img.style.border = i===ci ? '2px solid white' : '2px solid transparent';
    });
  };

  // Build HTML sekali saja
  const ph = photos;
  const item = p;
  overlay.innerHTML = `
    <button onclick="closePortoViewer()" style="position:absolute;top:1rem;right:1rem;background:rgba(255,255,255,.15);border:none;color:white;width:36px;height:36px;border-radius:50%;font-size:1.2rem;cursor:pointer;z-index:10">×</button>
    <div style="max-width:700px;width:100%">
      ${ph.length ? `
        <div style="position:relative;background:#111;border-radius:12px;overflow:hidden;margin-bottom:1rem;min-height:200px;max-height:60vh;display:flex;align-items:center;justify-content:center">
          <img id="porto-main-img" src="${ph[0]}" style="max-width:100%;max-height:60vh;object-fit:contain">
          ${ph.length>1?`
            <button onclick="event.stopPropagation();prevPortoPhoto()" style="position:absolute;left:.5rem;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.25);border:none;color:white;width:44px;height:44px;border-radius:50%;font-size:1.6rem;cursor:pointer;z-index:10">‹</button>
            <button onclick="event.stopPropagation();nextPortoPhoto()" style="position:absolute;right:.5rem;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.25);border:none;color:white;width:44px;height:44px;border-radius:50%;font-size:1.6rem;cursor:pointer;z-index:10">›</button>
            <span id="porto-counter" style="position:absolute;bottom:.5rem;right:.7rem;background:rgba(0,0,0,.5);color:white;font-size:.72rem;padding:.2rem .5rem;border-radius:100px">1/${ph.length}</span>
          `:''}
        </div>
        ${ph.length>1?`<div id="porto-thumbs" style="display:flex;gap:.4rem;justify-content:center;margin-bottom:1rem">${ph.map((photo,i)=>`<img src="${photo}" onclick="event.stopPropagation();setPortoPhoto(${i})" style="width:48px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer;opacity:${i===0?1:.5};border:${i===0?'2px solid white':'2px solid transparent'}">`).join('')}</div>`:''}`
      : ''}
      <div style="background:rgba(255,255,255,.08);border-radius:12px;padding:1.2rem;color:white">
        <div style="font-weight:700;font-size:1.1rem;margin-bottom:.5rem">${item.title}</div>
        ${item.description?`<p style="font-size:.85rem;color:rgba(255,255,255,.7);line-height:1.6;margin-bottom:.7rem">${item.description}</p>`:''}
        ${item.client_rating?`<div style="color:#f59e0b;font-size:.85rem">★ ${item.client_rating}/5</div>`:''}
      </div>
    </div>`;

  window._portoViewerRender = renderViewer;
  renderViewer();
  document.body.appendChild(overlay);
}

function closePortoViewer() {
  const el = document.getElementById('porto-viewer-overlay');
  if (el) el.remove();
}

function nextPortoPhoto() {
  const photos = window._portoViewerPhotos || [];
  window._portoViewerIdx = (window._portoViewerIdx + 1) % photos.length;
  window._portoViewerRender && window._portoViewerRender();
}

function prevPortoPhoto() {
  const photos = window._portoViewerPhotos || [];
  window._portoViewerIdx = (window._portoViewerIdx - 1 + photos.length) % photos.length;
  window._portoViewerRender && window._portoViewerRender();
}

function setPortoPhoto(i) {
  window._portoViewerIdx = i;
  window._portoViewerRender && window._portoViewerRender();
}

function renderRatingBars(stats) {
  if (!stats) return;
  const total = parseInt(stats.total) || 1;
  const bars = document.getElementById('pub-rating-bars');
  bars.innerHTML = [5,4,3,2,1].map(n => {
    const count = parseInt(stats[['','one','two','three','four','five'][n]] || 0);
    const pct = Math.round((count / total) * 100);
    return `
      <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.3rem">
        <span style="font-size:.72rem;color:var(--muted);width:12px">${n}</span>
        <span style="font-size:.7rem">⭐</span>
        <div style="flex:1;height:6px;background:var(--warm);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--accent3);border-radius:3px;transition:width .5s"></div>
        </div>
        <span style="font-size:.7rem;color:var(--muted);width:20px">${count}</span>
      </div>`;
  }).join('');
}

function renderReviewList(reviews) {
  const container = document.getElementById('pub-reviews-list');
  if (!reviews.length) {
    container.innerHTML = '<div class="card" style="text-align:center;color:var(--muted);font-size:.85rem;padding:2rem">Belum ada ulasan.</div>';
    return;
  }
  container.innerHTML = reviews.map(r => {
    const ini = initials(r.reviewer_name || '?');
    const av  = avColor(r.reviewer_name || '');
    const date = new Date(r.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
    const isOwn = currentUser && r.reviewer_id === currentUser.id;
    return `
      <div class="card" style="margin-bottom:1rem;padding:1rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.6rem">
          <div style="display:flex;align-items:center;gap:.6rem">
            <div class="avatar" style="background:${av};width:32px;height:32px;font-size:.72rem;flex-shrink:0">${ini}</div>
            <div>
              <div style="font-weight:600;font-size:.83rem">${r.reviewer_name}</div>
              <div style="font-size:.7rem;color:var(--muted)">${date}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <span style="font-size:.85rem">${starsHTML(r.rating)}</span>
            ${isOwn ? `<button onclick="deleteMyReview(${r.id})" style="background:transparent;border:none;color:var(--muted);cursor:pointer;font-size:.8rem;padding:0" title="Hapus ulasan">✕</button>` : ''}
          </div>
        </div>
        ${r.listing_title ? `<div style="font-size:.72rem;color:var(--accent);margin-bottom:.4rem">Re: ${r.listing_title}</div>` : ''}
        ${r.comment ? `<p style="font-size:.83rem;color:#444;line-height:1.55">${r.comment}</p>` : ''}
      </div>`;
  }).join('');
}

function starsHTML(rating, text=false) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  let s = '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - (half?1:0));
  return text ? s : s;
}

// ===== REVIEW MODAL =====
let selectedStar = 0;
const starLabels = ['','Sangat Buruk','Buruk','Cukup','Bagus','Sangat Bagus!'];

function openReviewModal(reviewedId, name, listingId) {
  if (!currentUser) { goTo('login'); return; }
  selectedStar = 0;
  document.getElementById('review-reviewed-id').value = reviewedId;
  document.getElementById('review-listing-id').value = listingId || '';
  document.getElementById('review-to-name').textContent = name;
  document.getElementById('review-comment').value = '';
  document.getElementById('review-error').textContent = '';
  resetStars();
  document.getElementById('review-modal').classList.add('open');
}

function closeReviewModal() {
  document.getElementById('review-modal').classList.remove('open');
}

function hoverStars(n) {
  document.querySelectorAll('#star-selector span').forEach((s,i) => {
    s.textContent = i < n ? '★' : '☆';
    s.style.color = i < n ? 'var(--accent3)' : 'var(--muted)';
  });
  document.getElementById('star-label').textContent = starLabels[n];
}

function resetStars() {
  document.querySelectorAll('#star-selector span').forEach((s,i) => {
    s.textContent = i < selectedStar ? '★' : '☆';
    s.style.color = i < selectedStar ? 'var(--accent3)' : 'var(--muted)';
  });
  document.getElementById('star-label').textContent = selectedStar ? starLabels[selectedStar] : '';
}

function selectStar(n) {
  selectedStar = n;
  resetStars();
}

async function submitReview() {
  const reviewed_id = parseInt(document.getElementById('review-reviewed-id').value);
  const listing_id  = document.getElementById('review-listing-id').value || null;
  const comment     = document.getElementById('review-comment').value.trim();
  const errEl       = document.getElementById('review-error');

  if (!selectedStar) { errEl.textContent = 'Pilih rating bintang dulu!'; return; }

  const btn = document.getElementById('review-submit-btn');
  btn.innerHTML = '<span class="spinner"></span>Mengirim...'; btn.disabled = true;

  const res = await api.postReview({ reviewed_id, listing_id, rating: selectedStar, comment });
  btn.innerHTML = t('btn_review'); btn.disabled = false;

  if (res.review) {
    closeReviewModal();
    showToast('Ulasan berhasil dikirim! ⭐', 'success');
    if (pubProfileUserId) renderPublicProfile(pubProfileUserId);
  } else {
    errEl.textContent = res.message || 'Gagal mengirim ulasan';
  }
}

async function deleteMyReview(reviewId) {
  if (!confirm('Hapus ulasan ini?')) return;
  const res = await api.deleteReview(reviewId);
  if (res.message) {
    showToast('Ulasan dihapus!', 'success');
    if (pubProfileUserId) renderPublicProfile(pubProfileUserId);
  }
}

function loadExplore(cat) { if(cat) exploreFilter = cat; renderExplore(); }

// ===== AKU BUTUH / JOB REQUESTS =====
let jobPage = 1;
let jobLoading = false;
let jobHasMore = true;
let jobSearch = '';
let jobFilter = 'semua';

async function renderJobRequests() {
  jobPage = 1; jobHasMore = true; jobSearch = ''; jobFilter = 'semua';
  
  // Render category chips
  const chipsEl = document.getElementById('job-chips');
  if (chipsEl && categories.length) {
    chipsEl.innerHTML = `<span class="chip active" onclick="setJobFilter('semua',this)">Semua</span>` +
      categories.map(c => `<span class="chip" onclick="setJobFilter('${c.slug}',this)">${c.icon} ${c.name}</span>`).join('');
  }
  await fetchJobRequests(true);
}

async function fetchJobRequests(reset = true) {
  if (reset) { jobPage = 1; jobHasMore = true; }
  if (jobLoading || !jobHasMore) return;
  jobLoading = true;

  const grid = document.getElementById('job-requests-grid');
  if (reset) grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem"><div style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;display:inline-block"></div></div>`;

  let params = `limit=12&page=${jobPage}`;
  if (jobFilter !== 'semua') params += `&category=${jobFilter}`;
  jobSearch = document.getElementById('job-search')?.value || '';
  if (jobSearch) params += `&search=${encodeURIComponent(jobSearch)}`;

  try {
    const res = await api.getJobRequests(params);
    const requests = res.requests || [];
    const total = res.total || 0;

    if (reset) grid.innerHTML = '';

    if (requests.length === 0 && reset) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">
        <div style="font-size:2.5rem;margin-bottom:1rem">🔍</div>
        <p>Belum ada kebutuhan yang diposting.</p>
        ${currentUser ? `<button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="openPostJobModal()">${t('btn_post_job_first')}</button>` : ''}
      </div>`;
    } else {
      requests.forEach(r => {
        const div = document.createElement('div');
        div.innerHTML = jobRequestCardHTML(r);
        grid.appendChild(div.firstElementChild);
      });
    }

    jobHasMore = (jobPage * 12) < total;
    jobPage++;

    const oldSentinel = document.getElementById('job-scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();
    if (jobHasMore) {
      const sentinel = document.createElement('div');
      sentinel.id = 'job-scroll-sentinel';
      sentinel.style.cssText = 'grid-column:1/-1;text-align:center;padding:1rem';
      sentinel.innerHTML = '<div style="width:24px;height:24px;border:2px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;display:inline-block"></div>';
      grid.appendChild(sentinel);
      jobScrollObserver.observe(sentinel);
    }
  } catch(e) {
    grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--danger)">Gagal memuat data.</p>';
  }
  jobLoading = false;
}

const jobScrollObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => { if (entry.isIntersecting) fetchJobRequests(false); });
}, { threshold: 0.1 });

function setJobFilter(slug, el) {
  jobFilter = slug;
  document.querySelectorAll('#job-chips .chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  fetchJobRequests(true);
}

function jobRequestCardHTML(r) {
  const cs = catStyle[r.category_slug] || catStyle['jasa'];
  const av = avColor(r.full_name || '');
  const ini = initials(r.full_name || '?');
  const budget = r.budget_min && r.budget_max
    ? `Rp ${parseInt(r.budget_min).toLocaleString('id')} – Rp ${parseInt(r.budget_max).toLocaleString('id')}`
    : r.budget_min ? `Dari Rp ${parseInt(r.budget_min).toLocaleString('id')}`
    : r.budget_max ? `Hingga Rp ${parseInt(r.budget_max).toLocaleString('id')}` : 'Budget Nego';
  const deadline = r.deadline ? new Date(r.deadline).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}) : null;
  return `
    <div class="listing-card" onclick="openJobDetail(${r.id})" style="cursor:pointer;border-left:3px solid var(--accent2)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">
        <span class="cat-tag" style="background:${cs.bg};color:${cs.color}">${r.category_icon||'🙋'} ${r.category_name||'Umum'}</span>
        <span style="font-size:.7rem;color:var(--accent2);font-weight:700;background:#f0fdf4;padding:.15rem .5rem;border-radius:100px">BUTUH JASA</span>
      </div>
      <div style="font-weight:700;font-size:.95rem;margin-bottom:.4rem;line-height:1.3">${r.title}</div>
      <p style="font-size:.8rem;color:var(--muted);margin-bottom:.8rem;line-height:1.55">${r.description.slice(0,100)}${r.description.length>100?'…':''}</p>
      <div style="display:flex;gap:1rem;font-size:.75rem;color:var(--muted);margin-bottom:.8rem;flex-wrap:wrap">
        <span>💰 ${budget}</span>
        ${deadline ? `<span>⏰ ${deadline}</span>` : ''}
        ${r.city ? `<span>📍 ${r.city}</span>` : ''}
        <span>👥 ${r.application_count||0} pelamar</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);padding-top:.8rem">
        <div style="display:flex;align-items:center;gap:.5rem">
          <div class="avatar" style="background:${av};width:28px;height:28px;font-size:.7rem">${ini}</div>
          <span style="font-size:.78rem;font-weight:600">${r.full_name||'Anonim'}</span>
        </div>
        ${currentUser && currentUser.id === r.user_id
          ? `<div style="display:flex;gap:.5rem" onclick="event.stopPropagation()">
              <button class="btn btn-outline btn-sm" onclick="viewMyApplications(${r.id})">👥 ${r.application_count||0} Pelamar</button>
              <button class="btn btn-danger btn-sm" onclick="deleteJobRequest(${r.id})">🗑 Hapus</button>
             </div>`
          : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openApplyJobModal(${r.id},'${(r.title||'').replace(/'/g,"\'")}')">Lamar →</button>`
        }
      </div>
    </div>`;
}

async function openJobDetail(id) {
  const r = await api.getJobRequest(id);
  if (!r || !r.id) { showToast('Gagal memuat detail', 'error'); return; }
  const budget = r.budget_min && r.budget_max
    ? `Rp ${parseInt(r.budget_min).toLocaleString('id')} – Rp ${parseInt(r.budget_max).toLocaleString('id')}`
    : 'Nego';
  const deadline = r.deadline ? new Date(r.deadline).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) : 'Fleksibel';
  const av = avColor(r.full_name||'');
  const ini = initials(r.full_name||'?');

  document.getElementById('job-detail-body').innerHTML = `
    <div style="margin-bottom:1rem">
      <h3 style="font-size:1.1rem;font-weight:800;margin-bottom:.5rem">${r.title}</h3>
      <div style="display:flex;gap:1rem;font-size:.78rem;color:var(--muted);flex-wrap:wrap;margin-bottom:1rem">
        <span>💰 ${budget}</span>
        <span>⏰ Deadline: ${deadline}</span>
        ${r.city?`<span>📍 ${r.city}</span>`:''}
        <span>👥 ${r.application_count||0} pelamar</span>
      </div>
      <div style="font-size:.88rem;line-height:1.7;color:#333;margin-bottom:1.5rem;white-space:pre-wrap">${r.description}</div>
      <div class="card" style="margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:.8rem">
          <div class="avatar" style="background:${av};width:40px;height:40px">${ini}</div>
          <div>
            <div style="font-weight:700;font-size:.88rem">${r.full_name||'Anonim'}</div>
            <div style="font-size:.75rem;color:var(--muted)">${r.user_city||''}</div>
          </div>
        </div>
      </div>
      ${currentUser && currentUser.id !== r.user_id
        ? `<button class="btn btn-primary btn-block" onclick="closeJobDetailModal();openApplyJobModal(${r.id},'${(r.title||'').replace(/'/g,"\\'")}')">📝 Lamar Sekarang</button>`
        : currentUser && currentUser.id === r.user_id
        ? `<button class="btn btn-outline btn-block" onclick="viewMyApplications(${r.id})">👥 Lihat Pelamar (${r.application_count||0})</button>`
        : `<button class="btn btn-primary btn-block" onclick="goTo('login');closeJobDetailModal()">Masuk untuk Melamar</button>`
      }
    </div>`;
  document.getElementById('job-detail-modal').classList.add('open');
}

function closeJobDetailModal() { document.getElementById('job-detail-modal').classList.remove('open'); }

function openPostJobModal() {
  if (!currentUser) { goTo('login'); return; }
  // Populate kategori
  const sel = document.getElementById('job-category');
  sel.innerHTML = '<option value="">-- Pilih Kategori --</option>' +
    categories.map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  document.getElementById('job-title').value = '';
  document.getElementById('job-desc').value = '';
  document.getElementById('job-budget-min').value = '';
  document.getElementById('job-budget-max').value = '';
  document.getElementById('job-deadline').value = '';
  document.getElementById('job-post-error').textContent = '';
  document.getElementById('post-job-modal').classList.add('open');
}

function closePostJobModal() { document.getElementById('post-job-modal').classList.remove('open'); }

async function submitJobRequest() {
  const title = document.getElementById('job-title').value.trim();
  const description = document.getElementById('job-desc').value.trim();
  const category_id = document.getElementById('job-category').value;
  const city = document.getElementById('job-city').value.trim();
  const budget_min = document.getElementById('job-budget-min').value;
  const budget_max = document.getElementById('job-budget-max').value;
  const deadline = document.getElementById('job-deadline').value;
  const errEl = document.getElementById('job-post-error');

  if (!title || !description) { errEl.textContent = 'Judul dan deskripsi wajib diisi!'; return; }

  const btn = document.getElementById('job-post-btn');
  btn.innerHTML = '<span class="spinner"></span>Memposting...'; btn.disabled = true;
  const res = await api.createJobRequest({ title, description, category_id: category_id||null, city, budget_min: budget_min||null, budget_max: budget_max||null, deadline: deadline||null });
  btn.innerHTML = 'Posting Sekarang'; btn.disabled = false;

  if (res.data) {
    closePostJobModal();
    showToast('Kebutuhan berhasil diposting! 🎉', 'success');
    fetchJobRequests(true);
  } else {
    errEl.textContent = res.message || 'Gagal memposting';
  }
}

function openApplyJobModal(jobId, jobTitle) {
  if (!currentUser) { goTo('login'); return; }
  document.getElementById('apply-job-id').value = jobId;
  document.getElementById('apply-job-title').textContent = jobTitle;
  document.getElementById('apply-cover-letter').value = '';
  document.getElementById('apply-price').value = '';
  document.getElementById('apply-days').value = '';
  document.getElementById('apply-error').textContent = '';
  document.getElementById('apply-job-modal').classList.add('open');
}

function closeApplyJobModal() { document.getElementById('apply-job-modal').classList.remove('open'); }

async function submitJobApplication() {
  const jobId = document.getElementById('apply-job-id').value;
  const cover_letter = document.getElementById('apply-cover-letter').value.trim();
  const offered_price = document.getElementById('apply-price').value;
  const estimated_days = document.getElementById('apply-days').value;
  const errEl = document.getElementById('apply-error');

  if (!cover_letter) { errEl.textContent = 'Cover letter wajib diisi!'; return; }

  const btn = document.getElementById('apply-btn');
  btn.innerHTML = '<span class="spinner"></span>Mengirim...'; btn.disabled = true;
  const res = await api.applyJob(jobId, { cover_letter, offered_price: offered_price||null, estimated_days: estimated_days||null });
  btn.innerHTML = t('btn_apply'); btn.disabled = false;

  if (res.data) {
    closeApplyJobModal();
    showToast('Lamaran terkirim! 🎉', 'success');
  } else {
    errEl.textContent = res.message || 'Gagal mengirim lamaran';
  }
}

async function viewMyApplications(jobId) {
  closeJobDetailModal();
  const apps = await api.getApplications(jobId);
  if (!Array.isArray(apps) || apps.length === 0) { showToast('Belum ada pelamar', 'info'); return; }
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay open';
  modal.id = 'applicants-modal';
  modal.onclick = (e) => { if(e.target===modal) modal.remove(); };
  modal.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <div class="modal-title">👥 Pelamar (${apps.length})</div>
        <button class="modal-close" onclick="document.getElementById('applicants-modal').remove()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:1rem;max-height:60vh;overflow-y:auto">
        ${apps.map(a => `
          <div class="card" style="padding:1rem">
            <div style="display:flex;align-items:center;gap:.8rem;margin-bottom:.8rem">
              <div class="avatar" style="background:${avColor(a.full_name)};width:40px;height:40px">${initials(a.full_name)}</div>
              <div style="flex:1">
                <div style="font-weight:700;font-size:.88rem">${a.full_name}</div>
                <div style="font-size:.72rem;color:var(--muted)">${a.city||''} ${a.avg_rating>0?`· ⭐ ${parseFloat(a.avg_rating).toFixed(1)}`:''}</div>
              </div>
              <span style="font-size:.72rem;font-weight:700;padding:.2rem .6rem;border-radius:100px;background:${a.status==='accepted'?'#f0fdf4':a.status==='rejected'?'#fef2f2':'#f8f9fa'};color:${a.status==='accepted'?'var(--success)':a.status==='rejected'?'var(--danger)':'var(--muted)'}">${a.status==='accepted'?'✓ Diterima':a.status==='rejected'?'✗ Ditolak':'Menunggu'}</span>
            </div>
            <p style="font-size:.82rem;color:#444;line-height:1.6;margin-bottom:.8rem">${a.cover_letter}</p>
            <div style="display:flex;gap:1rem;font-size:.75rem;color:var(--muted);margin-bottom:.8rem">
              ${a.offered_price?`<span>💰 Rp ${parseInt(a.offered_price).toLocaleString('id')}</span>`:''}
              ${a.estimated_days?`<span>📅 ${a.estimated_days} hari</span>`:''}
            </div>
            ${a.status==='pending'?`
            <div style="display:flex;gap:.6rem;justify-content:flex-end">
              <button class="btn btn-outline btn-sm" onclick="contactSeller(${a.applicant_id},'${(a.full_name||'').replace(/'/g,"\\'")}',null)">💬 Chat</button>
              <button class="btn btn-primary btn-sm" onclick="acceptApplicant(${a.id})">✓ Terima</button>
            </div>`:''}
          </div>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function acceptApplicant(appId) {
  const res = await api.acceptApplication(appId);
  if (res.message) {
    showToast('Pelamar diterima! 🎉', 'success');
    document.getElementById('applicants-modal')?.remove();
  }
}

async function deleteJobRequest(id) {
  if (!confirm('Hapus kebutuhan ini?')) return;
  const res = await api.deleteJobRequest(id);
  if (res.message) {
    showToast('Kebutuhan dihapus!', 'success');
    fetchJobRequests(true);
  } else {
    showToast(res.message || 'Gagal menghapus', 'error');
  }
}

// ===== TRANSAKSI =====
async function renderTransactions() {
  if (!currentUser) { goTo('login'); return; }
  const list = document.getElementById('transactions-list');
  list.innerHTML = '<div style="text-align:center;padding:3rem"><div style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;display:inline-block"></div></div>';
  try {
    const trxs = await api.myTransactions();
    if (!Array.isArray(trxs) || trxs.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)"><div style="font-size:2.5rem;margin-bottom:1rem">💳</div><p>Belum ada transaksi.</p></div>';
      return;
    }
    list.innerHTML = trxs.map(t => transactionCardHTML(t)).join('');
  } catch(e) {
    list.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--danger)">Gagal memuat transaksi.</p>';
  }
}

function transactionCardHTML(t) {
  const isClient = currentUser.id === t.client_id;
  const otherName = isClient ? t.worker_name : t.client_name;
  const statusMap = {
    'waiting_dp': { label:'Menunggu DP', color:'var(--muted)', bg:'#f8f9fa' },
    'dp_paid': { label:'DP Dibayar • Dalam Pengerjaan', color:'#0891b2', bg:'#ecfeff' },
    'submitted': { label:'Menunggu Review Klien', color:'#d97706', bg:'#fffbeb' },
    'waiting_final': { label:'Menunggu Pelunasan', color:'#7c3aed', bg:'#f5f3ff' },
    'completed': { label:'✅ Selesai', color:'var(--success)', bg:'#f0fdf4' },
    'disputed': { label:'⚠️ Dispute', color:'var(--danger)', bg:'#fef2f2' },
    'refunded': { label:'↩️ Refund', color:'var(--muted)', bg:'#f8f9fa' },
    'cancelled': { label:'❌ Dibatalkan', color:'var(--danger)', bg:'#fef2f2' },
  };
  const st = statusMap[t.status] || { label: t.status, color:'var(--muted)', bg:'#f8f9fa' };
  const title = t.listing_title || t.job_title || t.notes || t('trx_title_short');
  const date = new Date(t.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});

  return `
    <div class="card" style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem;margin-bottom:.8rem">
        <div>
          <div style="font-weight:700;font-size:.95rem">${title}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">${isClient?'Kepada':'Dari'}: ${otherName} · ${date}</div>
        </div>
        <span style="font-size:.75rem;font-weight:700;padding:.25rem .7rem;border-radius:100px;background:${st.bg};color:${st.color}">${st.label}</span>
      </div>
      <div style="display:flex;gap:1.5rem;font-size:.82rem;color:var(--muted);margin-bottom:1rem;flex-wrap:wrap">
        <span>Total: <strong style="color:var(--ink)">Rp ${parseInt(t.total_amount).toLocaleString('id')}</strong></span>
        <span>DP: <strong>Rp ${parseInt(t.dp_amount).toLocaleString('id')}</strong></span>
        <span>Fee platform: <strong>Rp ${parseInt(t.platform_fee).toLocaleString('id')}</strong></span>
      </div>
      <div style="display:flex;gap:.6rem;flex-wrap:wrap">
        ${t.status==='waiting_dp' && isClient ? `<a href="${t.xendit_dp_invoice_url}" target="_blank" class="btn btn-primary btn-sm">💳 Bayar DP Sekarang</a>` : ''}
        ${t.status==='dp_paid' && !isClient ? `<button class="btn btn-primary btn-sm" onclick="submitWork(${t.id})">✅ Tandai Selesai</button>` : ''}
        ${t.status==='submitted' && isClient ? `
          <button class="btn btn-primary btn-sm" onclick="approveWork(${t.id})">✅ Approve & Lunasi</button>
          <button class="btn btn-danger btn-sm" onclick="openDisputeModal(${t.id})">⚠️ Dispute</button>
        ` : ''}
        ${t.status==='waiting_final' && isClient ? `<a href="${t.xendit_final_invoice_url}" target="_blank" class="btn btn-primary btn-sm">💳 Bayar Pelunasan</a>` : ''}
        ${t.status==='dp_paid' && isClient ? `<button class="btn btn-danger btn-sm" onclick="openDisputeModal(${t.id})">⚠️ Dispute</button>` : ''}
        ${t.status==='completed' && isClient && !t.reviewed_by_client ? `
          <button class="btn btn-sm" style="background:#fef9c3;color:#854d0e;border:1.5px solid #fde047;font-weight:600" onclick="openReviewFromTrx(${t.id},${t.worker_id},'${(t.worker_name||'').replace(/'/g,"\'")}',${t.listing_id||null})">${t('btn_give_review')}</button>
        ` : ''}
        ${t.status==='completed' && !isClient && !t.reviewed_by_worker ? `
          <button class="btn btn-sm" style="background:#fef9c3;color:#854d0e;border:1.5px solid #fde047;font-weight:600" onclick="openReviewFromTrx(${t.id},${t.client_id},'${(t.client_name||'').replace(/'/g,"\'")}',${t.listing_id||null})">${t('btn_give_review')}</button>
        ` : ''}
        ${t.status==='completed' && (isClient ? t.reviewed_by_client : t.reviewed_by_worker) ? `
          <span style="font-size:.75rem;color:var(--success);font-weight:600">✅ Sudah diulas</span>
        ` : ''}
      </div>
    </div>`;
}

function openReviewFromTrx(trxId, reviewedId, reviewedName, listingId) {
  // Set hidden fields
  document.getElementById('review-reviewed-id').value = reviewedId;
  document.getElementById('review-listing-id').value = listingId || '';
  document.getElementById('review-to-name').textContent = reviewedName;
  // Simpan transaction_id di hidden field (tambah jika belum ada)
  let trxField = document.getElementById('review-transaction-id');
  if (!trxField) {
    trxField = document.createElement('input');
    trxField.type = 'hidden';
    trxField.id = 'review-transaction-id';
    document.getElementById('review-modal').appendChild(trxField);
  }
  trxField.value = trxId;
  // Reset form
  selectStar(0);
  document.getElementById('review-comment').value = '';
  document.getElementById('review-error').textContent = '';
  document.getElementById('review-modal').classList.add('open');
}

async function submitWork(id) {
  if (!confirm('Tandai pekerjaan sebagai selesai? Klien akan mereview dalam 7 hari.')) return;
  const res = await api.submitTransaction(id);
  showToast(res.message || 'Berhasil!', res.message ? 'success' : 'error');
  renderTransactions();
}

async function approveWork(id) {
  const res = await api.approveTransaction(id);
  if (res.invoice_url) {
    showToast('Disetujui! Mengarahkan ke halaman pembayaran...', 'success');
    setTimeout(() => window.open(res.invoice_url, '_blank'), 1000);
    renderTransactions();
  } else {
    showToast(res.message || 'Gagal', 'error');
  }
}

function openDisputeModal(id) {
  document.getElementById('dispute-trx-id').value = id;
  document.getElementById('dispute-reason').value = '';
  document.getElementById('dispute-modal').classList.add('open');
}

function closeDisputeModal() { document.getElementById('dispute-modal').classList.remove('open'); }

async function submitDispute() {
  const id = document.getElementById('dispute-trx-id').value;
  const reason = document.getElementById('dispute-reason').value.trim();
  if (!reason) { showToast('Alasan wajib diisi!', 'error'); return; }
  const res = await api.disputeTransaction(id, reason);
  showToast(res.message || 'Dispute dikirim!', 'success');
  closeDisputeModal();
  renderTransactions();
}

// Modal buat transaksi
async function openCreateTrxModal(workerId, workerName, listingId = null, type = 'listing') {
  if (!currentUser) { goTo('login'); return; }
  document.getElementById('trx-worker-id').value = workerId;
  document.getElementById('trx-worker-name').textContent = workerName;
  document.getElementById('trx-listing-id').value = listingId || '';
  document.getElementById('trx-type').value = type;
  document.getElementById('trx-amount').value = '';
  document.getElementById('trx-notes').value = '';
  document.getElementById('trx-error').textContent = '';
  document.getElementById('trx-breakdown').style.display = 'none';

  // Cek apakah produk digital
  let isDigital = false;
  let listingPrice = null;
  if (listingId) {
    try {
      const l = await api.getListing(listingId);
      isDigital = !!(l.delivery_url || l.file_url);
      listingPrice = l.price ? parseInt(l.price.replace(/[^0-9]/g,'')) : null;
    } catch(e) {}
  }

  // Simpan flag
  let digitalFlag = document.getElementById('trx-is-digital');
  if (!digitalFlag) {
    digitalFlag = document.createElement('input');
    digitalFlag.type = 'hidden';
    digitalFlag.id = 'trx-is-digital';
    document.getElementById('create-trx-modal').appendChild(digitalFlag);
  }
  digitalFlag.value = isDigital ? '1' : '0';

  const submitBtn = document.getElementById('trx-submit-btn');
  const breakdownEl = document.getElementById('trx-breakdown');
  const amountEl = document.getElementById('trx-amount');

  if (isDigital) {
    submitBtn.innerHTML = '🛒 Beli Sekarang — Bayar Penuh';
    if (listingPrice) { amountEl.value = listingPrice; amountEl.readOnly = true; }
    document.getElementById('trx-notes').value = 'Pembelian produk digital';
    if (listingPrice && listingPrice >= 10000) {
      const fee = Math.ceil(listingPrice * 0.05);
      document.getElementById('trx-dp-amount').textContent = 'Rp ' + listingPrice.toLocaleString('id');
      document.getElementById('trx-final-amount').textContent = 'Rp 0 (lunas)';
      document.getElementById('trx-fee-amount').textContent = 'Rp ' + fee.toLocaleString('id');
      breakdownEl.style.display = 'block';
    }
  } else {
    submitBtn.innerHTML = t('btn_pay_dp');
    amountEl.readOnly = false;
    amountEl.oninput = function() {
      const amt = parseInt(this.value) || 0;
      if (amt >= 10000) {
        const dp = Math.ceil(amt * 0.5);
        const final = amt - dp;
        const fee = Math.ceil(amt * 0.05);
        document.getElementById('trx-dp-amount').textContent = 'Rp ' + dp.toLocaleString('id');
        document.getElementById('trx-final-amount').textContent = 'Rp ' + final.toLocaleString('id');
        document.getElementById('trx-fee-amount').textContent = 'Rp ' + fee.toLocaleString('id');
        breakdownEl.style.display = 'block';
      } else { breakdownEl.style.display = 'none'; }
    };
  }

  document.getElementById('create-trx-modal').classList.add('open');
}

function closeCreateTrxModal() { document.getElementById('create-trx-modal').classList.remove('open'); }

async function submitCreateTransaction() {
  const worker_id = parseInt(document.getElementById('trx-worker-id').value);
  const listing_id = document.getElementById('trx-listing-id').value;
  const type = document.getElementById('trx-type').value;
  const total_amount = parseInt(document.getElementById('trx-amount').value);
  const notes = document.getElementById('trx-notes').value.trim();
  const errEl = document.getElementById('trx-error');

  if (!total_amount || total_amount < 10000) { errEl.textContent = 'Minimum transaksi Rp 10.000'; return; }
  if (!notes) { errEl.textContent = 'Deskripsi pekerjaan wajib diisi'; return; }

  const btn = document.getElementById('trx-submit-btn');
  btn.innerHTML = '<span class="spinner"></span>Memproses...'; btn.disabled = true;

  const res = await api.createTransaction({
    type, worker_id,
    listing_id: listing_id || null,
    total_amount, notes
  });

  btn.innerHTML = 'Bayar DP Sekarang →'; btn.disabled = false;

  if (res.invoice_url) {
    closeCreateTrxModal();
    showToast('Transaksi dibuat! Mengarahkan ke pembayaran...', 'success');
    goTo('transactions');
    setTimeout(() => {
      const newTab = window.open(res.invoice_url, '_blank');
      if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
        window.location.href = res.invoice_url;
      }
    }, 800);
  } else if (res.kyc_required) {
    closeCreateTrxModal();
    showToast('Verifikasi identitas diperlukan untuk melakukan transaksi', 'error');
    setTimeout(() => openKycModal(), 400);
  } else {
    errEl.textContent = res.message || 'Gagal membuat transaksi';
  }
}

// ===== WALLET =====
let currentWalletTab = 'earnings';

async function renderWallet() {
  if (!currentUser) { goTo('login'); return; }
  currentWalletTab = 'earnings';
  await loadWalletBalance();
  await switchWalletTab('earnings', document.querySelector('.wallet-tab'));
  // Tampilkan section diskon untuk worker
  const discountSection = document.getElementById('discount-section-wallet');
  if (discountSection && currentUser.role === 'worker') {
    discountSection.style.display = 'block';
    loadMyDiscountCodes();
  }
}

async function loadWalletBalance() {
  const bal = await api.getBalance();
  const card = document.getElementById('wallet-balance-card');
  card.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:2rem">
      <div class="card" style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;text-align:center">
        <div style="font-size:.78rem;opacity:.8;margin-bottom:.3rem">Saldo Tersedia</div>
        <div style="font-size:1.6rem;font-weight:800">Rp ${parseInt(bal.balance||0).toLocaleString('id')}</div>
        <button class="btn btn-sm" style="margin-top:.8rem;background:white;color:#667eea;font-weight:700" onclick="openWithdrawModal(${bal.balance||0})">💸 Tarik Saldo</button>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:.3rem">Total Pendapatan</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--accent2)">Rp ${parseInt(bal.total_earned||0).toLocaleString('id')}</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:.3rem">Total Dicairkan</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--muted)">Rp ${parseInt(bal.total_withdrawn||0).toLocaleString('id')}</div>
      </div>
      <div class="card" style="text-align:center">
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:.3rem">${t('trx_done')}</div>
        <div style="font-size:1.3rem;font-weight:800;color:var(--ink)">${bal.total_transactions||0}</div>
      </div>
    </div>`;
}

async function switchWalletTab(tab, el) {
  currentWalletTab = tab;
  document.querySelectorAll('.wallet-tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  const content = document.getElementById('wallet-tab-content');
  content.innerHTML = '<div style="text-align:center;padding:2rem"><div style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;display:inline-block"></div></div>';

  if (tab === 'earnings') {
    const data = await api.getEarnings();
    if (!data.length) { content.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)">Belum ada pendapatan.</div>'; return; }
    content.innerHTML = data.map(e => `
      <div class="card" style="margin-bottom:.8rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
        <div>
          <div style="font-weight:700;font-size:.88rem">${e.notes||'Pekerjaan Selesai'}</div>
          <div style="font-size:.75rem;color:var(--muted)">Dari: ${e.client_name} · ${new Date(e.paid_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800;color:var(--accent2)">+Rp ${parseInt(e.earned).toLocaleString('id')}</div>
          <div style="font-size:.72rem;color:var(--muted)">Fee: Rp ${parseInt(e.platform_fee).toLocaleString('id')}</div>
        </div>
      </div>`).join('');

  } else if (tab === 'withdrawals') {
    const data = await api.getWithdrawals();
    if (!data.length) { content.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)">Belum ada riwayat withdraw.</div>'; return; }
    const stMap = { pending:{label:'Menunggu',color:'#d97706',bg:'#fffbeb'}, approved:{label:'✅ Disetujui',color:'var(--success)',bg:'#f0fdf4'}, rejected:{label:'❌ Ditolak',color:'var(--danger)',bg:'#fef2f2'} };
    content.innerHTML = data.map(w => {
      const st = stMap[w.status]||stMap.pending;
      return `
      <div class="card" style="margin-bottom:.8rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
        <div>
          <div style="font-weight:700;font-size:.88rem">${w.bank_name} · ${w.account_number}</div>
          <div style="font-size:.75rem;color:var(--muted)">a.n. ${w.account_name} · ${new Date(w.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</div>
          ${w.admin_note?`<div style="font-size:.75rem;color:var(--muted);margin-top:.2rem">Catatan: ${w.admin_note}</div>`:''}
        </div>
        <div style="text-align:right">
          <div style="font-weight:800">Rp ${parseInt(w.amount).toLocaleString('id')}</div>
          <span style="font-size:.72rem;font-weight:700;padding:.2rem .5rem;border-radius:100px;background:${st.bg};color:${st.color}">${st.label}</span>
        </div>
      </div>`;}).join('');

  } else if (tab === 'portfolio') {
    const data = await api.getMyPortfolio();
    content.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;flex-wrap:wrap;gap:.5rem">
        <div style="font-size:.85rem;color:var(--muted)">Portfolio otomatis dari transaksi selesai + manual.</div>
        <button class="btn btn-primary btn-sm" onclick="openCreatePortfolioModal()">+ Tambah Portfolio</button>
      </div>` +
      (!data||!data.length
        ? `<div style="text-align:center;padding:4rem 2rem">
            <div style="font-size:3rem;margin-bottom:1rem">🗂️</div>
            <div style="font-weight:700;margin-bottom:.5rem">Belum ada portfolio</div>
            <div style="color:var(--muted);font-size:.85rem;margin-bottom:1.5rem">Portfolio otomatis muncul setelah transaksi selesai,<br>atau kamu bisa tambah manual.</div>
            <button class="btn btn-primary" onclick="openCreatePortfolioModal()">+ Tambah Portfolio Manual</button>
          </div>`
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem">` +
          data.map(p => `
            <div style="background:white;border:1.5px solid var(--border);border-radius:14px;overflow:hidden;transition:box-shadow .2s;position:relative" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,.1)'" onmouseout="this.style.boxShadow='none'">
              <div style="position:relative">
                ${p.photos&&p.photos.length
                  ? `<img src="${p.photos[0]}" style="width:100%;height:160px;object-fit:cover">`
                  : `<div style="height:100px;background:linear-gradient(135deg,var(--warm),#e8e0d5);display:flex;align-items:center;justify-content:center;font-size:2.5rem">🗂️</div>`}
                <span style="position:absolute;top:.6rem;left:.6rem;font-size:.65rem;font-weight:700;padding:.25rem .6rem;border-radius:100px;${p.transaction_id?'background:var(--accent2);color:white':'background:var(--accent);color:white'}">${p.transaction_id?t('trx_badge'):t('trx_manual')}</span>
                ${!p.is_public?'<span style="position:absolute;top:.6rem;right:.6rem;font-size:.65rem;font-weight:700;padding:.25rem .6rem;border-radius:100px;background:rgba(0,0,0,.5);color:white">🔒 Privat</span>':''}
                ${p.photos&&p.photos.length>1?`<span style="position:absolute;bottom:.4rem;right:.4rem;background:rgba(0,0,0,.55);color:white;font-size:.65rem;padding:.2rem .45rem;border-radius:100px">+${p.photos.length-1} foto</span>`:''}
              </div>
              <div style="padding:.9rem 1rem 1rem">
                <div style="font-weight:700;font-size:.92rem;margin-bottom:.3rem;line-height:1.3">${p.title}</div>
                ${p.description?`<p style="font-size:.78rem;color:var(--muted);line-height:1.5;margin-bottom:.6rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${p.description}</p>`:''}
                ${p.client_rating?`<div style="font-size:.78rem;color:#f59e0b;margin-bottom:.6rem">★ ${p.client_rating}/5${p.client_review?` <span style="color:var(--muted);font-style:italic">"${p.client_review.slice(0,40)}${p.client_review.length>40?'...':''}"</span>`:''}</div>`:''}
                <div style="font-size:.72rem;color:var(--muted);margin-bottom:.7rem">${new Date(p.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}</div>
                <div style="display:flex;gap:.4rem;flex-wrap:wrap">
                  <button onclick="togglePortfolioVisibility(${p.id},${!p.is_public})" style="flex:1;padding:.35rem .6rem;border-radius:100px;font-size:.72rem;font-weight:600;cursor:pointer;border:1.5px solid var(--border);background:white;color:var(--ink)">${p.is_public?'👁 Publik':'🔒 Privat'}</button>
                  <button onclick="deletePortfolio(${p.id})" style="padding:.35rem .7rem;border-radius:100px;font-size:.72rem;font-weight:600;cursor:pointer;border:1.5px solid var(--danger);background:white;color:var(--danger)">🗑</button>
                </div>
              </div>
            </div>`).join('') + '</div>');
  }
}

function openCreatePortfolioModal() {
  document.getElementById('porto-title').value = '';
  document.getElementById('porto-desc').value = '';
  document.getElementById('porto-photos').value = '';
  document.getElementById('porto-photo-preview').innerHTML = '';
  document.getElementById('porto-error').textContent = '';
  document.getElementById('porto-submit-btn').disabled = false;
  document.getElementById('portfolio-modal').classList.add('open');
}

function closePortfolioModal() {
  document.getElementById('portfolio-modal').classList.remove('open');
}

function previewPortoPhotos(input) {
  const files = Array.from(input.files).slice(0, 5);
  const preview = document.getElementById('porto-photo-preview');
  preview.innerHTML = files.map((f, i) => {
    const url = URL.createObjectURL(f);
    return `<div style="position:relative;aspect-ratio:1;border-radius:8px;overflow:hidden;background:var(--warm)">
      <img src="${url}" style="width:100%;height:100%;object-fit:cover">
      <button onclick="removePortoPhoto(${i})" style="position:absolute;top:.2rem;right:.2rem;background:rgba(0,0,0,.6);color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center">×</button>
    </div>`;
  }).join('');
}

function removePortoPhoto(idx) {
  const input = document.getElementById('porto-photos');
  const dt = new DataTransfer();
  Array.from(input.files).forEach((f, i) => { if (i !== idx) dt.items.add(f); });
  input.files = dt.files;
  previewPortoPhotos(input);
}

async function submitPortfolio() {
  const title = document.getElementById('porto-title').value.trim();
  const desc = document.getElementById('porto-desc').value.trim();
  const errEl = document.getElementById('porto-error');
  const btn = document.getElementById('porto-submit-btn');
  if (!title) { errEl.textContent = 'Judul wajib diisi'; return; }
  btn.disabled = true;
  btn.textContent = 'Menyimpan...';
  try {
    // 1. Buat portfolio item
    const res = await api.createPortfolio({ title, description: desc });
    if (!res.id) { errEl.textContent = res.message || 'Gagal membuat portfolio'; btn.disabled = false; btn.textContent = 'Simpan Portfolio'; return; }
    // 2. Upload foto jika ada
    const photos = document.getElementById('porto-photos').files;
    if (photos.length > 0) {
      const form = new FormData();
      Array.from(photos).forEach(f => form.append('photos', f));
      await fetch(`/api/wallet/portfolio/${res.id}/photos`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('akubisa_token')}` },
        body: form
      });
    }
    closePortfolioModal();
    showToast('Portfolio berhasil ditambahkan!', 'success');
    switchWalletTab('portfolio', null);
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    btn.disabled = false;
    btn.textContent = 'Simpan Portfolio';
  }
}

async function createPortfolio(title, desc) {
  const res = await api.createPortfolio({ title, description: desc });
  if (res.id) {
    showToast('Portfolio dibuat!', 'success');
    switchWalletTab('portfolio', null);
  } else {
    showToast(res.message || 'Gagal', 'error');
  }
}

async function deletePortfolio(id) {
  if (!confirm('Hapus portfolio ini?')) return;
  const res = await api.deletePortfolio(id);
  showToast(res.message || 'Dihapus!', 'success');
  switchWalletTab('portfolio', null);
}

async function togglePortfolioVisibility(id, isPublic) {
  const res = await api.updatePortfolio(id, { is_public: isPublic });
  showToast(res.message||'Updated!', 'success');
  switchWalletTab('portfolio', null);
}

function openWithdrawModal(balance) {
  document.getElementById('wd-amount').value = '';
  document.getElementById('wd-amount').max = balance;
  document.getElementById('wd-bank').value = '';
  document.getElementById('wd-account-number').value = '';
  document.getElementById('wd-account-name').value = '';
  document.getElementById('wd-error').textContent = '';
  document.getElementById('withdraw-modal').classList.add('open');
}

function closeWithdrawModal() { document.getElementById('withdraw-modal').classList.remove('open'); }

async function submitWithdraw() {
  const amount = parseInt(document.getElementById('wd-amount').value);
  const bank_name = document.getElementById('wd-bank').value;
  const account_number = document.getElementById('wd-account-number').value.trim();
  const account_name = document.getElementById('wd-account-name').value.trim();
  const errEl = document.getElementById('wd-error');

  if (!amount || amount < 50000) { errEl.textContent = 'Minimum withdraw Rp 50.000'; return; }
  if (!bank_name || !account_number || !account_name) { errEl.textContent = 'Semua field wajib diisi'; return; }

  const btn = document.getElementById('wd-btn');
  btn.innerHTML = '<span class="spinner"></span>Memproses...'; btn.disabled = true;
  const res = await api.requestWithdraw({ amount, bank_name, account_number, account_name });
  btn.innerHTML = 'Tarik Saldo'; btn.disabled = false;

  if (res.message && !res.message.includes('gagal')) {
    closeWithdrawModal();
    showToast(res.message, 'success');
    renderWallet();
  } else {
    errEl.textContent = res.message || 'Gagal';
  }
}

// ===== KYC =====
async function openKycModal() {
  document.getElementById('kyc-modal').classList.add('open');
  const status = await api.kycStatus();
  const info = document.getElementById('kyc-status-info');
  const form = document.getElementById('kyc-form');
  const footer = document.getElementById('kyc-footer');

  if (status) {
    if (status.status === 'pending') {
      info.innerHTML = `<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:.8rem;font-size:.83rem;color:#854d0e">
        ⏳ <strong>Pengajuan sedang diproses.</strong> Admin akan mereview dalam 1x24 jam. Kamu akan mendapat notifikasi hasilnya.
      </div>`;
      form.style.display = 'none';
      footer.innerHTML = `<button class="btn btn-outline" onclick="closeKycModal()">${t('btn_close')}</button>`;
    } else if (status.status === 'approved') {
      info.innerHTML = `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:.8rem;font-size:.83rem;color:#166534">
        ✅ <strong>Identitas kamu sudah terverifikasi!</strong> Badge ✓ Terverifikasi tampil di profilmu.
      </div>`;
      form.style.display = 'none';
      footer.innerHTML = `<button class="btn btn-outline" onclick="closeKycModal()">${t('btn_close')}</button>`;
    } else if (status.status === 'rejected') {
      info.innerHTML = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:.8rem;font-size:.83rem;color:#991b1b">
        ❌ <strong>Pengajuan ditolak.</strong> Alasan: ${status.admin_note || 'Dokumen tidak valid'}. Silakan ajukan ulang dengan dokumen yang benar.
      </div>`;
      form.style.display = 'block';
    }
  } else {
    info.innerHTML = '';
    form.style.display = 'block';
    footer.innerHTML = `<button class="btn btn-outline" onclick="closeKycModal()">${t('btn_cancel')}</button>
      <button class="btn btn-primary" onclick="submitKyc()" id="kyc-submit-btn">${t('btn_kyc_submit')}</button>`;
  }
}

function closeKycModal() {
  document.getElementById('kyc-modal').classList.remove('open');
}

function previewKycFile(input, previewId) {
  const preview = document.getElementById(previewId);
  if (!input.files[0]) { preview.innerHTML = ''; return; }
  const url = URL.createObjectURL(input.files[0]);
  preview.innerHTML = `<img src="${url}" style="width:100%;max-height:180px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">`;
}

async function submitKyc() {
  const fullname = document.getElementById('kyc-fullname').value.trim();
  const nik = document.getElementById('kyc-nik').value.trim();
  const ktp = document.getElementById('kyc-ktp').files[0];
  const selfie = document.getElementById('kyc-selfie').files[0];
  const errEl = document.getElementById('kyc-error');
  const btn = document.getElementById('kyc-submit-btn');

  if (!fullname) { errEl.textContent = 'Nama lengkap wajib diisi'; return; }
  if (!nik || nik.length !== 16) { errEl.textContent = 'NIK harus 16 digit'; return; }
  if (!ktp) { errEl.textContent = 'Foto KTP wajib diupload'; return; }
  if (!selfie) { errEl.textContent = 'Foto selfie wajib diupload'; return; }

  btn.disabled = true;
  btn.textContent = 'Mengirim...';
  errEl.textContent = '';

  try {
    const form = new FormData();
    form.append('full_name_ktp', fullname);
    form.append('nik', nik);
    form.append('ktp', ktp);
    form.append('selfie', selfie);

    const res = await fetch('/api/kyc/submit', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('akubisa_token')}` },
      body: form
    }).then(r => r.json());

    if (res.message && !res.error) {
      showToast(res.message, 'success');
      closeKycModal();
    } else {
      errEl.textContent = res.message || 'Gagal mengirim';
      btn.disabled = false;
      btn.textContent = 'Kirim untuk Diverifikasi';
    }
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    btn.disabled = false;
    btn.textContent = 'Kirim untuk Diverifikasi';
  }
}

// ===== DISCOUNT CODES =====
let appliedDiscount = null;

async function validateDiscountCode() {
  const code = document.getElementById('trx-discount-code').value.trim();
  const amount = parseInt(document.getElementById('trx-amount').value) || 0;
  const listing_id = document.getElementById('trx-listing-id').value;
  const resultEl = document.getElementById('discount-result');
  if (!code) { resultEl.textContent = 'Masukkan kode diskon'; resultEl.style.color = 'var(--danger)'; return; }
  if (!amount || amount < 10000) { resultEl.textContent = 'Masukkan jumlah harga dulu'; resultEl.style.color = 'var(--danger)'; return; }
  resultEl.textContent = 'Memvalidasi...'; resultEl.style.color = 'var(--muted)';
  const res = await api.post('/discount/validate', { code, listing_id: listing_id || null, amount });
  if (res.valid) {
    appliedDiscount = res;
    resultEl.innerHTML = '✅ Diskon ' + (res.discount_type === 'percent' ? res.discount_value + '%' : 'Rp ' + res.discount_value.toLocaleString('id-ID')) + ' diterapkan! Hemat Rp ' + res.discount_amount.toLocaleString('id-ID');
    resultEl.style.color = '#166534';
    document.getElementById('trx-amount').value = res.final_amount;
    document.getElementById('trx-amount').dispatchEvent(new Event('input'));
  } else {
    appliedDiscount = null;
    resultEl.textContent = res.message || 'Kode tidak valid';
    resultEl.style.color = 'var(--danger)';
  }
}

async function loadMyDiscountCodes() {
  const el = document.getElementById('my-discount-codes');
  if (!el) return;
  try {
    const codes = await api.get('/discount/my');
    if (!Array.isArray(codes) || !codes.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:.85rem">Belum ada kode diskon.</p>';
      return;
    }
    el.innerHTML = codes.map(c => `
      <div style="background:var(--warm);border-radius:10px;padding:.8rem;display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <div>
          <div style="font-weight:700;font-size:.95rem;letter-spacing:.05em">${c.code}</div>
          <div style="font-size:.75rem;color:var(--muted)">${c.discount_type === 'percent' ? c.discount_value + '% off' : 'Rp ' + parseInt(c.discount_value).toLocaleString('id-ID') + ' off'} ${c.listing_title ? '· ' + c.listing_title : '· Semua listing'} ${c.max_uses ? '· ' + c.used_count + '/' + c.max_uses + ' dipakai' : ''}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteDiscountCode(${c.id})">Hapus</button>
      </div>`).join('');
  } catch(e) { el.innerHTML = '<p style="color:var(--muted)">Gagal memuat</p>'; }
}

async function deleteDiscountCode(id) {
  if (!confirm('Hapus kode diskon ini?')) return;
  const res = await api.delete('/discount/' + id);
  if (res.success) { showToast('Kode dihapus!', 'success'); loadMyDiscountCodes(); }
  else showToast(res.message || 'Gagal', 'error');
}

async function createDiscountCode() {
  const code = document.getElementById('dc-code').value.trim().toUpperCase();
  const type = document.getElementById('dc-type').value;
  const value = parseInt(document.getElementById('dc-value').value);
  const max_uses = document.getElementById('dc-max-uses').value;
  const expires_at = document.getElementById('dc-expires').value;
  if (!code || !value) { showToast('Kode dan nilai wajib diisi', 'error'); return; }
  const res = await api.post('/discount', { code, discount_type: type, discount_value: value, max_uses: max_uses || null, expires_at: expires_at || null });
  if (res.id) {
    showToast('Kode diskon dibuat!', 'success');
    loadMyDiscountCodes();
    document.getElementById('dc-code').value = '';
    document.getElementById('dc-value').value = '';
  } else showToast(res.message || 'Gagal', 'error');
}
