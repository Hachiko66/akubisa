// ===================================================
// ADMIN DASHBOARD
// ===================================================

let adminCurrentTab = 'overview';

async function renderAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Akses ditolak!', 'error');
    goTo('home');
    return;
  }
  adminTab('overview');
}

function adminTab(tab) {
  adminCurrentTab = tab;
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p => p.style.display = 'none');
  const btn = document.getElementById(`atab-${tab}`);
  const panel = document.getElementById(`admin-${tab}`);
  if (btn) btn.classList.add('active');
  if (panel) panel.style.display = 'block';
  if (tab === 'overview')     loadAdminOverview();
  if (tab === 'users')        loadAdminUsers();
  if (tab === 'listings')     loadAdminListings();
  if (tab === 'reports')      loadAdminReports('pending');
  if (tab === 'withdrawals')  loadAdminWithdrawals();
  if (tab === 'disputes')     loadAdminDisputes();
  if (tab === 'transactions') loadAdminTransactions();
}

// ===== OVERVIEW =====
async function loadAdminOverview() {
  try {
    const stats = await api.adminStats();

    // Stat cards
    document.getElementById('stat-users').textContent    = stats.users?.total || 0;
    document.getElementById('stat-users-week').textContent = `+${stats.users?.new_week||0} minggu ini`;
    document.getElementById('stat-listings').textContent  = stats.listings?.total || 0;
    document.getElementById('stat-listings-active').textContent = `${stats.listings?.active||0} aktif`;
    document.getElementById('stat-messages').textContent  = stats.messages?.total || 0;
    document.getElementById('stat-reports').textContent   = stats.reports?.total || 0;
    document.getElementById('stat-reports-pending').textContent = `${stats.reports?.pending||0} pending`;
    document.getElementById('stat-rating').textContent    = stats.reviews?.avg || '-';
    document.getElementById('stat-reviews').textContent   = `${stats.reviews?.total||0} ulasan`;

    // User breakdown
    const totalUsers = parseInt(stats.users?.total||1);
    const workers = parseInt(stats.users?.workers||0);
    const clients = parseInt(stats.users?.clients||0);
    document.getElementById('user-breakdown').innerHTML = `
      <div>
        <div style="display:flex;justify-content:space-between;font-size:.83rem;margin-bottom:.3rem">
          <span>⚡ Pekerja</span><span style="font-weight:700">${workers}</span>
        </div>
        <div style="height:8px;background:var(--warm);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${Math.round(workers/totalUsers*100)}%;background:var(--accent2);border-radius:4px"></div>
        </div>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;font-size:.83rem;margin-bottom:.3rem">
          <span>🔍 Pencari</span><span style="font-weight:700">${clients}</span>
        </div>
        <div style="height:8px;background:var(--warm);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${Math.round(clients/totalUsers*100)}%;background:var(--accent);border-radius:4px"></div>
        </div>
      </div>
      <div style="font-size:.75rem;color:var(--muted);margin-top:.5rem">
        Rasio Pekerja:Pencari = ${workers}:${clients}
      </div>`;

    // Platform health
    const featured = parseInt(stats.listings?.featured||0);
    const active   = parseInt(stats.listings?.active||0);
    const total    = parseInt(stats.listings?.total||1);
    document.getElementById('platform-health').innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:.83rem;padding:.6rem;background:var(--warm);border-radius:8px">
        <span>📋 Listing aktif</span><strong>${active} / ${total}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.83rem;padding:.6rem;background:var(--warm);border-radius:8px">
        <span>⭐ Featured listing</span><strong>${featured}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.83rem;padding:.6rem;background:${parseInt(stats.reports?.pending)>5?'#fee2e2':'var(--warm)'};border-radius:8px">
        <span>🚩 Laporan pending</span><strong style="color:${parseInt(stats.reports?.pending)>5?'var(--danger)':'inherit'}">${stats.reports?.pending||0}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:.83rem;padding:.6rem;background:var(--warm);border-radius:8px">
        <span>💬 Total pesan</span><strong>${stats.messages?.total||0}</strong>
      </div>`;

    // Reports preview
    await loadAdminReportsPreview();
  } catch(e) {
    console.error('Admin stats error:', e);
    showToast('Gagal memuat statistik', 'error');
  }
}

async function loadAdminReportsPreview() {
  try {
    const reports = await api.adminGetReports('pending');
    const el = document.getElementById('admin-reports-preview');
    if (!reports.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:.85rem;text-align:center;padding:1rem">Tidak ada laporan pending 🎉</p>';
      return;
    }
    el.innerHTML = `<table class="admin-table">
      <thead><tr><th>Pelapor</th><th>Target</th><th>Alasan</th><th>Waktu</th><th>Aksi</th></tr></thead>
      <tbody>${reports.slice(0,5).map(r => `
        <tr>
          <td>${r.reporter_name}</td>
          <td>${r.reported_user_name||r.reported_listing_title||'-'}</td>
          <td><span class="badge badge-red">${r.reason}</span></td>
          <td style="color:var(--muted)">${timeAgo(r.created_at)}</td>
          <td>
            <div style="display:flex;gap:.4rem">
              <button class="btn btn-outline btn-sm" onclick="resolveReport(${r.id},'dismiss')" style="font-size:.72rem">Abaikan</button>
              <button class="btn btn-danger btn-sm" onclick="resolveReport(${r.id},'resolved')" style="font-size:.72rem">Proses</button>
            </div>
          </td>
        </tr>`).join('')}
      </tbody></table>`;
  } catch(e) {}
}

// ===== USERS =====
async function loadAdminUsers() {
  const search = document.getElementById('admin-user-search')?.value || '';
  const role   = document.getElementById('admin-user-role')?.value || '';
  const table  = document.getElementById('admin-users-table');
  table.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">Memuat...</p>';

  let q = '';
  if (search) q += `search=${encodeURIComponent(search)}&`;
  if (role)   q += `role=${role}&`;

  try {
    const res = await api.adminGetUsers(q);
    const users = res.users || [];
    document.getElementById('admin-users-count').textContent = `${res.total||users.length} user ditemukan`;

    if (!users.length) { table.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">Tidak ada user</p>'; return; }

    table.innerHTML = `
      <div style="overflow-x:auto">
      <table class="admin-table">
        <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Listing</th><th>Rating</th><th>Status</th><th>Join</th><th>Aksi</th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td>
              <div style="font-weight:600">${u.full_name}</div>
              <div style="font-size:.72rem;color:var(--muted)">${u.city||'-'}</div>
            </td>
            <td style="color:var(--muted);font-size:.8rem">${u.email}</td>
            <td>
              <span class="badge ${u.role==='worker'?'badge-green':u.role==='client'?'badge-orange':'badge-purple'}">
                ${u.role}
              </span>
            </td>
            <td style="text-align:center">${u.listing_count||0}</td>
            <td style="text-align:center">${u.avg_rating||'-'} ${u.review_count>0?'⭐':''}</td>
            <td>
              ${u.is_verified?'<span class="badge badge-green">✓ Verified</span>':'<span class="badge badge-red">Unverified</span>'}
            </td>
            <td style="color:var(--muted);font-size:.78rem">${new Date(u.created_at).toLocaleDateString('id-ID')}</td>
            <td>
              <div style="display:flex;gap:.3rem;flex-wrap:wrap">
                ${!u.is_verified?`<button class="btn btn-outline btn-sm" onclick="adminVerifyUser(${u.id})" style="font-size:.7rem">✓ Verify</button>`:''}
                <button class="btn btn-danger btn-sm" onclick="adminDeleteUser(${u.id},'${u.full_name.replace(/'/g,"\\'")}'" style="font-size:.7rem">Hapus</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  } catch(e) { table.innerHTML = '<p style="color:var(--danger);text-align:center;padding:2rem">Gagal memuat</p>'; }
}

async function adminVerifyUser(id) {
  const res = await api.adminVerifyUser(id);
  showToast(res.message, 'success');
  loadAdminUsers();
}

async function adminDeleteUser(id, name) {
  if (!confirm(`Hapus user "${name}"? Semua data akan hilang.`)) return;
  const res = await api.adminDeleteUser(id);
  showToast(res.message, 'success');
  loadAdminUsers();
}

// ===== LISTINGS =====
async function loadAdminListings() {
  const search = document.getElementById('admin-listing-search')?.value || '';
  const table  = document.getElementById('admin-listings-table');
  table.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">Memuat...</p>';

  let q = search ? `search=${encodeURIComponent(search)}&` : '';

  try {
    const res = await api.adminGetListings(q);
    const listings = res.listings || [];
    document.getElementById('admin-listings-count').textContent = `${res.total||listings.length} listing ditemukan`;

    if (!listings.length) { table.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">Tidak ada listing</p>'; return; }

    table.innerHTML = `
      <div style="overflow-x:auto">
      <table class="admin-table">
        <thead><tr><th>Judul</th><th>Pemilik</th><th>Kategori</th><th>Harga</th><th>Views</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>${listings.map(l => `
          <tr>
            <td>
              <div style="font-weight:600;max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l.title}</div>
              ${l.is_featured?'<span class="badge badge-purple">⭐ Featured</span>':''}
            </td>
            <td>
              <div style="font-size:.83rem">${l.full_name}</div>
              <div style="font-size:.72rem;color:var(--muted)">${l.email}</div>
            </td>
            <td>${l.category_icon||''} ${l.category_name||'-'}</td>
            <td style="font-weight:600;color:var(--accent)">${l.price?'Rp '+parseInt(l.price).toLocaleString('id-ID'):'-'}</td>
            <td style="text-align:center">${l.views||0}</td>
            <td>
              <span class="badge ${l.is_active?'badge-green':'badge-red'}">
                ${l.is_active?'Aktif':'Nonaktif'}
              </span>
            </td>
            <td>
              <div style="display:flex;gap:.3rem;flex-wrap:wrap">
                <button class="btn btn-outline btn-sm" onclick="adminToggleListing(${l.id})" style="font-size:.7rem">${l.is_active?'Nonaktifkan':'Aktifkan'}</button>
                ${!l.is_featured?`<button class="btn btn-outline btn-sm" onclick="adminFeatureListing(${l.id})" style="font-size:.7rem;color:#8b5cf6;border-color:#8b5cf6">⭐ Feature</button>`:''}
                <button class="btn btn-danger btn-sm" onclick="adminDeleteListing(${l.id})" style="font-size:.7rem">Hapus</button>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  } catch(e) { table.innerHTML = '<p style="color:var(--danger);text-align:center;padding:2rem">Gagal memuat</p>'; }
}

async function adminToggleListing(id) {
  const res = await api.adminToggleListing(id);
  showToast(res.message, 'success');
  loadAdminListings();
}

async function adminFeatureListing(id) {
  const days = prompt('Featured berapa hari?', '7');
  if (!days) return;
  const res = await api.adminFeatureListing(id, parseInt(days));
  showToast(res.message, 'success');
  loadAdminListings();
}

async function adminDeleteListing(id) {
  if (!confirm('Hapus listing ini?')) return;
  const res = await api.adminDeleteListing(id);
  showToast(res.message, 'success');
  loadAdminListings();
}

// ===== REPORTS =====
async function loadAdminReports(status='pending') {
  const table = document.getElementById('admin-reports-table');
  if (!table) return;
  table.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">Memuat...</p>';

  try {
    const reports = await api.adminGetReports(status);

    if (!reports.length) {
      table.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:.8rem">✅</div>
        <p>Tidak ada laporan ${status}</p>
      </div>`;
      return;
    }

    table.innerHTML = `
      <div style="overflow-x:auto">
      <table class="admin-table">
        <thead><tr><th>Pelapor</th><th>Target</th><th>Alasan</th><th>Deskripsi</th><th>Waktu</th><th>Aksi</th></tr></thead>
        <tbody>${reports.map(r => `
          <tr>
            <td>
              <div style="font-weight:600">${r.reporter_name}</div>
              <div style="font-size:.72rem;color:var(--muted)">${r.reporter_email}</div>
            </td>
            <td>
              ${r.reported_user_name?`<div style="font-weight:600">${r.reported_user_name}</div>`:''}
              ${r.reported_listing_title?`<div style="font-size:.78rem;color:var(--muted)">Listing: ${r.reported_listing_title}</div>`:''}
            </td>
            <td><span class="badge badge-red">${r.reason}</span></td>
            <td style="font-size:.8rem;max-width:200px;color:var(--muted)">${r.description||'-'}</td>
            <td style="font-size:.78rem;color:var(--muted)">${timeAgo(r.created_at)}</td>
            <td>
              ${status==='pending'?`
              <div style="display:flex;gap:.4rem">
                <button class="btn btn-outline btn-sm" onclick="resolveReport(${r.id},'dismiss')" style="font-size:.72rem">🚫 Abaikan</button>
                <button class="btn btn-danger btn-sm" onclick="resolveReport(${r.id},'resolved')" style="font-size:.72rem">✅ Proses</button>
              </div>`:`<span class="badge ${status==='resolved'?'badge-green':'badge-blue'}">${status}</span>`}
            </td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;
  } catch(e) { table.innerHTML = '<p style="color:var(--danger);text-align:center;padding:2rem">Gagal memuat laporan</p>'; }
}

async function resolveReport(id, action) {
  const res = await api.adminResolveReport(id, action);
  showToast(res.message, 'success');
  if (adminCurrentTab === 'reports') loadAdminReports('pending');
  else loadAdminReportsPreview();
}

// ===== WITHDRAW TAB =====
async function loadAdminWithdrawals() {
  const el = document.getElementById('admin-withdrawals');
  if (!el) return;
  el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Memuat...</div>';
  const data = await api.adminGetWithdrawals();
  if (!data.length) { el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Tidak ada request withdraw.</div>'; return; }
  const stColor = { pending:'#d97706', approved:'var(--success)', rejected:'var(--danger)' };
  el.innerHTML = `<table class="admin-table">
    <thead><tr><th>User</th><th>Bank</th><th>No. Rek</th><th>Jumlah</th><th>Status</th><th>Tanggal</th><th>Aksi</th></tr></thead>
    <tbody>${data.map(w => `
      <tr>
        <td><strong>${w.full_name}</strong><br><small style="color:var(--muted)">${w.email}</small></td>
        <td>${w.bank_name}</td>
        <td>${w.account_number}<br><small>${w.account_name}</small></td>
        <td><strong>Rp ${parseInt(w.amount).toLocaleString('id')}</strong></td>
        <td><span style="color:${stColor[w.status]||'var(--muted)'};font-weight:700">${w.status}</span></td>
        <td>${new Date(w.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</td>
        <td>${w.status==='pending' ? `
          <div style="display:flex;gap:.4rem;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="adminApproveWithdraw(${w.id})">✅ Approve</button>
            <button class="btn btn-danger btn-sm" onclick="adminRejectWithdraw(${w.id})">❌ Tolak</button>
          </div>` : w.admin_note || '-'}
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}

async function adminApproveWithdraw(id) {
  const note = prompt('Catatan (opsional):') || '';
  if (!confirm('Approve withdraw ini?')) return;
  const res = await api.adminApproveWithdrawal(id, note);
  showToast(res.message || 'Berhasil!', 'success');
  loadAdminWithdrawals();
}

async function adminRejectWithdraw(id) {
  const note = prompt('Alasan penolakan:');
  if (!note) { showToast('Alasan wajib diisi', 'error'); return; }
  const res = await api.adminRejectWithdrawal(id, note);
  showToast(res.message || 'Berhasil!', 'success');
  loadAdminWithdrawals();
}

// ===== DISPUTE TAB =====
async function loadAdminDisputes() {
  const el = document.getElementById('admin-disputes');
  if (!el) return;
  el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Memuat...</div>';
  const data = await api.adminGetDisputes();
  if (!data.length) { el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Tidak ada dispute aktif. 🎉</div>'; return; }
  el.innerHTML = `<table class="admin-table">
    <thead><tr><th>ID</th><th>Klien</th><th>Pekerja</th><th>Nilai</th><th>Alasan</th><th>Tanggal</th><th>Aksi</th></tr></thead>
    <tbody>${data.map(d => `
      <tr>
        <td>#${d.id}</td>
        <td>${d.client_name}<br><small style="color:var(--muted)">${d.client_email}</small></td>
        <td>${d.worker_name}<br><small style="color:var(--muted)">${d.worker_email}</small></td>
        <td>Rp ${parseInt(d.total_amount).toLocaleString('id')}</td>
        <td style="max-width:200px;font-size:.8rem">${d.dispute_reason||'-'}</td>
        <td>${new Date(d.dispute_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</td>
        <td>
          <div style="display:flex;gap:.4rem;flex-wrap:wrap">
            <button class="btn btn-danger btn-sm" onclick="adminResolveDispute(${d.id},'refund')">↩️ Refund Klien</button>
            <button class="btn btn-primary btn-sm" onclick="adminResolveDispute(${d.id},'release')">💰 Lepas ke Pekerja</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
}

async function adminResolveDispute(id, decision) {
  const label = decision === 'refund' ? 'refund ke klien' : 'lepas dana ke pekerja';
  const note = prompt(`Catatan keputusan (${label}):`);
  if (!confirm(`Yakin ${label} untuk dispute #${id}?`)) return;
  const res = await api.adminResolveDispute(id, decision, note||'');
  showToast(res.message || 'Berhasil!', 'success');
  loadAdminDisputes();
}

// ===== TRANSACTIONS TAB =====
async function loadAdminTransactions() {
  const el = document.getElementById('admin-transactions');
  if (!el) return;
  el.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Memuat...</div>';
  const { transactions, stats } = await api.adminGetTransactions();
  const stColor = {
    waiting_dp:'#94a3b8', dp_paid:'#0891b2', submitted:'#d97706',
    waiting_final:'#7c3aed', completed:'var(--success)',
    disputed:'var(--danger)', refunded:'#94a3b8', cancelled:'#94a3b8'
  };
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.8rem;margin-bottom:1.5rem">
      <div class="card" style="text-align:center"><div style="font-size:.75rem;color:var(--muted)">Total Transaksi</div><div style="font-size:1.4rem;font-weight:800">${stats.total||0}</div></div>
      <div class="card" style="text-align:center"><div style="font-size:.75rem;color:var(--muted)">Selesai</div><div style="font-size:1.4rem;font-weight:800;color:var(--success)">${stats.completed||0}</div></div>
      <div class="card" style="text-align:center"><div style="font-size:.75rem;color:var(--muted)">Dispute</div><div style="font-size:1.4rem;font-weight:800;color:var(--danger)">${stats.disputed||0}</div></div>
      <div class="card" style="text-align:center"><div style="font-size:.75rem;color:var(--muted)">Menunggu</div><div style="font-size:1.4rem;font-weight:800;color:#d97706">${stats.pending||0}</div></div>
      <div class="card" style="text-align:center"><div style="font-size:.75rem;color:var(--muted)">Total Fee</div><div style="font-size:1.1rem;font-weight:800;color:var(--accent2)">Rp ${parseInt(stats.total_fee||0).toLocaleString('id')}</div></div>
    </div>
    <table class="admin-table">
      <thead><tr><th>ID</th><th>Klien</th><th>Pekerja</th><th>Nilai</th><th>Fee</th><th>Status</th><th>Tanggal</th></tr></thead>
      <tbody>${transactions.map(t => `
        <tr>
          <td>#${t.id}</td>
          <td>${t.client_name}</td>
          <td>${t.worker_name}</td>
          <td>Rp ${parseInt(t.total_amount).toLocaleString('id')}</td>
          <td>Rp ${parseInt(t.platform_fee).toLocaleString('id')}</td>
          <td><span style="font-size:.75rem;font-weight:700;color:${stColor[t.status]||'var(--muted)'}">${t.status}</span></td>
          <td>${new Date(t.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}
