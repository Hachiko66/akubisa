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
          <div class="cat-count">${c.listing_count||0} penawaran</div>
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
  const isWorker = currentUser.role === 'worker';
  el.innerHTML = isWorker ? `
    <button class="btn btn-primary btn-sm" onclick="openPostModal()">⚡ Buat Penawaran</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('job-requests')">🙋 Lihat Kebutuhan Klien</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('dashboard')">Dashboard</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('explore')">Jelajahi</button>
    <button class="btn btn-outline btn-sm" onclick="openEditProfile()">Edit Profil</button>
    <button class="btn btn-danger btn-sm" onclick="logout()">Keluar</button>
  ` : `
    <button class="btn btn-primary btn-sm" onclick="openPostJobModal()">🙋 Posting Kebutuhan</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('job-requests')">Lihat Semua Kebutuhan</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('explore')">Jelajahi Penawaran</button>
    <button class="btn btn-outline btn-sm" onclick="goTo('dashboard')">Dashboard</button>
    <button class="btn btn-outline btn-sm" onclick="openEditProfile()">Edit Profil</button>
    <button class="btn btn-danger btn-sm" onclick="logout()">Keluar</button>
  `;
}

async function renderProfile() {
  renderQuickActions();
  if (!currentUser) { goTo('login'); return; }
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
  document.getElementById('profile-city').textContent = u.city || 'Kota belum diisi';
  document.getElementById('profile-email2').textContent = u.email;
  document.getElementById('profile-city2').textContent = u.city || '-';
  document.getElementById('profile-phone2').textContent = u.phone || '-';
  document.getElementById('profile-role2').textContent = u.role === 'worker' ? 'Pekerja ⚡' : 'Pencari 🔍';
  document.getElementById('profile-bio-preview').textContent = u.bio ? u.bio.slice(0,60)+(u.bio.length>60?'…':'') : '';

  const badge = document.getElementById('profile-role-label');
  badge.textContent = u.role === 'worker' ? '⚡ PEKERJA' : '🔍 PENCARI';
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
  document.getElementById('dash-role').textContent = currentUser.role === 'worker' ? 'Mode Pekerja ⚡' : 'Mode Pencari 🔍';

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
            <div style="font-size:.75rem;color:var(--muted);margin-bottom:.8rem">👁 ${l.views||0} dilihat</div>
            <div style="display:flex;gap:.5rem;justify-content:flex-end" onclick="event.stopPropagation()">
              <button class="btn btn-outline btn-sm" onclick="openEditListing(${l.id})">✏️ Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteListing(${l.id})">🗑 Hapus</button>
              <button class="btn btn-sm" style="background:linear-gradient(135deg,#d4a017,#f59e0b);color:white;border:none;font-size:.75rem;padding:.3rem .8rem;border-radius:8px;cursor:pointer" onclick="openPromoteModal(${l.id},'listing')">⭐ Promosi</button>
            </div>
          </div>`;
          }).join('')
        : `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">
            <div style="font-size:2rem;margin-bottom:.8rem">📭</div>
            <p>Belum ada penawaran.</p>
            <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="openPostModal()">+ Buat Penawaran Pertama</button>
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
  document.getElementById('post-modal-title').textContent = 'Aku Bisa…';
  document.getElementById('post-form').reset();
  document.getElementById('post-category').innerHTML = categories.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');
  document.getElementById('post-modal').classList.add('open');
  setTimeout(initQuillEditor, 100);
}

async function openEditListing(id) {
  editListingId = id;
  const l = await api.getListing(id);
  document.getElementById('post-modal-title').textContent = 'Edit Penawaran';
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
    btn.innerHTML = '🚀 Posting Sekarang'; btn.disabled = false;
    if (res.listing || res.message?.includes('berhasil')) {
      showToast(editListingId ? 'Diperbarui! ✅' : 'Berhasil diposting! 🎉', 'success');
      closePostModal();
      renderDashboard();
    } else {
      showToast(res.message || 'Gagal menyimpan', 'error');
    }
  } catch(e) { btn.innerHTML = '🚀 Posting Sekarang'; btn.disabled = false; showToast('Koneksi gagal', 'error'); }
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
  document.getElementById('avatar-upload-label').textContent = '⏳ Mengupload...';
  const res = await api.uploadAvatar(form);
  document.getElementById('avatar-upload-label').textContent = '📷 Ganti Foto';
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
  if (!full_name) { errEl.textContent = 'Nama tidak boleh kosong'; return; }
  const btn = document.getElementById('ep-save-btn');
  btn.innerHTML = '<span class="spinner"></span>Menyimpan...';
  btn.disabled = true;
  const res = await api.updateProfile({ full_name, bio, city, phone });
  btn.innerHTML = '💾 Simpan Perubahan'; btn.disabled = false;
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
  lastUnreadCount = 0;
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
  btn.innerHTML = 'Kirim Pesan'; btn.disabled = false;
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
    document.getElementById('pub-listings').textContent = (profile.listing_count || 0) + ' penawaran';
    document.getElementById('pub-bio').textContent = profile.bio || '';

    if (profile.is_verified) document.getElementById('pub-verified').style.display = 'inline';

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

      // Tambah report button
      const reportBtn = document.createElement('button');
      reportBtn.className = 'btn btn-sm';
      reportBtn.style.cssText = 'color:var(--danger);border:1.5px solid var(--danger);border-radius:100px;padding:.4rem 1rem;font-size:.8rem;cursor:pointer;background:transparent';
      reportBtn.textContent = '🚩 Laporkan';
      reportBtn.onclick = () => openReportModal(userId, profile.full_name, null);
      document.getElementById('pub-msg-btn').parentElement.appendChild(reportBtn);
    }

    // Load listings
    const listRes = await api.getListings(`limit=6`);
    const myListings = (listRes.listings || []).filter(l => l.user_id == userId);
    document.getElementById('pub-listings-grid').innerHTML = myListings.length
      ? myListings.map(listingCardHTML).join('')
      : '<p style="color:var(--muted);font-size:.85rem">Belum ada penawaran aktif.</p>';

    // Reviews
    renderReviewList(reviewData.reviews || []);

  } catch(e) { console.error('renderPublicProfile error:', e); }
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
  btn.innerHTML = 'Kirim Ulasan'; btn.disabled = false;

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
        ${currentUser ? `<button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="openPostJobModal()">+ Posting Kebutuhanmu</button>` : ''}
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
        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openApplyJobModal(${r.id},'${(r.title||'').replace(/'/g,"\\'")}')">Lamar →</button>
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
  btn.innerHTML = 'Kirim Lamaran'; btn.disabled = false;

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
