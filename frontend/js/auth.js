(function () {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const panelLogin = document.getElementById('panel-login');
  const panelRegister = document.getElementById('panel-register');

  const loginForm = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginAlert = document.getElementById('login-alert');
  const submitBtn = document.getElementById('login-submit');
  const togglePasswordBtn = document.getElementById('toggle-password-btn');

  const registerForm = document.getElementById('register-form');
  const regFullnameInput = document.getElementById('reg-fullname');
  const regUsernameInput = document.getElementById('reg-username');
  const regPasswordInput = document.getElementById('reg-password');
  const regRoleSelect = document.getElementById('reg-role');
  const regNoteInput = document.getElementById('reg-note');
  const registerAlert = document.getElementById('register-alert');
  const registerSubmitBtn = document.getElementById('register-submit');

  function showAlert(el, message, type = 'error') {
    if (!el) return;
    el.className = `form-alert ${type}`;
    el.textContent = message;
    el.hidden = false;
  }

  function hideAlert(el) {
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
  }

  function switchTab(mode) {
    const isLogin = mode === 'login';
    tabLogin.classList.toggle('active', isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    tabLogin.setAttribute('aria-selected', String(isLogin));
    tabRegister.setAttribute('aria-selected', String(!isLogin));
    panelLogin.hidden = !isLogin;
    panelRegister.hidden = isLogin;
    hideAlert(loginAlert);
    hideAlert(registerAlert);
  }

  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => switchTab('login'));
    tabRegister.addEventListener('click', () => switchTab('register'));
  }

  async function checkExistingSession() {
    const token = window.EkoAPI.getToken();
    if (!token) return;

    try {
      const data = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data.ok) {
        window.location.href = '/schools.html';
      } else {
        window.EkoAPI.clearSession();
      }
    } catch {
      // Stay on login page if offline
    }
  }

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', () => {
      const showing = passwordInput.type === 'text';
      passwordInput.type = showing ? 'password' : 'text';
      togglePasswordBtn.setAttribute('aria-pressed', String(!showing));
      togglePasswordBtn.setAttribute(
        'aria-label',
        showing ? "Parolni ko'rsatish" : 'Parolni yashirish'
      );
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideAlert(loginAlert);

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      if (!username || !password) {
        showAlert(loginAlert, 'Iltimos, login va parolni kiriting.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Tekshirilmoqda...';

      try {
        const res = await window.EkoAPI.request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        });

        window.EkoAPI.setSession(res.token, res.user);
        window.location.href = '/schools.html';
      } catch (err) {
        showAlert(loginAlert, err.message || 'Kirishda xatolik yuz berdi.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Tizimga kirish';
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      hideAlert(registerAlert);

      const fullName = regFullnameInput.value.trim();
      const username = regUsernameInput.value.trim();
      const password = regPasswordInput.value;
      const requestedRole = regRoleSelect ? regRoleSelect.value : 'user';
      const note = regNoteInput.value.trim();

      if (!fullName || !username || !password) {
        showAlert(registerAlert, "Ism, login va parolni to'ldiring.");
        return;
      }

      registerSubmitBtn.disabled = true;
      registerSubmitBtn.textContent = 'Yuborilmoqda...';

      try {
        const res = await window.EkoAPI.request('/auth/register-request', {
          method: 'POST',
          body: JSON.stringify({ fullName, username, password, requestedRole, note }),
        });

        registerForm.reset();
        showAlert(
          registerAlert,
          res.message || "Arizangiz yuborildi. Administrator tasdiqlashini kuting.",
          'success'
        );
        window.EkoAPI.showToast("Ro'yxatdan o'tish arizasi yuborildi", 'success');
      } catch (err) {
        showAlert(registerAlert, err.message || 'Ariza yuborishda xatolik yuz berdi.');
      } finally {
        registerSubmitBtn.disabled = false;
        registerSubmitBtn.textContent = 'Ariza yuborish';
      }
    });
  }

  checkExistingSession();
})();
