const API = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';

const getToken = () => localStorage.getItem('akubisa_token');
const getUser  = () => JSON.parse(localStorage.getItem('akubisa_user') || 'null');

const headers = (auth=false) => {
  const h = { 'Content-Type': 'application/json' };
  if (auth) h['Authorization'] = `Bearer ${getToken()}`;
  return h;
};

const api = {
  // AUTH
  register: (data) => fetch(`${API}/auth/register`, { method:'POST', headers:headers(), body:JSON.stringify(data) }).then(r=>r.json()),
  login:    (data) => fetch(`${API}/auth/login`,    { method:'POST', headers:headers(), body:JSON.stringify(data) }).then(r=>r.json()),
  me:       ()     => fetch(`${API}/auth/me`,        { headers:headers(true) }).then(r=>r.json()),
  switchRole: (role) => fetch(`${API}/auth/switch-role`, { method:'PATCH', headers:headers(true), body:JSON.stringify({role}) }).then(r=>r.json()),

  // LISTINGS
  getListings: (params='') => fetch(`${API}/listings?${params}`).then(r=>r.json()),
  getListing:  (id)        => fetch(`${API}/listings/${id}`).then(r=>r.json()),
  createListing: (data)    => fetch(`${API}/listings`, { method:'POST', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json()),
  updateListing: (id,data) => fetch(`${API}/listings/${id}`, { method:'PUT', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json()),
  deleteListing: (id)      => fetch(`${API}/listings/${id}`, { method:'DELETE', headers:headers(true) }).then(r=>r.json()),
  myListings:  ()          => fetch(`${API}/listings/my`, { headers:headers(true) }).then(r=>r.json()),

  // CATEGORIES
  getCategories: () => fetch(`${API}/categories`).then(r=>r.json()),
  uploadDigitalFile: async (formData) => {
    const res = await fetch(`${API}/listings/upload-digital`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('akubisa_token')}` },
      body: formData
    });
    return res.json();
  },
  purchaseDigital: async (id) => {
    const res = await fetch(`${API}/listings/${id}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('akubisa_token')}` }
    });
    return res.json();
  },
  checkPurchase: async (id) => {
    const res = await fetch(`${API}/listings/${id}/purchase-status`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('akubisa_token')}` }
    });
    return res.json();
  }
};

const catStyle = {
  teknologi: { bg:'#e8f4ee', color:'#2a6b4a' },
  kreatif:   { bg:'#fce8e4', color:'#e8521a' },
  properti:  { bg:'#fff4e6', color:'#c07a00' },
  edukasi:   { bg:'#e8eeff', color:'#2a4ab0' },
  kuliner:   { bg:'#fff0f6', color:'#b02a6b' },
  jasa:      { bg:'#f0f0f0', color:'#555' },
  transportasi:{ bg:'#e8f0ff', color:'#1a3a8a' },
  kesehatan: { bg:'#f0fff4', color:'#166534' },

};
const avColors = ['#2a6b4a','#e8521a','#d4a017','#2a4ab0','#b02a6b','#555566','#0891b2'];
const initials = (name='') => name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
const avColor  = (name='') => avColors[name.charCodeAt(0) % avColors.length];

