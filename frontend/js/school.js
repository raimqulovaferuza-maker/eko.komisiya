(function () {
  const heroContainer = document.getElementById('school-hero-container');
  const manageSection = document.getElementById('school-manage-section');
  const eventsGrid = document.getElementById('events-grid');
  const eventsCountLabel = document.getElementById('events-count-label');

  const schoolImageForm = document.getElementById('school-image-form');
  const schoolCoverFile = document.getElementById('school-cover-file');
  const schoolCoverUrl = document.getElementById('school-cover-url');
  const imageFormAlert = document.getElementById('image-form-alert');
  const saveImageBtn = document.getElementById('save-school-image-btn');

  const createEventForm = document.getElementById('create-event-form');
  const eventTitleInput = document.getElementById('event-title');
  const eventDateInput = document.getElementById('event-date');
  const eventDescInput = document.getElementById('event-description');
  const eventImageFile = document.getElementById('event-image-file');
  const eventFormAlert = document.getElementById('event-form-alert');
  const createEventBtn = document.getElementById('create-event-btn');

  const confirmModal = document.getElementById('confirm-modal');
  const confirmModalTitle = document.getElementById('confirm-modal-title');
  const confirmModalDesc = document.getElementById('confirm-modal-desc');
  const confirmCancelBtn = document.getElementById('confirm-cancel-btn');
  const confirmAcceptBtn = document.getElementById('confirm-accept-btn');

  const params = new URLSearchParams(window.location.search);
  const schoolId = Number(params.get('id'));

  let currentUser = null;
  let schoolData = null;
  let eventsList = [];
  let behaviorsList = [];
  let canManage = false;
  let isVoting = false;
  let pendingConfirmAction = null;

  const schoolBehaviorLink = document.getElementById('school-behavior-link');
  const schoolBehaviorsList = document.getElementById('school-behaviors-list');

  function showFormAlert(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  function hideFormAlert(el) {
    el.textContent = '';
    el.hidden = true;
  }

  function starSvg(filled) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
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
    if (event.target === confirmModal) closeConfirmModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !confirmModal.hidden) closeConfirmModal();
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

  function renderHero() {
    if (!schoolData) return;
    const esc = window.EkoAPI.escapeHtml;
    const isAdmin = currentUser?.role === 'admin';
    const isLocked = schoolData.hasRated && !isAdmin;
    const displayScore = schoolData.ratingsCount > 0 ? schoolData.avgRating.toFixed(2) : '0.00';
    const activeThreshold = schoolData.hasRated
      ? schoolData.userRating
      : Math.round(schoolData.avgRating);

    document.title = `${schoolData.name} — Eko Komisiya`;

    const mediaHtml = schoolData.imageUrl
      ? `
        <img
          src="${esc(schoolData.imageUrl)}"
          alt="${esc(schoolData.name)} rasmi"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
        />
        <div class="school-cover-fallback" style="display: none; min-height: 280px;">
          <span>Rasm yuklanmadi</span>
        </div>
      `
      : `
        <div class="school-cover-fallback" style="min-height: 280px;">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M3 21h18" />
            <path d="M5 21V7l7-4 7 4v14" />
            <path d="M9 21v-6h6v6" />
          </svg>
          <span>Maktab rasmi hali yuklanmagan</span>
        </div>
      `;

    const starsHtml = [1, 2, 3, 4, 5]
      .map((star) => {
        const filled = star <= activeThreshold;
        const label = isLocked
          ? `${esc(schoolData.name)}: sizning bahongiz ${schoolData.userRating} yulduz`
          : schoolData.hasRated && isAdmin
            ? `${esc(schoolData.name)} bahosini ${star} yulduzga o'zgartirish`
            : `${esc(schoolData.name)} uchun ${star} yulduz berish`;
        return `
          <button
            type="button"
            class="star-btn ${filled ? 'filled' : ''}"
            data-rating="${star}"
            aria-label="${label}"
            ${isLocked || isVoting ? 'disabled' : ''}
          >
            ${starSvg(filled)}
          </button>
        `;
      })
      .join('');

    const voteStatus = schoolData.hasRated
      ? `<span class="vote-status-text voted">${
          isAdmin ? `Siz: ${schoolData.userRating}/5 · O'zgartiring` : `Siz: ${schoolData.userRating}/5`
        }</span>`
      : `<span class="vote-status-text">${isVoting ? 'Saqlanmoqda...' : 'Baho bering'}</span>`;

    heroContainer.innerHTML = `
      <article class="school-hero-card glass-panel-strong glass-accent-top">
        <div class="school-hero-media">
          ${mediaHtml}
        </div>

        <div class="school-hero-info">
          <div>
            <div class="school-meta">
              <span>${esc(schoolData.district)}</span>
              <span aria-hidden="true">·</span>
              <span class="tabular-nums">${schoolData.ratingsCount} ta ovoz</span>
              <span aria-hidden="true">·</span>
              <span class="tabular-nums">${eventsList.length} ta tadbir</span>
            </div>

            <h1 class="page-title">${esc(schoolData.name)}</h1>
            <p class="school-focus" style="margin-top: 10px;">${esc(schoolData.ecoFocus)}</p>
            <p class="school-address">${esc(schoolData.address)}</p>
            ${
              schoolData.directorName
                ? `<p class="school-director-line" style="margin-top: 10px;">Maktab direktori: ${esc(schoolData.directorName)}</p>`
                : `<p class="school-address" style="margin-top: 10px;">Direktor hali biriktirilmagan</p>`
            }
          </div>

          <div class="school-rating-footer">
            <div class="rating-summary-row">
              <div class="rating-score">
                <span class="rating-avg tabular-nums">${displayScore}</span>
                <span class="rating-out-of tabular-nums">/ 5.0</span>
              </div>
              <span class="rating-votes">${schoolData.hasRated ? 'Baholangan' : 'Ovoz berilmagan'}</span>
            </div>

            <div class="star-row">
              <div class="star-group" id="detail-star-group" role="group" aria-label="${esc(schoolData.name)} yulduzcha bahosi">
                ${starsHtml}
              </div>
              ${voteStatus}
            </div>
          </div>
        </div>
      </article>
    `;

    const starBtns = Array.from(heroContainer.querySelectorAll('.star-btn:not(:disabled)'));
    starBtns.forEach((btn) => {
      const val = Number(btn.dataset.rating);
      btn.addEventListener('mouseenter', () => {
        starBtns.forEach((b) => b.classList.toggle('preview', Number(b.dataset.rating) <= val));
      });
      btn.addEventListener('mouseleave', () => {
        starBtns.forEach((b) => b.classList.remove('preview'));
      });
      btn.addEventListener('click', () => submitRating(val));
    });
  }

  function renderEvents() {
    const esc = window.EkoAPI.escapeHtml;
    eventsCountLabel.textContent = `${eventsList.length} ta tadbir`;

    if (eventsList.length === 0) {
      eventsGrid.innerHTML = `
        <div class="state-panel glass-panel" style="grid-column: 1 / -1;">
          <h3 class="state-title">Hozircha tadbirlar kiritilmagan</h3>
          <p class="state-desc">
            ${
              canManage
                ? "Yuqoridagi shakl orqali ushbu maktabning ilk ekologik tadbirini e'lon qilishingiz mumkin."
                : "Ushbu maktabda o'tkazilgan tadbirlar hali yoritilmagan."
            }
          </p>
        </div>
      `;
      return;
    }

    eventsGrid.innerHTML = eventsList
      .map((ev) => {
        const roleLabel = ev.authorRole === 'director' ? 'Direktor' : 'Admin';
        const photoHtml = ev.imageUrl
          ? `
            <div class="event-photo-wrap">
              <img
                src="${esc(ev.imageUrl)}"
                alt="${esc(ev.title)} surati"
                referrerpolicy="no-referrer"
              />
            </div>
          `
          : '';

        const deleteBtnHtml = canManage
          ? `
            <button
              type="button"
              class="btn btn-danger btn-sm delete-event-btn"
              data-event-id="${ev.id}"
              data-event-title="${esc(ev.title)}"
              aria-label="${esc(ev.title)} tadbirini o'chirish"
            >
              O'chirish
            </button>
          `
          : '';

        return `
          <article class="event-card glass-panel">
            <div>
              ${photoHtml}
              <div class="school-meta" style="margin-top: ${ev.imageUrl ? '14px' : '0'};">
                <span class="tabular-nums">${esc(ev.eventDate)}</span>
                <span aria-hidden="true">·</span>
                <span>${esc(ev.authorName)} (${roleLabel})</span>
              </div>
              <h3 class="event-title">${esc(ev.title)}</h3>
              <p class="event-desc">${esc(ev.description)}</p>
            </div>

            ${
              deleteBtnHtml
                ? `<div class="event-footer"><span>Tadbir boshqaruvi</span>${deleteBtnHtml}</div>`
                : ''
            }
          </article>
        `;
      })
      .join('');

    eventsGrid.querySelectorAll('.delete-event-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const eventId = Number(btn.dataset.eventId);
        const title = btn.dataset.eventTitle;
        openConfirmModal(
          "Tadbirni o'chirish",
          `"${title}" tadbirini o'chirishni tasdiqlaysizmi?`,
          async () => {
            try {
              const res = await window.EkoAPI.request(`/schools/${schoolId}/events/${eventId}`, {
                method: 'DELETE',
              });
              window.EkoAPI.showToast(res.message || "Tadbir o'chirildi.", 'success');
              await loadSchoolDetails();
            } catch (err) {
              window.EkoAPI.showToast(err.message || "O'chirishda xatolik.", 'error');
              throw err;
            }
          }
        );
      });
    });
  }

  async function submitRating(rating) {
    if (isVoting) return;
    isVoting = true;
    renderHero();
    try {
      const res = await window.EkoAPI.request(`/schools/${schoolId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating }),
      });
      window.EkoAPI.showToast(res.message || 'Bahoyingiz saqlandi.', 'success');
      await loadSchoolDetails();
    } catch (err) {
      window.EkoAPI.showToast(err.message || 'Baholashda xatolik.', 'error');
    } finally {
      isVoting = false;
      renderHero();
    }
  }

  function renderBehaviorsPreview() {
    if (!schoolBehaviorsList) return;
    if (schoolBehaviorLink && schoolData) {
      schoolBehaviorLink.href = `/behavior.html?schoolId=${schoolData.id}`;
    }
    const esc = window.EkoAPI.escapeHtml;
    if (behaviorsList.length === 0) {
      schoolBehaviorsList.innerHTML =
        '<p class="cell-sub">Ushbu maktab uchun hali ustoz yoki o\'quvchi xulq-atvori belgilanmagan.</p>';
      return;
    }
    const statusMap = {
      excellent: 'Namuna',
      good: 'Yaxshi',
      satisfactory: 'Qoniqarli',
      needs_attention: "E'tibor talab",
    };
    schoolBehaviorsList.innerHTML = behaviorsList
      .map((b) => {
        const typeLabel = b.personType === 'teacher' ? 'Ustoz' : "O'quvchi";
        const typeCls = b.personType === 'teacher' ? 'behavior-type-teacher' : 'behavior-type-student';
        const statusLabel = statusMap[b.behaviorStatus] || 'Yaxshi';
        return `
          <div class="activity-row">
            <div>
              <div class="cell-primary">${esc(b.personName)} <span class="${typeCls}">· ${typeLabel}</span></div>
              <div class="cell-sub">${esc(b.classOrSubject)} · ${esc(b.note || statusLabel)}</div>
            </div>
            <div style="text-align: right; flex-shrink: 0;">
              <div class="behavior-status-${esc(b.behaviorStatus)}">${statusLabel} (${b.ecoScore}/5)</div>
              <div class="cell-sub tabular-nums">${esc(b.recordedAt)}</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function loadSchoolDetails() {
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      heroContainer.innerHTML = `
        <div class="state-panel glass-panel">
          <h1 class="state-title">Maktab topilmadi</h1>
          <p class="state-desc">So'ralgan maktab identifikatori noto'g'ri.</p>
          <a href="/schools.html" class="btn btn-primary btn-sm">Maktablarga qaytish</a>
        </div>
      `;
      eventsGrid.innerHTML = '';
      return;
    }

    try {
      const data = await window.EkoAPI.request(`/schools/${schoolId}`);
      schoolData = data.school;
      eventsList = data.events || [];
      behaviorsList = data.behaviors || [];
      canManage = Boolean(data.canManage);
      manageSection.hidden = !canManage;

      renderHero();
      renderEvents();
      renderBehaviorsPreview();
    } catch (err) {
      heroContainer.innerHTML = `
        <div class="state-panel glass-panel">
          <h1 class="state-title">Maktab ma'lumotlari yuklanmadi</h1>
          <p class="state-desc">${window.EkoAPI.escapeHtml(err.message)}</p>
          <a href="/schools.html" class="btn btn-primary btn-sm">Maktablarga qaytish</a>
        </div>
      `;
      eventsGrid.innerHTML = '';
    }
  }

  schoolImageForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormAlert(imageFormAlert);

    const file = schoolCoverFile.files?.[0];
    const urlVal = schoolCoverUrl.value.trim();

    if (!file && !urlVal) {
      showFormAlert(imageFormAlert, 'Rasm fayli tanlang yoki rasm havolasini kiriting.');
      return;
    }

    saveImageBtn.disabled = true;
    saveImageBtn.textContent = 'Yuklanmoqda...';

    try {
      const imageDataUrl = file ? await window.EkoAPI.readImageFileAsDataUrl(file) : '';
      const res = await window.EkoAPI.request(`/schools/${schoolId}/image`, {
        method: 'POST',
        body: JSON.stringify({
          imageDataUrl: imageDataUrl || undefined,
          imageUrl: !imageDataUrl && urlVal ? urlVal : undefined,
        }),
      });

      schoolImageForm.reset();
      window.EkoAPI.showToast(res.message || 'Maktab rasmi yangilandi.', 'success');
      await loadSchoolDetails();
    } catch (err) {
      showFormAlert(imageFormAlert, err.message || 'Rasm yuklashda xatolik.');
    } finally {
      saveImageBtn.disabled = false;
      saveImageBtn.textContent = 'Rasmni saqlash';
    }
  });

  createEventForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideFormAlert(eventFormAlert);

    const title = eventTitleInput.value.trim();
    const eventDate = eventDateInput.value;
    const description = eventDescInput.value.trim();
    const file = eventImageFile.files?.[0];

    if (!title || !description) {
      showFormAlert(eventFormAlert, "Tadbir sarlavhasi va tavsifini to'ldiring.");
      return;
    }

    createEventBtn.disabled = true;
    createEventBtn.textContent = 'Saqlanmoqda...';

    try {
      const imageDataUrl = file ? await window.EkoAPI.readImageFileAsDataUrl(file) : '';
      const res = await window.EkoAPI.request(`/schools/${schoolId}/events`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          eventDate,
          description,
          imageDataUrl: imageDataUrl || undefined,
        }),
      });

      createEventForm.reset();
      eventDateInput.value = new Date().toISOString().slice(0, 10);
      window.EkoAPI.showToast(res.message || "Tadbir e'lon qilindi.", 'success');
      await loadSchoolDetails();
    } catch (err) {
      showFormAlert(eventFormAlert, err.message || "Tadbir qo'shishda xatolik.");
    } finally {
      createEventBtn.disabled = false;
      createEventBtn.textContent = "Tadbirni e'lon qilish";
    }
  });

  async function init() {
    const user = await window.EkoAPI.verifySession();
    if (!user) return;
    currentUser = user;
    eventDateInput.value = new Date().toISOString().slice(0, 10);
    await loadSchoolDetails();
  }

  init();
})();
