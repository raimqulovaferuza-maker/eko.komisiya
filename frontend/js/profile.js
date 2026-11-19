(function () {
  const avatarFrame = document.getElementById('profile-avatar-frame');
  const profileFullname = document.getElementById('profile-fullname');
  const profileMeta = document.getElementById('profile-meta');
  const profileBioText = document.getElementById('profile-bio-text');
  const profilePhoneText = document.getElementById('profile-phone-text');
  const ratingsCountEl = document.getElementById('profile-ratings-count');
  const behaviorsCountEl = document.getElementById('profile-behaviors-count');

  const avatarForm = document.getElementById('profile-avatar-form');
  const avatarAlert = document.getElementById('avatar-form-alert');
  const avatarFileInput = document.getElementById('avatar-file-input');
  const avatarUrlInput = document.getElementById('avatar-url-input');
  const saveAvatarBtn = document.getElementById('save-avatar-btn');
  const removeAvatarBtn = document.getElementById('remove-avatar-btn');

  const infoForm = document.getElementById('profile-info-form');
  const infoAlert = document.getElementById('profile-form-alert');
  const fullnameInput = document.getElementById('prof-fullname');
  const phoneInput = document.getElementById('prof-phone');
  const bioInput = document.getElementById('prof-bio');
  const currentPasswordInput = document.getElementById('prof-current-password');
  const newPasswordInput = document.getElementById('prof-new-password');
  const saveProfileBtn = document.getElementById('save-profile-btn');

  const recentRatingsList = document.getElementById('recent-ratings-list');
  const recentBehaviorsList = document.getElementById('recent-behaviors-list');

  const ROLE_LABELS = {
    admin: 'Administrator',
    director: 'Maktab direktori',
    user: "Komissiya a'zosi",
  };

  const BEHAVIOR_STATUS_LABELS = {
    excellent: { label: "A'lo", cls: 'behavior-status-excellent' },
    good: { label: 'Yaxshi', cls: 'behavior-status-good' },
    satisfactory: { label: 'Qoniqarli', cls: 'behavior-status-satisfactory' },
    needs_attention: { label: "E'tibor talab", cls: 'behavior-status-needs_attention' },
  };

  function showAlert(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function hideAlert(el) {
    el.textContent = '';
    el.hidden = true;
  }

  function renderProfileData(data) {
    const { user, stats, recentRatings = [], recentBehaviors = [] } = data;
    const esc = window.EkoAPI.escapeHtml;

    if (user.avatarUrl) {
      avatarFrame.innerHTML = `<img src="${esc(user.avatarUrl)}" alt="${esc(user.fullName)} profil surati" class="profile-avatar-img" referrerpolicy="no-referrer" />`;
      removeAvatarBtn.hidden = false;
    } else {
      avatarFrame.innerHTML = `<span class="profile-avatar-fallback">${esc(window.EkoAPI.getUserInitials(user.fullName || user.username))}</span>`;
      removeAvatarBtn.hidden = true;
    }

    profileFullname.textContent = user.fullName || user.username;
    const roleLabel = ROLE_LABELS[user.role] || "Komissiya a'zosi";
    const metaParts = [`@${user.username}`, roleLabel];
    if (user.schoolName) {
      metaParts.push(user.schoolName);
    }
    profileMeta.textContent = metaParts.join(' · ');

    profileBioText.textContent = user.bio || "Qisqacha ma'lumot hali kiritilmagan.";
    profilePhoneText.textContent = user.phone ? `Telefon: ${user.phone}` : '';

    ratingsCountEl.textContent = String(stats?.ratingsCount ?? 0);
    behaviorsCountEl.textContent = String(stats?.behaviorCount ?? 0);

    fullnameInput.value = user.fullName || '';
    phoneInput.value = user.phone || '';
    bioInput.value = user.bio || '';

    if (recentRatings.length === 0) {
      recentRatingsList.innerHTML = '<p class="cell-sub">Hozircha maktab baholari mavjud emas.</p>';
    } else {
      recentRatingsList.innerHTML = recentRatings
        .map(
          (r) => `
            <div class="activity-row">
              <div>
                <a href="/school.html?id=${r.schoolId}" class="cell-primary">${esc(r.schoolName)}</a>
                <div class="cell-sub">${esc(r.district)}</div>
              </div>
              <div class="rating-avg tabular-nums" style="font-size: 1.05rem;">${r.rating} ★</div>
            </div>
          `
        )
        .join('');
    }

    if (recentBehaviors.length === 0) {
      recentBehaviorsList.innerHTML = '<p class="cell-sub">Hozircha xulq-atvor yozuvlari kiritilmagan.</p>';
    } else {
      recentBehaviorsList.innerHTML = recentBehaviors
        .map((b) => {
          const st = BEHAVIOR_STATUS_LABELS[b.behaviorStatus] || BEHAVIOR_STATUS_LABELS.good;
          const typeLabel = b.personType === 'teacher' ? 'Ustoz' : "O'quvchi";
          return `
            <div class="activity-row">
              <div>
                <div class="cell-primary">${esc(b.personName)}</div>
                <div class="cell-sub">${typeLabel} · ${esc(b.schoolName)} · ${esc(b.recordedAt)}</div>
              </div>
              <div class="${st.cls} tabular-nums" style="white-space: nowrap;">${st.label} (${b.ecoScore}/5)</div>
            </div>
          `;
        })
        .join('');
    }
  }

  function syncSessionUser(user) {
    const token = window.EkoAPI.getToken();
    if (token && user) {
      window.EkoAPI.setSession(token, user);
      window.EkoAPI.setupNavigation(user);
    }
  }

  async function loadProfile() {
    try {
      const data = await window.EkoAPI.request('/profile');
      renderProfileData(data);
      syncSessionUser(data.user);
    } catch (err) {
      window.EkoAPI.showToast(err.message || "Profil ma'lumotlarini yuklashda xatolik.", 'error');
    }
  }

  avatarForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert(avatarAlert);

    const file = avatarFileInput.files && avatarFileInput.files[0];
    const imageUrl = avatarUrlInput.value.trim();

    if (!file && !imageUrl) {
      showAlert(avatarAlert, 'Rasm fayli tanlang yoki yaroqli rasm havolasini kiriting.');
      return;
    }

    saveAvatarBtn.disabled = true;
    saveAvatarBtn.textContent = 'Yuklanmoqda...';

    try {
      const payload = {};
      if (file) {
        payload.imageDataUrl = await window.EkoAPI.readImageFileAsDataUrl(file);
      } else {
        payload.imageUrl = imageUrl;
      }

      const res = await window.EkoAPI.request('/profile/avatar', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      avatarForm.reset();
      renderProfileData(res);
      syncSessionUser(res.user);
      window.EkoAPI.showToast(res.message || 'Profil surati yangilandi.', 'success');
    } catch (err) {
      showAlert(avatarAlert, err.message || "Profil suratini saqlab bo'lmadi.");
    } finally {
      saveAvatarBtn.disabled = false;
      saveAvatarBtn.textContent = 'Rasmni saqlash';
    }
  });

  removeAvatarBtn.addEventListener('click', async () => {
    hideAlert(avatarAlert);
    removeAvatarBtn.disabled = true;
    removeAvatarBtn.textContent = "O'chirilmoqda...";

    try {
      const res = await window.EkoAPI.request('/profile/avatar', {
        method: 'DELETE',
      });
      renderProfileData(res);
      syncSessionUser(res.user);
      window.EkoAPI.showToast(res.message || "Profil surati o'chirildi.", 'info');
    } catch (err) {
      window.EkoAPI.showToast(err.message || "Profil suratini o'chirishda xatolik.", 'error');
    } finally {
      removeAvatarBtn.disabled = false;
      removeAvatarBtn.textContent = "Rasmni o'chirish";
    }
  });

  infoForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideAlert(infoAlert);

    const payload = {
      fullName: fullnameInput.value.trim(),
      phone: phoneInput.value.trim(),
      bio: bioInput.value.trim(),
      currentPassword: currentPasswordInput.value,
      newPassword: newPasswordInput.value,
    };

    if (!payload.fullName) {
      showAlert(infoAlert, "To'liq ism kiritilishi shart.");
      return;
    }

    saveProfileBtn.disabled = true;
    saveProfileBtn.textContent = 'Saqlanmoqda...';

    try {
      const res = await window.EkoAPI.request('/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      currentPasswordInput.value = '';
      newPasswordInput.value = '';
      renderProfileData(res);
      syncSessionUser(res.user);
      window.EkoAPI.showToast(res.message || "Profil ma'lumotlari saqlandi.", 'success');
    } catch (err) {
      showAlert(infoAlert, err.message || "Profilni saqlashda xatolik.");
    } finally {
      saveProfileBtn.disabled = false;
      saveProfileBtn.textContent = "Ma'lumotlarni saqlash";
    }
  });

  async function init() {
    const user = await window.EkoAPI.verifySession();
    if (!user) return;
    await loadProfile();
  }

  init();
})();
