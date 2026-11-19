(function () {
  const schoolsGrid = document.getElementById('schools-grid');
  const searchInput = document.getElementById('search-input');
  const districtFilter = document.getElementById('district-filter');
  const statusFilter = document.getElementById('status-filter');

  const kpiTotalSchools = document.getElementById('kpi-total-schools');
  const kpiAvgRating = document.getElementById('kpi-avg-rating');
  const kpiTotalVotes = document.getElementById('kpi-total-votes');
  const kpiUserRated = document.getElementById('kpi-user-rated');

  let currentUser = null;
  let allSchools = [];
  let votingSchoolIds = new Set();

  function starSvg(filled) {
    return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  }

  function updateKpis(summary) {
    kpiTotalSchools.textContent = String(summary.totalSchools ?? 0);
    kpiAvgRating.textContent = summary.overallAvg > 0 ? summary.overallAvg.toFixed(2) : '0.00';
    kpiTotalVotes.textContent = String(summary.totalVotes ?? 0);
    kpiUserRated.textContent = `${summary.ratedByUser ?? 0} / ${summary.totalSchools ?? 0}`;
  }

  function populateDistricts(districts) {
    const current = districtFilter.value;
    districtFilter.innerHTML = '<option value="all">Barcha tumanlar</option>';
    districts.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      districtFilter.appendChild(opt);
    });
    if (districts.includes(current)) {
      districtFilter.value = current;
    }
  }

  function getFilteredSchools() {
    const query = searchInput.value.trim().toLowerCase();
    const district = districtFilter.value;
    const status = statusFilter.value;

    return allSchools.filter((school) => {
      const matchesDistrict = district === 'all' || school.district === district;
      const matchesStatus =
        status === 'all' ||
        (status === 'rated' && school.hasRated) ||
        (status === 'unrated' && !school.hasRated);
      const matchesQuery =
        !query ||
        school.name.toLowerCase().includes(query) ||
        school.district.toLowerCase().includes(query) ||
        school.ecoFocus.toLowerCase().includes(query) ||
        school.address.toLowerCase().includes(query);

      return matchesDistrict && matchesStatus && matchesQuery;
    });
  }

  function renderSchools() {
    const list = getFilteredSchools();
    const isAdmin = currentUser?.role === 'admin';

    if (list.length === 0) {
      const hasFilters =
        searchInput.value.trim() !== '' ||
        districtFilter.value !== 'all' ||
        statusFilter.value !== 'all';

      schoolsGrid.innerHTML = `
        <div class="state-panel glass-panel" style="grid-column: 1 / -1;">
          <h2 class="state-title">Maktablar topilmadi</h2>
          <p class="state-desc">
            ${
              hasFilters
                ? "Qidiruv yoki filtr shartlariga mos keladigan maktab yo'q."
                : "Hozircha tizimga birorta maktab qo'shilmagan."
            }
          </p>
          ${
            hasFilters
              ? '<button type="button" id="reset-filters-btn" class="btn btn-ghost btn-sm">Filtrlarni tozalash</button>'
              : ''
          }
        </div>
      `;

      const resetBtn = document.getElementById('reset-filters-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          searchInput.value = '';
          districtFilter.value = 'all';
          statusFilter.value = 'all';
          renderSchools();
        });
      }
      return;
    }

    const esc = window.EkoAPI.escapeHtml;

    schoolsGrid.innerHTML = list
      .map((school) => {
        const displayScore = school.ratingsCount > 0 ? school.avgRating.toFixed(2) : '0.00';
        const activeStarThreshold = school.hasRated
          ? school.userRating
          : Math.round(school.avgRating);
        const isSubmitting = votingSchoolIds.has(school.id);
        const isLocked = school.hasRated && !isAdmin;

        const starsHtml = [1, 2, 3, 4, 5]
          .map((star) => {
            const isFilled = star <= activeStarThreshold;
            const label = isLocked
              ? `${esc(school.name)}: sizning bahongiz ${school.userRating} yulduz`
              : school.hasRated && isAdmin
                ? `${esc(school.name)} bahosini ${star} yulduzga o'zgartirish`
                : `${esc(school.name)} uchun ${star} yulduz berish`;
            return `
              <button
                type="button"
                class="star-btn ${isFilled ? 'filled' : ''}"
                data-school-id="${school.id}"
                data-rating="${star}"
                aria-label="${label}"
                ${isLocked || isSubmitting ? 'disabled' : ''}
              >
                ${starSvg(isFilled)}
              </button>
            `;
          })
          .join('');

        const voteStatus = school.hasRated
          ? `<span class="vote-status-text voted">${
              isAdmin ? `Siz: ${school.userRating}/5 · O'zgartiring` : `Siz: ${school.userRating}/5`
            }</span>`
          : `<span class="vote-status-text">${isSubmitting ? 'Saqlanmoqda...' : 'Baho bering'}</span>`;

        const coverHtml = school.imageUrl
          ? `
            <div class="school-cover">
              <img
                src="${esc(school.imageUrl)}"
                alt="${esc(school.name)} rasmi"
                class="school-cover-img"
                referrerpolicy="no-referrer"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
              />
              <div class="school-cover-fallback" style="display: none;">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 21v-6h6v6" />
                </svg>
                <span>Maktab rasmi</span>
              </div>
            </div>
          `
          : `
            <div class="school-cover">
              <div class="school-cover-fallback">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M9 21v-6h6v6" />
                </svg>
                <span>${esc(school.district)}</span>
              </div>
            </div>
          `;

        const directorHtml = school.directorName
          ? `<p class="school-director-line">Direktor: ${esc(school.directorName)}</p>`
          : '';

        return `
          <article class="school-card glass-card" data-school-card="${school.id}">
            <div>
              <a href="/school.html?id=${school.id}" aria-label="${esc(school.name)} sahifasiga o'tish">
                ${coverHtml}
              </a>
              <div class="school-meta">
                <span>${esc(school.district)}</span>
                <span aria-hidden="true">·</span>
                <span class="tabular-nums">${school.ratingsCount} ta ovoz</span>
                <span aria-hidden="true">·</span>
                <span class="tabular-nums">${school.eventsCount || 0} ta tadbir</span>
              </div>
              <h2 class="school-name">
                <a href="/school.html?id=${school.id}">${esc(school.name)}</a>
              </h2>
              <p class="school-focus">${esc(school.ecoFocus)}</p>
              <p class="school-address">${esc(school.address)}</p>
              ${directorHtml}
            </div>

            <div class="school-rating-footer">
              <div class="rating-summary-row">
                <div class="rating-score">
                  <span class="rating-avg tabular-nums">${displayScore}</span>
                  <span class="rating-out-of tabular-nums">/ 5.0</span>
                </div>
                <span class="rating-votes">${school.hasRated ? 'Baholangan' : 'Ovoz berilmagan'}</span>
              </div>

              <div class="star-row">
                <div class="star-group" data-star-group="${school.id}" role="group" aria-label="${esc(school.name)} yulduzcha bahosi">
                  ${starsHtml}
                </div>
                ${voteStatus}
              </div>

              <div class="school-card-actions">
                <a href="/school.html?id=${school.id}" class="school-detail-link">
                  Maktab sahifasi va tadbirlar →
                </a>
              </div>
            </div>
          </article>
        `;
      })
      .join('');

    attachStarHandlers();
  }

  function attachStarHandlers() {
    const groups = schoolsGrid.querySelectorAll('[data-star-group]');
    groups.forEach((group) => {
      const buttons = Array.from(group.querySelectorAll('.star-btn:not(:disabled)'));
      if (buttons.length === 0) return;

      buttons.forEach((btn) => {
        const starVal = Number(btn.dataset.rating);

        btn.addEventListener('mouseenter', () => {
          buttons.forEach((b) => {
            const v = Number(b.dataset.rating);
            b.classList.toggle('preview', v <= starVal);
          });
        });

        btn.addEventListener('mouseleave', () => {
          buttons.forEach((b) => b.classList.remove('preview'));
        });

        btn.addEventListener('click', () => {
          const schoolId = Number(btn.dataset.schoolId);
          submitRating(schoolId, starVal);
        });
      });
    });
  }

  async function submitRating(schoolId, rating) {
    if (votingSchoolIds.has(schoolId)) return;
    votingSchoolIds.add(schoolId);
    renderSchools();

    try {
      const res = await window.EkoAPI.request(`/schools/${schoolId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating }),
      });

      window.EkoAPI.showToast(res.message || 'Bahoyingiz saqlandi.', 'success');
      await loadSchools();
    } catch (err) {
      window.EkoAPI.showToast(err.message || 'Baholashda xatolik yuz berdi.', 'error');
    } finally {
      votingSchoolIds.delete(schoolId);
      renderSchools();
    }
  }

  async function loadSchools() {
    try {
      const data = await window.EkoAPI.request('/schools');
      allSchools = data.schools || [];
      populateDistricts(data.districts || []);
      updateKpis(data.summary || {});
      renderSchools();
    } catch (err) {
      schoolsGrid.innerHTML = `
        <div class="state-panel glass-panel" style="grid-column: 1 / -1;">
          <h2 class="state-title">Ma'lumotlarni yuklab bo'lmadi</h2>
          <p class="state-desc">${window.EkoAPI.escapeHtml(err.message)}</p>
          <button type="button" id="retry-schools-btn" class="btn btn-primary btn-sm">Qayta urinish</button>
        </div>
      `;
      const retryBtn = document.getElementById('retry-schools-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', loadSchools);
      }
    }
  }

  async function init() {
    const user = await window.EkoAPI.verifySession();
    if (!user) return;
    currentUser = user;

    searchInput.addEventListener('input', renderSchools);
    districtFilter.addEventListener('change', renderSchools);
    statusFilter.addEventListener('change', renderSchools);

    await loadSchools();
  }

  init();
})();
