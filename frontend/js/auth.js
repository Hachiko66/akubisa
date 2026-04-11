function renderRegister() {
  document.getElementById('reg-role-input').value = 'worker';
  document.getElementById('reg-card-worker').classList.add('active');
  document.getElementById('reg-card-client').classList.remove('active');
  document.getElementById('reg-worker-hint').style.display = 'block';
  document.getElementById('reg-client-hint').style.display = 'none';
  const regErr = document.getElementById('reg-error');
  regErr.style.display = 'none';
  regErr.textContent = '';
}

function setRegRole(role) {
  document.getElementById('reg-role-input').value = role;
  const w = document.getElementById('reg-card-worker');
  const c = document.getElementById('reg-card-client');
  if (!w || !c) return;
  if (role === 'worker') {
    w.style.borderColor = 'var(--accent)'; w.style.background = '#fff8f6';
    c.style.borderColor = 'var(--border)'; c.style.background = 'white';
  } else {
    c.style.borderColor = 'var(--accent)'; c.style.background = '#fff8f6';
    w.style.borderColor = 'var(--border)'; w.style.background = 'white';
  }
  document.getElementById('reg-worker-hint').style.display = role === 'worker' ? 'block' : 'none';
  document.getElementById('reg-client-hint').style.display = role === 'client' ? 'block' : 'none';
}

async function doRegister() {
  const full_name = document.getElementById('reg-name').value.trim();
  const email     = document.getElementById('reg-email').value.trim();
  const password  = document.getElementById('reg-pass').value;
  const confirm   = document.getElementById('reg-confirm').value;
  const role      = document.getElementById('reg-role-input').value || 'worker';
  const city      = document.getElementById('reg-city').value.trim();
  const phone     = document.getElementById('reg-phone').value.trim();
  const errEl     = document.getElementById('reg-error');

  errEl.textContent = '';
  errEl.style.display = 'none';
  if (!full_name || !email || !password) { errEl.textContent = 'Semua field wajib diisi'; errEl.style.display = 'block'; return; }
  if (password !== confirm) { errEl.textContent = 'Password tidak cocok'; errEl.style.display = 'block'; return; }
  if (password.length < 6) { errEl.textContent = 'Password minimal 6 karakter'; errEl.style.display = 'block'; return; }

  const btn = document.getElementById('reg-btn');
  btn.innerHTML = '<span class="spinner"></span>Mendaftarkan...';
  btn.disabled = true;

  try {
    const ref_code = document.getElementById('reg-ref-code')?.value || '';
    const res = await api.register({ full_name, email, password, role, ref_code, city, phone });
    btn.innerHTML = t('register_btn');
    btn.disabled = false;
    if (res.token) {
      localStorage.setItem('akubisa_token', res.token);
      localStorage.setItem('akubisa_user', JSON.stringify(res.user));
      currentUser = res.user;
      renderNav();
      startNotifPoll();
      showToast('Selamat datang, ' + res.user.full_name.split(' ')[0] + '! Akun berhasil dibuat', 'success');
      goTo('dashboard');
    } else {
      errEl.textContent = res.message || 'Registrasi gagal'; errEl.style.display = 'block'; errEl.style.display = 'block';
    }
  } catch(e) {
    btn.innerHTML = t('register_btn');
    btn.disabled = false;
    errEl.textContent = 'Koneksi ke server gagal'; errEl.style.display = 'block';
  }
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) { errEl.textContent = t('err_required'); return; }

  const btn = document.getElementById('login-btn');
  btn.innerHTML = '<span class="spinner"></span>' + t('loading');
  btn.disabled = true;

  try {
    const res = await api.login({ email, password });
    btn.innerHTML = t('login_btn');
    btn.disabled = false;
    if (res.token) {
      localStorage.setItem('akubisa_token', res.token);
      localStorage.setItem('akubisa_user', JSON.stringify(res.user));
      currentUser = res.user;
      renderNav();
      startNotifPoll();
      showToast('Halo lagi, ' + res.user.full_name.split(' ')[0] + '!', 'success');
      goTo('dashboard');
      setTimeout(showOnboarding, 500);
    } else {
      errEl.textContent = res.message || 'Login gagal'; errEl.style.display = 'block';
    }
  } catch(e) {
    btn.innerHTML = t('login_btn');
    btn.disabled = false;
    errEl.textContent = 'Koneksi ke server gagal'; errEl.style.display = 'block';
  }
}
