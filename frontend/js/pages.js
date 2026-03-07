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

async function fetchExplore() {
  document.getElementById('explore-grid').innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem"><div style="width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .6s linear infinite;display:inline-block"></div></div>`;
  let params = 'limit=20';
  if (exploreFilter !== 'semua') params += `&category=${exploreFilter}`;
  if (exploreSearch) params += `&search=${encodeURIComponent(exploreSearch)}`;
  try {
    const res = await api.getListings(params);
    const listings = res.listings || [];
    document.getElementById('explore-grid').innerHTML = listings.length
      ? listings.map(listingCardHTML).join('')
      : '<p style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted)">Tidak ada penawaran ditemukan.</p>';
  } catch(e) {
    document.getElementById('explore-grid').innerHTML = '<p style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--danger)">Gagal memuat data.</p>';
  }
}

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
async function renderProfile() {
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
        ? listings.map(l=>`
          <div class="listing-card" style="cursor:default">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.5rem">
              <div style="font-weight:700;font-size:.95rem;flex:1">${l.title}</div>
              <span style="font-size:.72rem;color:${l.is_active?'var(--success)':'var(--muted)'};font-weight:700">● ${l.is_active?'Aktif':'Nonaktif'}</span>
            </div>
            <p style="font-size:.8rem;color:var(--muted);margin-bottom:.8rem">${l.description.slice(0,80)}…</p>
            <div style="font-size:.75rem;color:var(--muted);margin-bottom:.8rem">👁 ${l.views||0} dilihat · ${l.category_icon||''} ${l.category_name||''}</div>
            <div style="display:flex;gap:.5rem;justify-content:flex-end">
              <button class="btn btn-outline btn-sm" onclick="openEditListing(${l.id})">✏️ Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteListing(${l.id})">🗑 Hapus</button>
        <button class="btn btn-sm" style="background:linear-gradient(135deg,#d4a017,#f59e0b);color:white;border:none;font-size:.75rem;padding:.3rem .8rem;border-radius:8px;cursor:pointer" onclick="openPromoteModal(${l.id}, 'listing')">⭐ Promosi</button>
            </div>
          </div>`).join('')
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
}

async function openEditListing(id) {
  editListingId = id;
  const l = await api.getListing(id);
  document.getElementById('post-modal-title').textContent = 'Edit Penawaran';
  document.getElementById('post-category').innerHTML = categories.map(c=>`<option value="${c.id}" ${c.id==l.category_id?'selected':''}>${c.icon} ${c.name}</option>`).join('');
  document.getElementById('post-title').value = l.title;
  document.getElementById('post-desc').value = l.description;
  document.getElementById('post-price').value = l.price||'';
  document.getElementById('post-price-unit').value = l.price_unit||'';
  document.getElementById('post-city').value = l.city||'';
  document.getElementById('post-modal').classList.add('open');
}

function closePostModal() { document.getElementById('post-modal').classList.remove('open'); }

async function submitListing() {
  const data = {
    title: document.getElementById('post-title').value.trim(),
    description: document.getElementById('post-desc').value.trim(),
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
