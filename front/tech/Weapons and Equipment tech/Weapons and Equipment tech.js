// ── Weapons and Equipment - JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

  // ── Mobile Menu Toggle ──
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });
  }

  // ── 카테고리 정보 ──
  const categoryInfo = {
    melee:     { title: '근접 무기',      files: ['gladius', 'katana', 'longsword', 'pilum'] },
    ranged:    { title: '원거리 무기',    files: ['english longbow', 'crossbow', 'yumi'] },
    firearms:  { title: '화기',          files: ['ak-47', 'm16', 'stg44', 'bar m1918'] },
    artillery: { title: '포병 / 폭발물', files: ['katyusha', 'm101 howitzer', 'v-2 rocket'] },
    armor:     { title: '기갑 / 차량',   files: ['m4 sherman', 'tiger i', 't-34'] },
    aircraft:  { title: '항공기',        files: ['p-51 mustang', 'spitfire', 'bf109'] },
    naval:     { title: '함선',          files: ['geobukseon', 'hms dreadnought', 'type vii u-boat'] },
    defense:   { title: '방어 장비',     files: ['plate armor', 'roman scutum', 'samurai armor'] }
  };

  // ── 페이지 상단 건수 렌더링 ──
  const pageWeaponCountEl = document.getElementById('pageWeaponCount');
  if (pageWeaponCountEl) {
    let total = 0;
    Object.keys(categoryInfo).forEach(cat => { total += categoryInfo[cat].files.length; });
    pageWeaponCountEl.textContent = total;
  }

  const eraLabels = {
    ancient: '고대', medieval: '중세', earlymodern: '근세',
    modern: '근대', worldwar: '세계대전', contemporary: '현대'
  };

  // ── 전체 아이템 데이터 로드 ──
  let allItems = [];
  let dataLoaded = false;

  function loadAllItems() {
    if (dataLoaded) return Promise.resolve(allItems);

    const promises = [];
    Object.keys(categoryInfo).forEach(cat => {
      categoryInfo[cat].files.forEach(file => {
        const path = '../../../back/data/weapons and equipment data/' + cat + '/' + file + '.json';
        promises.push(
          fetch(path)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data) {
                data._fileId = cat + '/' + file;
                return data;
              }
              return null;
            })
            .catch(() => null)
        );
      });
    });

    return Promise.all(promises).then(results => {
      allItems = results.filter(Boolean);
      dataLoaded = true;
      return allItems;
    });
  }

  // XSS 방지
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── Search Filter ──
  const weaponCards = document.querySelectorAll('.weapon-category-card');
  const searchInput = document.getElementById('weaponSearch');
  const searchResultsEl = document.getElementById('searchResults');
  const searchResultsGrid = document.getElementById('searchResultsGrid');
  const searchResultCount = document.getElementById('searchResultCount');
  const mainContent = document.querySelector('.weapons-content');

  let searchQuery = '';
  let searchTimer = null;

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim().toLowerCase();

      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (!searchQuery) {
          // 검색어 없으면 원래 카테고리 표시
          searchResultsEl.style.display = 'none';
          mainContent.style.display = '';
          return;
        }

        // 카테고리 카드 필터링 (기존)
        filterCards();

        // JSON 데이터 기반 검색
        loadAllItems().then(items => {
          const results = items.filter(item => {
            const texts = [
              (item.name || ''),
              (item.nameEn || ''),
              (item.origin || ''),
              (Array.isArray(item.tags) ? item.tags.join(' ') : '')
            ].join(' ').toLowerCase();
            return texts.includes(searchQuery);
          });

          if (results.length > 0) {
            mainContent.style.display = 'none';
            searchResultsEl.style.display = 'block';
            searchResultCount.textContent = '(' + results.length + '건)';

            searchResultsGrid.innerHTML = results.map(item => {
              const href = 'Weapons and Equipment item.html?id=' + encodeURIComponent(item._fileId);
              const eraText = eraLabels[item.era] || item.era || '';
              const catText = categoryInfo[item.category] ? categoryInfo[item.category].title : '';
              const imgSrc = item.image || '';

              return '<a class="search-result-card" href="' + href + '">' +
                (imgSrc ? '<div class="sr-image"><img src="' + escapeHTML(imgSrc) + '" alt=""></div>' : '') +
                '<div class="sr-body">' +
                  '<div class="sr-name">' + escapeHTML(item.name) + '</div>' +
                  '<div class="sr-name-en">' + escapeHTML(item.nameEn) + '</div>' +
                  '<div class="sr-meta">' +
                    '<span class="sr-badge">' + escapeHTML(catText) + '</span>' +
                    '<span class="sr-badge">' + escapeHTML(eraText) + '</span>' +
                    (item.origin ? '<span class="sr-badge">' + escapeHTML(item.origin) + '</span>' : '') +
                  '</div>' +
                '</div>' +
              '</a>';
            }).join('');
          } else {
            mainContent.style.display = 'none';
            searchResultsEl.style.display = 'block';
            searchResultCount.textContent = '(0건)';
            searchResultsGrid.innerHTML = '<p class="search-no-result">검색 결과가 없습니다.</p>';
          }
        });
      }, 300);
    });
  }

  function filterCards() {
    weaponCards.forEach(card => {
      const cardText = card.textContent.toLowerCase();
      const matchSearch = !searchQuery || cardText.includes(searchQuery);

      if (matchSearch) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  }

  // ── 카테고리 카드 건수 렌더링 ──
  weaponCards.forEach(card => {
    const cat = card.dataset.category;
    if (cat && categoryInfo[cat]) {
      const countEl = card.querySelector('.wc-count');
      if (countEl) {
        countEl.textContent = categoryInfo[cat].files.length + '건';
      }
    }
  });

  // ── Fade-in Animation on Scroll ──
  const fadeElements = document.querySelectorAll('.category-section, .weapon-category-card, .era-card');

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -40px 0px',
    threshold: 0.1
  };

  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        fadeObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    fadeObserver.observe(el);
  });

});