// PROFILE
api.getProfile    = (id)    => fetch(`${API}/profile/${id}`).then(r=>r.json());
api.updateProfile = (data)  => fetch(`${API}/profile/me`, { method:'PUT', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json());
api.uploadAvatar  = (form)  => fetch(`${API}/profile/me/avatar`, { method:'POST', headers:{'Authorization':`Bearer ${getToken()}`}, body:form }).then(r=>r.json());
api.getReviews    = (id)    => fetch(`${API}/profile/${id}/reviews`).then(r=>r.json());

// MESSAGES
api.getConversations = ()         => fetch(`${API}/messages/conversations`, { headers:headers(true) }).then(r=>r.json());
api.getMessages      = (convId)   => fetch(`${API}/messages/conversations/${convId}`, { headers:headers(true) }).then(r=>r.json());
api.sendMessage      = (data)     => fetch(`${API}/messages/send`, { method:'POST', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json());

// REVIEWS
api.getReviews  = (userId)  => fetch(`${API}/reviews/user/${userId}`).then(r=>r.json());
api.postReview  = (data)    => fetch(`${API}/reviews`, { method:'POST', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json());
api.deleteReview = (id)     => fetch(`${API}/reviews/${id}`, { method:'DELETE', headers:headers(true) }).then(r=>r.json());

// BOOKMARKS
api.getBookmarks    = ()   => fetch(`${API}/bookmarks`, { headers:headers(true) }).then(r=>r.json());
api.addBookmark     = (id) => fetch(`${API}/bookmarks/${id}`, { method:'POST', headers:headers(true) }).then(r=>r.json());
api.removeBookmark  = (id) => fetch(`${API}/bookmarks/${id}`, { method:'DELETE', headers:headers(true) }).then(r=>r.json());
api.checkBookmark   = (id) => fetch(`${API}/bookmarks/check/${id}`, { headers:headers(true) }).then(r=>r.json());

// NOTIFICATIONS
api.getNotifications = ()   => fetch(`${API}/notifications`, { headers:headers(true) }).then(r=>r.json());
api.readAllNotifs    = ()   => fetch(`${API}/notifications/read-all`, { method:'PATCH', headers:headers(true) }).then(r=>r.json());
api.readNotif        = (id) => fetch(`${API}/notifications/${id}/read`, { method:'PATCH', headers:headers(true) }).then(r=>r.json());
api.deleteNotif      = (id) => fetch(`${API}/notifications/${id}`, { method:'DELETE', headers:headers(true) }).then(r=>r.json());

// REPORTS
api.sendReport = (data) => fetch(`${API}/reports`, { method:'POST', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json());

// FORGOT PASSWORD
api.forgotPassword = (email) => fetch(`${API}/auth/forgot-password`, { method:'POST', headers:headers(), body:JSON.stringify({email}) }).then(r=>r.json());
api.resetPassword  = (token, password) => fetch(`${API}/auth/reset-password/${token}`, { method:'POST', headers:headers(), body:JSON.stringify({password}) }).then(r=>r.json());

// ADMIN
const adminHeaders = () => ({ 'Content-Type':'application/json', 'Authorization':`Bearer ${getToken()}` });
api.adminStats       = ()          => fetch(`${API}/admin/stats`, { headers:adminHeaders() }).then(r=>r.json());
api.adminGrowth      = ()          => fetch(`${API}/admin/growth`, { headers:adminHeaders() }).then(r=>r.json());
api.adminGetUsers    = (q='')      => fetch(`${API}/admin/users?${q}`, { headers:adminHeaders() }).then(r=>r.json());
api.adminVerifyUser  = (id)        => fetch(`${API}/admin/users/${id}/verify`, { method:'PATCH', headers:adminHeaders() }).then(r=>r.json());
api.adminDeleteUser  = (id)        => fetch(`${API}/admin/users/${id}`, { method:'DELETE', headers:adminHeaders() }).then(r=>r.json());
api.adminChangeRole  = (id,role)   => fetch(`${API}/admin/users/${id}/role`, { method:'PATCH', headers:adminHeaders(), body:JSON.stringify({role}) }).then(r=>r.json());
api.adminGetListings = (q='')      => fetch(`${API}/admin/listings?${q}`, { headers:adminHeaders() }).then(r=>r.json());
api.adminToggleListing = (id)      => fetch(`${API}/admin/listings/${id}/toggle`, { method:'PATCH', headers:adminHeaders() }).then(r=>r.json());
api.adminFeatureListing = (id,days)=> fetch(`${API}/admin/listings/${id}/feature`, { method:'PATCH', headers:adminHeaders(), body:JSON.stringify({days}) }).then(r=>r.json());
api.adminDeleteListing = (id)      => fetch(`${API}/admin/listings/${id}`, { method:'DELETE', headers:adminHeaders() }).then(r=>r.json());
api.adminGetReports  = (status)    => fetch(`${API}/admin/reports?status=${status||'pending'}`, { headers:adminHeaders() }).then(r=>r.json());
api.adminResolveReport = (id,action)=> fetch(`${API}/admin/reports/${id}/resolve`, { method:'PATCH', headers:adminHeaders(), body:JSON.stringify({action}) }).then(r=>r.json());
// ===== JOB REQUESTS =====
api.getJobRequests    = (params='')  => fetch(`${API}/job-requests?${params}`, { headers:headers(false) }).then(r=>r.json());
api.getJobRequest     = (id)         => fetch(`${API}/job-requests/${id}`, { headers:headers(false) }).then(r=>r.json());
api.createJobRequest  = (data)       => fetch(`${API}/job-requests`, { method:'POST', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json());
api.deleteJobRequest  = (id)         => fetch(`${API}/job-requests/${id}`, { method:'DELETE', headers:headers(true) }).then(r=>r.json());
api.myJobRequests     = ()           => fetch(`${API}/job-requests/my`, { headers:headers(true) }).then(r=>r.json());
api.getApplications   = (id)         => fetch(`${API}/job-requests/${id}/applications`, { headers:headers(true) }).then(r=>r.json());
api.applyJob          = (id, data)   => fetch(`${API}/job-requests/${id}/apply`, { method:'POST', headers:headers(true), body:JSON.stringify(data) }).then(r=>r.json());
api.acceptApplication = (appId)      => fetch(`${API}/job-requests/applications/${appId}/accept`, { method:'PATCH', headers:headers(true) }).then(r=>r.json());
