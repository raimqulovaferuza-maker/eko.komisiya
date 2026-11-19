(function () {
  const kpiUsers = document.getElementById('admin-kpi-users');
  const kpiPending = document.getElementById('admin-kpi-pending');
  const kpiSchools = document.getElementById('admin-kpi-schools');
  const kpiVotes = document.getElementById('admin-kpi-votes');

  const requestsFilter = document.getElementById('requests-status-filter');
  const requestsTableBody = document.getElementById('requests-table-body');

  const createUserForm = document.getElementById('create-user-form');
  const userFormAlert = document.getElementById('user-form-alert');
  const createUserBtn = document.getElementById('create-user-btn');
  const newUserRoleSelect = document.getElementById('new-user-role');
  const newUserSchoolGroup = document.getElementById('new-user-school-group');
  const newUserSchoolSelect = document.getElementById('new-user-school');
  const usersTableBody = document.getElementById('users-table-body');
  const userSearchInput = document.getElementById('admin-user-search');

  const createSchoolForm = document.getElementById('create-school-form');
  const schoolFormAlert = document.getElementById('school-form-alert');
  const createSchoolBtn = document.getElementById('create-school-btn');
  const schoolImageFileInput = document.getElementById('school-image-file');
  const schoolsTableBody = document.getElementById('schools-table-body');
  const schoolSearchInput = document.getElementById('admin-school-search');

  const ratingsTableBody = document.getElementById('ratings-table-body');
  const ratingSearchInput = document.getElementById('admin-rating-search');

  const confirmModal = document.getElementById('confirm-modal');
  const confirmModalTitle = document.getElementById('confirm-modal-title');
  const confirmModalDesc = document.getElementById('confirm-modal-desc');
  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  const confirmAcceptBtn = document.getElementById('confirm-accept-btn');

  let currentUser = null;
  let allRequests = [];
  let allUsers = [];
  let allSchools = [];
  let allRatings = [];
  let pendingConfirmAction = null;

  function showFormAlert(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function hideFormAlert(el) {
    el.textContent = '';
    el.hidden = true;
  }

  function updateKpis() {
    kpiUsers.textContent = String(allUsers.length);
    kpiPending.textContent = String(allRequests.filter((r) => r.status === 'pending').length);
    kpiSchools.textContent = String(allSchools.length);
    const totalVotes = allSchools.reduce((sum, s) => sum + (s.ratingsCount || 0), 0);
    kpiVotes.textContent = String(totalVotes);
  }

  function toggleDirectorSchoolSelect() {
    const isDirector = newUserRoleSelect.value === 'director';
    newUserSchoolGroup.hidden = !isDirector;
  }

  function populateNewUserSchools() {
    const currentVal = newUserSchoolSelect.value;
    const esc = window.EkoAPI.escapeHtml;
    const options = allSchools
      .map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.district)})</option>`)
      .join('');
    newUserSchoolSelect.innerHTML = `<option value="">Maktab tanlang (ixtiyoriy)</option>${options}`;
    if (currentVal && allSchools.some((s) => String(s.id) === currentVal)) {
      newUserSchoolSelect.value = currentVal;
    }
  }

  function openConfirmModal(title, description, onConfirm) {
    confirmModalTitle.textContent = title;
    confirmModalDesc.textContent = description;
    pendingConfirmAction = onConfirm;
    confirmModal.hidden = false;
    confirmAcceptBtn.focus();
  }

  function closeConfirmModal() {
    confirmModal.hidden = true;
    pendingConfirmAction = null;
    confirmAcceptBtn.disabled = false;
    confirmAcceptBtn.textContent = "O'chirish";
  }

  confirmCancelBtn.addEventListener('click', closeConfirmModal);
  confirmModal.addEventListener('click', (event) => {
    if (event.target === confirmModal) {
      closeConfirmModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmModal.hidden) {
      closeConfirmModal();
    }
  });

  confirmAcceptBtn.addEventListener('click', async () => {
    if (!pendingConfirmAction) return;
    confirmAcceptBtn.disabled = true;
    confirmAcceptBtn.textContent = "O'chirilmoqda...";
    try {
      await pendingConfirmAction();
      closeConfirmModal();
    } catch {
      confirmAcceptBtn.disabled = false;
      confirmAcceptBtn.textContent = "O'chirish";
    }
  });

  function renderRequestsTable() {
    const statusVal = requestsFilter.value;
    const filtered = allRequests.filter((r) => statusVal === 'all' || r.status === statusVal);
    const esc = window.EkoAPI.escapeHtml;

    if (filtered.length === 0) {
      requestsTableBody.innerHTML =
        '<tr><td colspan="6">Hozircha kutilayotgan ro\'yxatdan o\'tish arizalari yo\'q.</td></tr>';
      return;
    }

    requestsTableBody.innerHTML = filtered
      .map((req) => {
        const statusMap = {
          pending: { label: 'Kutilmoqda', cls: 'status-text-pending' },
          approved: { label: 'Qabul qilingan', cls: 'status-text-approved' },
          rejected: { label: 'Rad etilgan', cls: 'status-text-rejected' },
        };
        const st = statusMap[req.status] || statusMap.pending;
        const isRequestedAdmin = req.requestedRole === 'admin';
        const roleBadgeHtml = isRequestedAdmin
          ? '<span class="role-label-admin">Administrator</span>'
          : '<span class="role-label-user">Komissiya a\'zosi</span>';

        const reviewedSub =
          req.status !== 'pending' && req.reviewedByName
            ? `<div class="cell-sub">Ko'rib chiqdi: ${esc(req.reviewedByName)}</div>`
            : '';

        const actionsHtml =
          req.status === 'pending'
            ? `
              <div class="action-row">
                <button
                  type="button"
                  class="btn btn-approve btn-sm approve-req-btn"
                  data-req-id="${req.id}"
                  data-username="${esc(req.username)}"
                  aria-label="${esc(req.fullName)} arizasini qabul qilish"
                >
                  Qabul qilish
                </button>
                <button
                  type="button"
                  class="btn btn-danger btn-sm reject-req-btn"
                  data-req-id="${req.id}"
                  data-username="${esc(req.username)}"
                  aria-label="${esc(req.fullName)} arizasini rad etish"
                >
                  Rad etish
                </button>
              </div>
            `
            : `<span class="cell-sub">Ko'rib chiqilgan</span>`;

        return `
          <tr>
            <td data-label="F.I.Sh.">
              <div class="cell-primary">${esc(req.fullName)}</div>
            </td>
            <td data-label="Login" class="tabular-nums">${esc(req.username)}</td>
            <td data-label="So'ralgan rol">${roleBadgeHtml}</td>
            <td data-label="Izoh">${esc(req.note || '—')}</td>
            <td data-label="Holat">
              <span class="${st.cls}">${st.label}</span>
              ${reviewedSub}
            </td>
            <td data-label="Amal" class="num-col">${actionsHtml}</td>
          </tr>
        `;
      })
      .join('');

    requestsTableBody.querySelectorAll('.approve-req-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.reqId);
        btn.disabled = true;
        btn.textContent = 'Saqlanmoqda...';
        try {
          const res = await window.EkoAPI.request(`/users/requests/${id}/approve`, {
            method: 'POST',
          });
          window.EkoAPI.showToast(res.message || 'Ariza qabul qilindi.', 'success');
          await loadAdminData();
        } catch (err) {
          window.EkoAPI.showToast(err.message || 'Xatolik yuz berdi.', 'error');
          btn.disabled = false;
          btn.textContent = 'Qabul qilish';
        }
      });
    });

    requestsTableBody.querySelectorAll('.reject-req-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = Number(btn.dataset.reqId);
        btn.disabled = true;
        btn.textContent = 'Saqlanmoqda...';
        try {
          const res = await window.EkoAPI.request(`/users/requests/${id}/reject`, {
            method: 'POST',
          });
          window.EkoAPI.showToast(res.message || 'Ariza rad etildi.', 'info');
          await loadAdminData();
        } catch (err) {
          window.EkoAPI.showToast(err.message || 'Xatolik yuz berdi.', 'error');
          btn.disabled = false;
          btn.textContent = 'Rad etish';
        }
      });
    });
  }

  function renderUsersTable() {
    const query = userSearchInput.value.trim().toLowerCase();
    const filtered = allUsers.filter(
      (u) =>
        !query ||
        u.username.toLowerCase().includes(query) ||
        u.fullName.toLowerCase().includes(query)
    );

    const esc = window.EkoAPI.escapeHtml;

    if (filtered.length === 0) {
      usersTableBody.innerHTML = '<tr><td colspan="5">Mos foydalanuvchilar topilmadi.</td></tr>';
      return;
    }

    usersTableBody.innerHTML = filtered
      .map((u) => {
        const isSelf = currentUser && u.id === currentUser.id;
        const isProtectedAdmin =
          u.isPrimaryAdmin ||
          u.username === 'bexruz' ||
          (u.role === 'admin' && currentUser?.username !== 'bexruz');

        let roleText = "Komissiya a'zosi";
        let roleClass = 'role-label-user';
        if (u.role === 'admin') {
          roleText = u.isPrimaryAdmin || u.username === 'bexruz' ? 'Bosh administrator' : 'Administrator';
          roleClass = 'role-label-admin';
        } else if (u.role === 'director') {
          roleText = 'Direktor';
          roleClass = 'role-label-director';
        }
        const schoolSub =
          u.role === 'director' && u.schoolName
            ? `<div class="cell-sub">${esc(u.schoolName)}</div>`
            : '';

        let actionCellHtml = `<button type="button" class="btn btn-danger btn-sm delete-user-btn" data-user-id="${u.id}" data-username="${esc(u.username)}" aria-label="Foydalanuvchi ${esc(u.username)} ni o'chirish">O'chirish</button>`;
        if (isSelf) {
          actionCellHtml = '<span class="cell-sub">Joriy hisob</span>';
        } else if (isProtectedAdmin) {
          actionCellHtml = '<span class="cell-sub">Himoyalangan admin</span>';
        }

        return `
          <tr>
            <td data-label="F.I.Sh.">
              <div class="cell-primary">${esc(u.fullName)}</div>
            </td>
            <td data-label="Login" class="tabular-nums">${esc(u.username)}</td>
            <td data-label="Rol">
              <span class="${roleClass}">${roleText}</span>
              ${schoolSub}
            </td>
            <td data-label="Ovozlar" class="num-col tabular-nums">${u.ratingsCount ?? 0}</td>
            <td data-label="Amal" class="num-col">${actionCellHtml}</td>
          </tr>
        `;
      })
      .join('');

    usersTableBody.querySelectorAll('.delete-user-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.userId);
        const username = btn.dataset.username;
        openConfirmModal(
          "Akkauntni o'chirish",
          `"${username}" foydalanuvchisi va uning ovozlari bazadan o'chiriladi. Davom etasizmi?`,
          async () => {
            try {
              const res = await window.EkoAPI.request(`/users/${id}`, { method: 'DELETE' });
              window.EkoAPI.showToast(res.message || "Akkaunt o'chirildi.", 'success');
              await loadAdminData();
            } catch (err) {
              window.EkoAPI.showToast(err.message || "O'chirishda xatolik.", 'error');
              throw err;
            }
          }
        );
      });
    });
  }

  function renderSchoolsTable() {
    const query = schoolSearchInput.value.trim().toLowerCase();
    const filtered = allSchools.filter(
      (s) =>
        !query ||
        s.name.toLowerCase().includes(query) ||
        s.district.toLowerCase().includes(query)
    );

    const esc = window.EkoAPI.escapeHtml;

    if (filtered.length === 0) {
      schoolsTableBody.innerHTML = '<tr><td colspan="6">Mos maktablar topilmadi.</td></tr>';
      return;
    }

    const assignableUsers = allUsers.filter((u) => u.role !== 'admin');

    schoolsTableBody.innerHTML = filtered
      .map((s) => {
        const ratingStr = s.ratingsCount > 0 ? s.avgRating.toFixed(2) : '0.00';
        const directorOptions = assignableUsers
          .map((u) => {
            const selected = Number(s.directorId) === Number(u.id) ? 'selected' : '';
            return `<option value="${u.id}" ${selected}>${esc(u.fullName)} (@${esc(u.username)})</option>`;
          })
          .join('');

        return `
          <tr>
            <td data-label="Maktab">
              <div class="cell-primary">${esc(s.name)}</div>
              <div class="cell-sub">${esc(s.ecoFocus)}</div>
            </td>
            <td data-label="Tuman">${esc(s.district)}</td>
            <td data-label="Direktor">
              <select
                class="inline-director-select"
                data-school-director-select="${s.id}"
                aria-label="${esc(s.name)} direktori"
              >
                <option value="">Biriktirilmagan</option>
                ${directorOptions}
              </select>
            </td>
            <td data-label="Reyting" class="num-col tabular-nums">${ratingStr}</td>
            <td data-label="Ovozlar" class="num-col tabular-nums">${s.ratingsCount}</td>
            <td data-label="Amal" class="num-col">
              <div class="action-row">
                <a href="/school.html?id=${s.id}" class="btn btn-ghost btn-sm" aria-label="${esc(s.name)} sahifasi">
                  Sahifa
                </a>
                <button
                  type="button"
                  class="btn btn-danger btn-sm delete-school-btn"
                  data-school-id="${s.id}"
                  data-school-name="${esc(s.name)}"
                  aria-label="${esc(s.name)} maktabini o'chirish"
                >
                  O'chirish
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    schoolsTableBody.querySelectorAll('[data-school-director-select]').forEach((selectEl) => {
      selectEl.addEventListener('change', async () => {
        const schoolId = Number(selectEl.dataset.schoolDirectorSelect);
        const val = selectEl.value;
        selectEl.disabled = true;
        try {
          const res = await window.EkoAPI.request(`/schools/${schoolId}/director`, {
            method: 'PATCH',
            body: JSON.stringify({ directorId: val ? Number(val) : null }),
          });
          window.EkoAPI.showToast(res.message || 'Direktor yangilandi.', 'success');
          await loadAdminData();
        } catch (err) {
          window.EkoAPI.showToast(err.message || 'Direktorni biriktirishda xatolik.', 'error');
          selectEl.disabled = false;
        }
      });
    });

    schoolsTableBody.querySelectorAll('.delete-school-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.schoolId);
        const name = btn.dataset.schoolName;
        openConfirmModal(
          "Maktabni o'chirish",
          `"${name}" maktabi va unga berilgan barcha baholar o'chiriladi. Tasdiqlaysizmi?`,
          async () => {
            try {
              const res = await window.EkoAPI.request(`/schools/${id}`, { method: 'DELETE' });
              window.EkoAPI.showToast(res.message || "Maktab o'chirildi.", 'success');
              await loadAdminData();
            } catch (err) {
              window.EkoAPI.showToast(err.message || "O'chirishda xatolik.", 'error');
              throw err;
            }
          }
        );
      });
    });
  }

  function renderRatingsTable() {
    const query = ratingSearchInput.value.trim().toLowerCase();
    const filtered = allRatings.filter(
      (r) =>
        !query ||
        r.schoolName.toLowerCase().includes(query) ||
        r.username.toLowerCase().includes(query) ||
        r.userFullName.toLowerCase().includes(query)
    );

    const esc = window.EkoAPI.escapeHtml;

    if (filtered.length === 0) {
      ratingsTableBody.innerHTML = '<tr><td colspan="4">Mos baholar topilmadi.</td></tr>';
      return;
    }

    ratingsTableBody.innerHTML = filtered
      .map((r) => {
        const options = [1, 2, 3, 4, 5]
          .map(
            (n) =>
              `<option value="${n}" ${r.rating === n ? 'selected' : ''}>${n} yulduz</option>`
          )
          .join('');

        return `
          <tr>
            <td data-label="Maktab">
              <div class="cell-primary">${esc(r.schoolName)}</div>
              <div class="cell-sub">${esc(r.schoolDistrict)}</div>
            </td>
            <td data-label="Foydalanuvchi">
              <div class="cell-primary">${esc(r.userFullName)}</div>
              <div class="cell-sub tabular-nums">@${esc(r.username)}</div>
            </td>
            <td data-label="Baho" class="num-col">
              <div class="inline-rating-editor">
                <select
                  class="inline-rating-select"
                  data-rating-select="${r.id}"
                  aria-label="${esc(r.schoolName)} uchun ${esc(r.username)} bahosi"
                >
                  ${options}
                </select>
                <button
                  type="button"
                  class="btn btn-approve btn-sm save-rating-btn"
                  data-rating-id="${r.id}"
                  aria-label="${esc(r.schoolName)} uchun ${esc(r.username)} bahosini saqlash"
                >
                  Saqlash
                </button>
              </div>
            </td>
            <td data-label="Amal" class="num-col">
              <button
                type="button"
                class="btn btn-danger btn-sm delete-rating-btn"
                data-rating-id="${r.id}"
                data-label-text="${esc(r.schoolName)} (${esc(r.username)})"
                aria-label="${esc(r.schoolName)} bahosini o'chirish"
              >
                O'chirish
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    ratingsTableBody.querySelectorAll('.save-rating-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ratingId = Number(btn.dataset.ratingId);
        const selectEl = ratingsTableBody.querySelector(`[data-rating-select="${ratingId}"]`);
        const newRating = Number(selectEl?.value);
        btn.disabled = true;
        btn.textContent = 'Saqlanmoqda...';

        try {
          const res = await window.EkoAPI.request(`/schools/ratings/${ratingId}`, {
            method: 'PATCH',
            body: JSON.stringify({ rating: newRating }),
          });
          window.EkoAPI.showToast(res.message || 'Baho yangilandi.', 'success');
          await loadAdminData();
        } catch (err) {
          window.EkoAPI.showToast(err.message || 'Bahoni yangilashda xatolik.', 'error');
          btn.disabled = false;
          btn.textContent = 'Saqlash';
        }
      });
    });

    ratingsTableBody.querySelectorAll('.delete-rating-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ratingId = Number(btn.dataset.ratingId);
        const descText = btn.dataset.labelText;
        openConfirmModal(
          "Bahoni o'chirish",
          `${descText} bahosini o'chirishni tasdiqlaysizmi?`,
          async () => {
            try {
              const res = await window.EkoAPI.request(`/schools/ratings/${ratingId}`, {
                method: 'DELETE',
              });
              window.EkoAPI.showToast(res.message || "Baho o'chirildi.", 'success');
              await loadAdminData();
            } catch (err) {
              window.EkoAPI.showToast(err.message || "O'chirishda xatolik.", 'error');
              throw err;
            }
          }
        );
      });
    });
  }

  async function loadAdminData() {
    try {
      const [requestsData, usersData, schoolsData, ratingsData] = await Promise.all([
        window.EkoAPI.request('/users/requests'),
        window.EkoAPI.request('/users'),
        window.EkoAPI.request('/schools'),
        window.EkoAPI.request('/schools/ratings/all'),
      ]);

      allRequests = requestsData.requests || [];
      allUsers = usersData.users || [];
      allSchools = schoolsData.schools || [];
      allRatings = ratingsData.ratings || [];

      updateKpis();
      populateNewUserSchools();
      renderRequestsTable();
      renderUsersTable();
      renderSchoolsTable();
      renderRatingsTable();
    } catch (err) {
      window.EkoAPI.showToast(err.message || "Ma'lumotlarni yuklashda xatolik.", 'error');
    }
  }

  createUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormAlert(userFormAlert);

    const fullName = document.getElementById('new-user-fullname').value.trim();
    const username = document.getElementById('new-user-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const role = newUserRoleSelect.value;
    const rawSchoolId = newUserSchoolSelect.value;
    const schoolId = role === 'director' && rawSchoolId ? Number(rawSchoolId) : null;

    if (!fullName || !username || !password) {
      showFormAlert(userFormAlert, "Barcha majburiy maydonlarni to'ldiring.");
      return;
    }

    createUserBtn.disabled = true;
    createUserBtn.textContent = 'Saqlanmoqda...';

    try {
      const res = await window.EkoAPI.request('/users', {
        method: 'POST',
        body: JSON.stringify({ fullName, username, password, role, schoolId }),
      });

      createUserForm.reset();
      toggleDirectorSchoolSelect();
      window.EkoAPI.showToast(res.message || 'Akkaunt yaratildi.', 'success');
      await loadAdminData();
    } catch (err) {
      showFormAlert(userFormAlert, err.message || "Akkaunt yaratib bo'lmadi.");
    } finally {
      createUserBtn.disabled = false;
      createUserBtn.textContent = 'Akkaunt yaratish';
    }
  });

  createSchoolForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormAlert(schoolFormAlert);

    const name = document.getElementById('school-name').value.trim();
    const district = document.getElementById('school-district').value.trim();
    const address = document.getElementById('school-address').value.trim();
    const ecoFocus = document.getElementById('school-focus').value.trim();
    const file = schoolImageFileInput.files && schoolImageFileInput.files[0];

    if (!name || !district) {
      showFormAlert(schoolFormAlert, 'Maktab nomi va tumani kiritilishi shart.');
      return;
    }

    createSchoolBtn.disabled = true;
    createSchoolBtn.textContent = "Qo'shilmoqda...";

    try {
      const imageDataUrl = file ? await window.EkoAPI.readImageFileAsDataUrl(file) : '';
      const res = await window.EkoAPI.request('/schools', {
        method: 'POST',
        body: JSON.stringify({ name, district, address, ecoFocus, imageDataUrl }),
      });

      createSchoolForm.reset();
      window.EkoAPI.showToast(res.message || "Maktab qo'shildi.", 'success');
      await loadAdminData();
    } catch (err) {
      showFormAlert(schoolFormAlert, err.message || "Maktab qo'shishda xatolik.");
    } finally {
      createSchoolBtn.disabled = false;
      createSchoolBtn.textContent = "Maktab qo'shish";
    }
  });

  async function init() {
    currentUser = await window.EkoAPI.verifySession({ requireAdmin: true });
    if (!currentUser) return;

    newUserRoleSelect.addEventListener('change', toggleDirectorSchoolSelect);
    requestsFilter.addEventListener('change', renderRequestsTable);
    userSearchInput.addEventListener('input', renderUsersTable);
    schoolSearchInput.addEventListener('input', renderSchoolsTable);
    ratingSearchInput.addEventListener('input', renderRatingsTable);

    toggleDirectorSchoolSelect();
    await loadAdminData();
  }

  init();
})();
