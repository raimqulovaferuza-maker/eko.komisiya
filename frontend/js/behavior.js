(function () {
  const kpiTotal = document.getElementById('kpi-behavior-total');
  const kpiTeachers = document.getElementById('kpi-behavior-teachers');
  const kpiStudents = document.getElementById('kpi-behavior-students');
  const kpiAvg = document.getElementById('kpi-behavior-avg');

  const searchInput = document.getElementById('behavior-search');
  const schoolFilter = document.getElementById('behavior-school-filter');
  const statusFilter = document.getElementById('behavior-status-filter');
  const typeButtons = Array.from(document.querySelectorAll('[data-type-filter]'));

  const formTitle = document.getElementById('behavior-form-title');
  const formSubtitle = document.getElementById('behavior-form-subtitle');
  const behaviorForm = document.getElementById('behavior-form');
  const formAlert = document.getElementById('behavior-form-alert');
  const behSchoolSelect = document.getElementById('beh-school');
  const behTypeSelect = document.getElementById('beh-type');
  const behNameInput = document.getElementById('beh-name');
  const behClassSubjectInput = document.getElementById('beh-class-subject');
  const behStatusSelect = document.getElementById('beh-status');
  const behScoreSelect = document.getElementById('beh-score');
  const behDateInput = document.getElementById('beh-date');
  const behNoteInput = document.getElementById('beh-note');
  const submitBtn = document.getElementById('behavior-submit-btn');
  const cancelEditBtn = document.getElementById('behavior-cancel-edit-btn');

  const listCountEl = document.getElementById('behavior-list-count');
  const tableBody = document.getElementById('behavior-table-body');

  const confirmModal = document.getElementById('confirm-modal');
  const confirmModalTitle = document.getElementById('confirm-modal-title');
  const confirmModalDesc = document.getElementById('confirm-modal-desc');
  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  const confirmAcceptBtn = document.getElementById('confirm-accept-btn');

  let currentUser = null;
  let allSchools = [];
  let allRecords = [];
  let summary = { totalRecords: 0, teacherCount: 0, studentCount: 0, avgScore: 0 };
  let activeTypeFilter = 'all';
  let editingId = null;
  let pendingDeleteAction = null;

  const STATUS_META = {
    excellent: { label: "A'lo", cls: 'behavior-status-excellent' },
    good: { label: 'Yaxshi', cls: 'behavior-status-good' },
    satisfactory: { label: 'Qoniqarli', cls: 'behavior-status-satisfactory' },
    needs_attention: { label: "E'tibor talab", cls: 'behavior-status-needs_attention' },
  };

  function getTodayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function showFormAlert(message) {
    formAlert.textContent = message;
    formAlert.hidden = false;
  }

  function hideFormAlert() {
    formAlert.textContent = '';
    formAlert.hidden = true;
  }

  function openConfirmModal(title, description, onConfirm) {
    confirmModalTitle.textContent = title;
    confirmModalDesc.textContent = description;
    pendingDeleteAction = onConfirm;
    confirmModal.hidden = false;
    confirmAcceptBtn.focus();
  }

  function closeConfirmModal() {
    confirmModal.hidden = true;
    pendingDeleteAction = null;
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
    if (!pendingDeleteAction) return;
    confirmAcceptBtn.disabled = true;
    confirmAcceptBtn.textContent = "O'chirilmoqda...";
    try {
      await pendingDeleteAction();
      closeConfirmModal();
    } catch {
      confirmAcceptBtn.disabled = false;
      confirmAcceptBtn.textContent = "O'chirish";
    }
  });

  function updateKpis() {
    kpiTotal.textContent = String(summary.totalRecords ?? 0);
    kpiTeachers.textContent = String(summary.teacherCount ?? 0);
    kpiStudents.textContent = String(summary.studentCount ?? 0);
    kpiAvg.textContent = summary.totalRecords > 0 ? Number(summary.avgScore || 0).toFixed(2) : '0.00';
  }

  function populateSchoolSelectors(preselectedSchoolId) {
    const esc = window.EkoAPI.escapeHtml;
    const prevFilter = schoolFilter.value;
    const prevFormSchool = behSchoolSelect.value;

    const filterOptions = allSchools
      .map((s) => `<option value="${s.id}">${esc(s.name)} (${esc(s.district)})</option>`)
      .join('');
    schoolFilter.innerHTML = `<option value="all">Barcha maktablar</option>${filterOptions}`;

    if (preselectedSchoolId && allSchools.some((s) => String(s.id) === String(preselectedSchoolId))) {
      schoolFilter.value = String(preselectedSchoolId);
    } else if (prevFilter && prevFilter !== 'all') {
      schoolFilter.value = prevFilter;
    }

    const isDirectorScoped = currentUser?.role === 'director' && currentUser?.schoolId;
    if (isDirectorScoped) {
      const ownSchool = allSchools.find((s) => Number(s.id) === Number(currentUser.schoolId));
      behSchoolSelect.innerHTML = ownSchool
        ? `<option value="${ownSchool.id}">${esc(ownSchool.name)} (${esc(ownSchool.district)})</option>`
        : '<option value="">Biriktirilgan maktab</option>';
      behSchoolSelect.value = ownSchool ? String(ownSchool.id) : '';
      behSchoolSelect.disabled = true;
    } else {
      behSchoolSelect.innerHTML = `<option value="">Maktab tanlang</option>${filterOptions}`;
      behSchoolSelect.disabled = false;
      if (preselectedSchoolId && allSchools.some((s) => String(s.id) === String(preselectedSchoolId))) {
        behSchoolSelect.value = String(preselectedSchoolId);
      } else if (prevFormSchool && allSchools.some((s) => String(s.id) === prevFormSchool)) {
        behSchoolSelect.value = prevFormSchool;
      } else if (allSchools.length > 0 && !behSchoolSelect.value) {
        behSchoolSelect.value = String(allSchools[0].id);
      }
    }
  }

  function resetFormToCreate() {
    editingId = null;
    hideFormAlert();
    behaviorForm.reset();
    behDateInput.value = getTodayIso();
    behScoreSelect.value = '5';
    behStatusSelect.value = 'excellent';
    behTypeSelect.value = 'teacher';

    if (currentUser?.role === 'director' && currentUser?.schoolId) {
      behSchoolSelect.value = String(currentUser.schoolId);
      behSchoolSelect.disabled = true;
    } else {
      behSchoolSelect.disabled = false;
      const filterVal = schoolFilter.value;
      if (filterVal && filterVal !== 'all') {
        behSchoolSelect.value = filterVal;
      } else if (allSchools.length > 0) {
        behSchoolSelect.value = String(allSchools[0].id);
      }
    }

    formTitle.textContent = 'Xulq-atvor belgilash';
    formSubtitle.textContent = "Ustoz yoki o'quvchi uchun ekologik xulq-atvor bahosini kiriting.";
    submitBtn.textContent = 'Xulq-atvorni saqlash';
    cancelEditBtn.hidden = true;
  }

  function startEditingRecord(rec) {
    editingId = rec.id;
    hideFormAlert();
    behSchoolSelect.value = String(rec.schoolId);
    behSchoolSelect.disabled = true;
    behTypeSelect.value = rec.personType;
    behNameInput.value = rec.personName;
    behClassSubjectInput.value = rec.classOrSubject || '';
    behStatusSelect.value = rec.behaviorStatus;
    behScoreSelect.value = String(rec.ecoScore);
    behDateInput.value = rec.recordedAt || getTodayIso();
    behNoteInput.value = rec.note || '';

    formTitle.textContent = "Xulq-atvor yozuvini tahrirlash";
    formSubtitle.textContent = `${rec.personName} ma'lumotlarini yangilang.`;
    submitBtn.textContent = "O'zgarishlarni saqlash";
    cancelEditBtn.hidden = false;
    behNameInput.focus();
  }

  function getFilteredRecords() {
    const query = searchInput.value.trim().toLowerCase();
    const schoolVal = schoolFilter.value;
    const statusVal = statusFilter.value;

    return allRecords.filter((rec) => {
      if (activeTypeFilter !== 'all' && rec.personType !== activeTypeFilter) return false;
      if (schoolVal !== 'all' && String(rec.schoolId) !== schoolVal) return false;
      if (statusVal !== 'all' && rec.behaviorStatus !== statusVal) return false;
      if (
        query &&
        !rec.personName.toLowerCase().includes(query) &&
        !(rec.classOrSubject || '').toLowerCase().includes(query) &&
        !(rec.schoolName || '').toLowerCase().includes(query) &&
        !(rec.note || '').toLowerCase().includes(query)
      ) {
        return false;
      }
      return true;
    });
  }

  function renderBehaviorTable() {
    const filtered = getFilteredRecords();
    const esc = window.EkoAPI.escapeHtml;

    listCountEl.textContent = `${filtered.length} ta yozuv ko'rsatilmoqda`;

    if (filtered.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="6">Tanlangan mezonlar bo\'yicha xulq-atvor yozuvlari topilmadi.</td></tr>';
      return;
    }

    tableBody.innerHTML = filtered
      .map((rec) => {
        const typeHtml =
          rec.personType === 'teacher'
            ? '<span class="behavior-type-teacher">Ustoz</span>'
            : '<span class="behavior-type-student">O\'quvchi</span>';
        const st = STATUS_META[rec.behaviorStatus] || STATUS_META.good;
        const subMeta = [rec.classOrSubject, rec.note].filter(Boolean).join(' · ');

        const actionsHtml = rec.canEdit
          ? `
            <div class="action-row">
              <button
                type="button"
                class="btn btn-ghost btn-sm edit-behavior-btn"
                data-behavior-id="${rec.id}"
                aria-label="${esc(rec.personName)} xulq-atvorini tahrirlash"
              >
                Tahrirlash
              </button>
              <button
                type="button"
                class="btn btn-danger btn-sm delete-behavior-btn"
                data-behavior-id="${rec.id}"
                data-person-name="${esc(rec.personName)}"
                aria-label="${esc(rec.personName)} yozuvini o'chirish"
              >
                O'chirish
              </button>
            </div>
          `
          : `<span class="cell-sub">${esc(rec.recordedByName)}</span>`;

        return `
          <tr>
            <td data-label="Shaxs">
              <div class="cell-primary">${esc(rec.personName)}</div>
              ${subMeta ? `<div class="cell-sub">${esc(subMeta)}</div>` : ''}
            </td>
            <td data-label="Toifa">${typeHtml}</td>
            <td data-label="Maktab">
              <a href="/school.html?id=${rec.schoolId}" class="cell-primary">${esc(rec.schoolName)}</a>
            </td>
            <td data-label="Holat / Ball">
              <span class="${st.cls}">${st.label}</span>
              <span class="cell-sub tabular-nums"> · ${rec.ecoScore}/5</span>
            </td>
            <td data-label="Sana" class="tabular-nums date-cell">${esc(rec.recordedAt)}</td>
            <td data-label="Amal" class="num-col">${actionsHtml}</td>
          </tr>
        `;
      })
      .join('');

    tableBody.querySelectorAll('.edit-behavior-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.behaviorId);
        const rec = allRecords.find((r) => r.id === id);
        if (rec) startEditingRecord(rec);
      });
    });

    tableBody.querySelectorAll('.delete-behavior-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.behaviorId);
        const name = btn.dataset.personName;
        openConfirmModal(
          "Xulq-atvor yozuvini o'chirish",
          `"${name}" uchun kiritilgan xulq-atvor yozuvini o'chirishni tasdiqlaysizmi?`,
          async () => {
            try {
              const res = await window.EkoAPI.request(`/behavior/${id}`, { method: 'DELETE' });
              window.EkoAPI.showToast(res.message || "Yozuv o'chirildi.", 'success');
              if (editingId === id) {
                resetFormToCreate();
              }
              await loadBehaviorData();
            } catch (err) {
              window.EkoAPI.showToast(err.message || "O'chirishda xatolik.", 'error');
              throw err;
            }
          }
        );
      });
    });
  }

  async function loadBehaviorData(preselectedSchoolId = null) {
    try {
      const [schoolsRes, behaviorRes] = await Promise.all([
        window.EkoAPI.request('/schools'),
        window.EkoAPI.request('/behavior'),
      ]);

      allSchools = schoolsRes.schools || [];
      allRecords = behaviorRes.records || [];
      summary = behaviorRes.summary || summary;

      updateKpis();
      populateSchoolSelectors(preselectedSchoolId);
      renderBehaviorTable();
    } catch (err) {
      window.EkoAPI.showToast(err.message || "Ma'lumotlarni yuklashda xatolik.", 'error');
    }
  }

  typeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTypeFilter = btn.dataset.typeFilter || 'all';
      typeButtons.forEach((b) => b.classList.toggle('active', b === btn));
      renderBehaviorTable();
    });
  });

  searchInput.addEventListener('input', renderBehaviorTable);
  schoolFilter.addEventListener('change', renderBehaviorTable);
  statusFilter.addEventListener('change', renderBehaviorTable);
  cancelEditBtn.addEventListener('click', resetFormToCreate);

  behaviorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormAlert();

    const payload = {
      schoolId: Number(behSchoolSelect.value),
      personType: behTypeSelect.value,
      personName: behNameInput.value.trim(),
      classOrSubject: behClassSubjectInput.value.trim(),
      behaviorStatus: behStatusSelect.value,
      ecoScore: Number(behScoreSelect.value),
      recordedAt: behDateInput.value,
      note: behNoteInput.value.trim(),
    };

    if (!payload.schoolId || !payload.personName) {
      showFormAlert("Maktab va shaxsning to'liq ismi kiritilishi shart.");
      return;
    }

    submitBtn.disabled = true;
    const prevText = submitBtn.textContent;
    submitBtn.textContent = 'Saqlanmoqda...';

    try {
      if (editingId) {
        const res = await window.EkoAPI.request(`/behavior/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        window.EkoAPI.showToast(res.message || "Xulq-atvor yangilandi.", 'success');
      } else {
        const res = await window.EkoAPI.request('/behavior', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        window.EkoAPI.showToast(res.message || 'Xulq-atvor saqlandi.', 'success');
      }

      resetFormToCreate();
      await loadBehaviorData();
    } catch (err) {
      showFormAlert(err.message || "Xulq-atvorni saqlab bo'lmadi.");
    } finally {
      submitBtn.disabled = false;
      if (submitBtn.textContent === 'Saqlanmoqda...') {
        submitBtn.textContent = prevText;
      }
    }
  });

  async function init() {
    currentUser = await window.EkoAPI.verifySession();
    if (!currentUser) return;

    behDateInput.value = getTodayIso();
    const params = new URLSearchParams(window.location.search);
    const urlSchoolId = params.get('schoolId');

    await loadBehaviorData(urlSchoolId);
  }

  init();
})();
