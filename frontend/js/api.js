(function () {
  const TOKEN_KEY = 'eko_token';
  const USER_KEY = 'eko_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function getStoredUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function logout() {
    clearSession();
    window.location.href = '/index.html';
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve('');
        return;
      }
      const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!allowed.includes(file.type)) {
        reject(new Error('Faqat PNG, JPG yoki WEBP formatidagi rasmlar qabul qilinadi.'));
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        reject(new Error('Rasm hajmi 4 MB dan oshmasligi kerak.'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error("Rasm faylini o'qib bo'lmadi."));
      reader.readAsDataURL(file);
    });
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast glass-panel-strong ${type}`;
    toast.setAttribute('role', 'status');

    const icon =
      type === 'success'
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        : type === 'error'
          ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
          : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    toast.innerHTML = `${icon}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate3d(0, 8px, 0)';
      toast.style.transition = 'opacity 180ms ease, transform 180ms ease';
      window.setTimeout(() => toast.remove(), 200);
    }, 3600);
  }

  async function request(path, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : {};

    if (!response.ok) {
      const error = new Error(data.error || `So'rov xatoligi (${response.status})`);
      error.status = response.status;
      if (response.status === 401 && path !== '/auth/login') {
        clearSession();
        window.location.href = '/index.html';
      }
      throw error;
    }

    return data;
  }

  function getUserInitials(name) {
    const parts = String(name || 'EK')
      .trim()
      .split(/\s+/)
      .map((part) => part.replace(/^[^a-zA-Z0-9\u0400-\u04FF]+/, ''))
      .filter(Boolean);
    if (parts.length === 0) return 'EK';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function setupNavigation(user) {
    const userNameEl = document.getElementById('header-user-name');
    if (userNameEl && user) {
      const roleLabels = {
        admin: 'Admin',
        director: 'Direktor',
        user: 'Komissiya',
      };
      const roleLabel = roleLabels[user.role] || 'Komissiya';
      userNameEl.textContent = `${user.fullName || user.username} · ${roleLabel}`;
    }

    const avatarSlot = document.getElementById('header-user-avatar');
    if (avatarSlot && user) {
      if (user.avatarUrl) {
        avatarSlot.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="${escapeHtml(user.fullName || user.username)}" class="header-avatar-img" referrerpolicy="no-referrer" />`;
      } else {
        avatarSlot.innerHTML = `<span class="header-avatar-initials">${escapeHtml(getUserInitials(user.fullName || user.username))}</span>`;
      }
    }

    const adminLink = document.getElementById('admin-nav-link');
    if (adminLink) {
      adminLink.hidden = user?.role !== 'admin';
    }

    const mySchoolLink = document.getElementById('my-school-nav-link');
    if (mySchoolLink) {
      if (user?.role === 'director' && user?.schoolId) {
        mySchoolLink.href = `/school.html?id=${user.schoolId}`;
        mySchoolLink.hidden = false;
      } else {
        mySchoolLink.hidden = true;
      }
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', logout);
    }

    const menuBtn = document.getElementById('mobile-menu-btn');
    const navEl = document.getElementById('main-nav');
    if (menuBtn && navEl && !menuBtn.dataset.bound) {
      menuBtn.dataset.bound = '1';
      menuBtn.addEventListener('click', () => {
        const isOpen = navEl.classList.toggle('open');
        menuBtn.setAttribute('aria-expanded', String(isOpen));
      });
    }
  }

  async function verifySession({ requireAdmin = false } = {}) {
    const token = getToken();
    if (!token) {
      window.location.href = '/index.html';
      return null;
    }

    try {
      const { user } = await request('/auth/me');
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      if (requireAdmin && user.role !== 'admin') {
        window.location.href = '/schools.html';
        return null;
      }

      setupNavigation(user);
      return user;
    } catch {
      clearSession();
      window.location.href = '/index.html';
      return null;
    }
  }

  window.EkoAPI = {
    getToken,
    getStoredUser,
    setSession,
    clearSession,
    logout,
    escapeHtml,
    getUserInitials,
    setupNavigation,
    readImageFileAsDataUrl,
    showToast,
    request,
    verifySession,
  };
})();
