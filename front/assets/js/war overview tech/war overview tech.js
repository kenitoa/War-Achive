// ── War Overview - JavaScript ──

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

  // ── Elements ──
  const eraTabs = document.querySelectorAll('.filter-tab');
  const regionFilter = document.getElementById('regionFilter');
  const searchInput = document.getElementById('warSearch');
  const resultCount = document.getElementById('resultCount');
  const warGrid = document.getElementById('warGrid');
  const warTable = document.getElementById('warTable');
  const warTableBody = document.getElementById('warTableBody');
  const viewBtns = document.querySelectorAll('.view-btn');

  let activeEra = 'all';
  let activeRegion = 'all';
  let searchQuery = '';
  let warsData = [];
  let eraLabels = {
    ancient: '고대',
    medieval: '중세',
    earlymodern: '근세',
    modern: '근대',
    worldwar: '세계대전',
    contemporary: '현대'
  };

  // ── 개별 JSON 파일 목록 (로드 순서 = 표시 순서) ──
  const warFiles = [
    'greco persian war',
    'peloponnesian war',
    'punic war',
    'crusades',
    'hundred years war',
    'mongol conquest',
    'imjin war',
    'thirty years war',
    'napoleonic war',
    'american civil war',
    'russo japanese war',
    'crimean war',
    'world war 1',
    'world war 2',
    'korean war',
    'vietnam war',
    'gulf war'
  ];

  // ── Load JSON Data ──
  Promise.all(
    warFiles.map(name =>
      fetch('../../data/war overview data/' + encodeURIComponent(name) + '.json')
        .then(res => res.json())
    )
  )
    .then(wars => {
      warsData = wars;
      updateStats();
      renderCards();
      buildTable();
      applyFilters();
    })
    .catch(err => {
      console.error('데이터 로드 실패:', err);
      warGrid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:3rem;">데이터를 불러올 수 없습니다.</p>';
    });

  // ── Update Page Stats ──
  function updateStats() {
    // 총 기록 수 = 전쟁 카드 개수
    const recordsEl = document.getElementById('statRecords');
    if (recordsEl) recordsEl.textContent = warsData.length.toLocaleString();

    // 교전국 수 = belligerents에서 고유 국가명 추출
    const countrySet = new Set();
    warsData.forEach(war => {
      if (!war.belligerents) return;
      war.belligerents
        .split(/\s*vs\s*/i)
        .forEach(side => {
          side.split(/[·,]/)
            .map(s => s.trim())
            .filter(s => s.length > 0)
            .forEach(name => countrySet.add(name));
        });
    });
    const countriesEl = document.getElementById('statCountries');
    if (countriesEl) countriesEl.textContent = countrySet.size.toLocaleString();
  }

  // ── 자료형 대표 이미지 매핑 (외부 Wikimedia 등) ──
  // war.id 또는 데이터 파일명을 키로 한다. 누락 시 placeholder 그라데이션을 사용한다.
  const warImages = {
    'greco-persian':  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Battle_of_Thermopylae_and_movements_to_Salamis%2C_480_BC.gif/640px-Battle_of_Thermopylae_and_movements_to_Salamis%2C_480_BC.gif',
    'peloponnesian':  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Map_Peloponnesian_War_431_BC-en.svg/640px-Map_Peloponnesian_War_431_BC-en.svg.png',
    'punic':          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Map_of_Rome_and_Carthage_at_the_start_of_the_Second_Punic_War.svg/640px-Map_of_Rome_and_Carthage_at_the_start_of_the_Second_Punic_War.svg.png',
    'crusades':       'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Counquest_of_Jeusalem_%281099%29.jpg/640px-Counquest_of_Jeusalem_%281099%29.jpg',
    'hundred-years':  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Bataille_d%27Azincourt.jpg/640px-Bataille_d%27Azincourt.jpg',
    'mongol':         'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/MongolEmpireDivisions1300.png/640px-MongolEmpireDivisions1300.png',
    'imjin':          'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Korean_admiral_Yi_Sun-sin.jpg/480px-Korean_admiral_Yi_Sun-sin.jpg',
    'thirty-years':   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Sebastiaen_Vrancx_-_The_Battle_of_White_Mountain.jpg/640px-Sebastiaen_Vrancx_-_The_Battle_of_White_Mountain.jpg',
    'napoleonic':     'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Napoleon_at_the_Battle_of_Austerlitz%2C_by_Fran%C3%A7ois_G%C3%A9rard.jpg/640px-Napoleon_at_the_Battle_of_Austerlitz%2C_by_Fran%C3%A7ois_G%C3%A9rard.jpg',
    'american-civil': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Thure_de_Thulstrup_-_L._Prang_and_Co._-_Battle_of_Gettysburg_-_Restoration_by_Adam_Cuerden.jpg/640px-Thure_de_Thulstrup_-_L._Prang_and_Co._-_Battle_of_Gettysburg_-_Restoration_by_Adam_Cuerden.jpg',
    'russo-japanese': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Battle_of_Tsushima_Russian.jpg/640px-Battle_of_Tsushima_Russian.jpg',
    'crimean':        'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Battle_of_balaklava.jpg/640px-Battle_of_balaklava.jpg',
    'ww1':            'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Cheshire_Regiment_trench_Somme_1916.jpg/640px-Cheshire_Regiment_trench_Somme_1916.jpg',
    'ww2':            'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Into_the_Jaws_of_Death_23-0455M_edit.jpg/640px-Into_the_Jaws_of_Death_23-0455M_edit.jpg',
    'korean':         'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/KoreanWarRefugeeWithBaby.jpg/480px-KoreanWarRefugeeWithBaby.jpg',
    'vietnam':        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/UH-1D_helicopters_in_Vietnam_1966.jpg/640px-UH-1D_helicopters_in_Vietnam_1966.jpg',
    'gulf':           'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/DesertStormMap_v2.svg/640px-DesertStormMap_v2.svg.png'
  };

  // ── Render Cards from JSON ──
  function renderCards() {
    warGrid.innerHTML = '';
    warsData.forEach(war => {
      const resultClass = war.resultType === 'victory' ? 'outcome-victory'
                        : war.resultType === 'defeat' ? 'outcome-defeat' : '';
      const tagsHTML = war.tags.map(t => `<span class="war-tag">${escapeHTML(t)}</span>`).join('');

      const imgSrc = war.image || warImages[war.id] || '';
      const imageHTML = imgSrc
        ? `<div class="war-card-image"><img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(war.name)} 자료 이미지" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.remove()"></div>`
        : '';

      const article = document.createElement('article');
      article.className = 'war-card';
      article.dataset.era = war.era;
      article.dataset.region = war.region;
      article.addEventListener('click', () => {
        window.location.href = 'war overview detail.html?id=' + encodeURIComponent(war.id);
      });
      article.innerHTML = `
        ${imageHTML}
        <div class="war-card-body">
          <div class="war-card-header">
            <span class="era-badge ${war.era}">${escapeHTML(eraLabels[war.era] || war.era)}</span>
            <span class="war-period">${escapeHTML(war.period)}</span>
          </div>
          <h3 class="war-name">${escapeHTML(war.name)}</h3>
          <p class="war-summary">${escapeHTML(war.summary)}</p>
          <div class="war-meta">
            <div class="meta-item"><span class="meta-label">교전국</span><span class="meta-value">${escapeHTML(war.belligerents)}</span></div>
            <div class="meta-item"><span class="meta-label">지역</span><span class="meta-value">${escapeHTML(war.location)}</span></div>
            <div class="meta-item"><span class="meta-label">결과</span><span class="meta-value ${resultClass}">${escapeHTML(war.result)}</span></div>
          </div>
          <div class="war-tags">${tagsHTML}</div>
        </div>
      `;
      warGrid.appendChild(article);
    });
  }

  // ── Build Table from JSON ──
  function buildTable() {
    warTableBody.innerHTML = '';
    warsData.forEach(war => {
      const tr = document.createElement('tr');
      tr.dataset.era = war.era;
      tr.dataset.region = war.region;
      tr.dataset.searchText = (war.name + ' ' + war.belligerents + ' ' + war.location + ' ' + war.tags.join(' ')).toLowerCase();
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        window.location.href = 'war overview detail.html?id=' + encodeURIComponent(war.id);
      });

      tr.innerHTML = `
        <td><span class="table-era era-badge ${war.era}">${escapeHTML(eraLabels[war.era] || war.era)}</span></td>
        <td class="war-name-cell">${escapeHTML(war.name)}</td>
        <td>${escapeHTML(war.period)}</td>
        <td>${escapeHTML(war.belligerents)}</td>
        <td>${escapeHTML(war.location)}</td>
        <td>${escapeHTML(war.result)}</td>
      `;
      warTableBody.appendChild(tr);
    });
  }

  // ── HTML Escape ──
  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Filter Logic ──
  function applyFilters() {
    let visibleCount = 0;
    const query = searchQuery.toLowerCase();

    // Filter cards
    const warCards = warGrid.querySelectorAll('.war-card');
    warCards.forEach(card => {
      const matchEra = activeEra === 'all' || card.dataset.era === activeEra;
      const matchRegion = activeRegion === 'all' || card.dataset.region === activeRegion;
      const searchText = (
        card.querySelector('.war-name').textContent +
        card.querySelector('.war-summary').textContent +
        Array.from(card.querySelectorAll('.meta-value')).map(el => el.textContent).join(' ') +
        Array.from(card.querySelectorAll('.war-tag')).map(el => el.textContent).join(' ')
      ).toLowerCase();
      const matchSearch = !query || searchText.includes(query);

      if (matchEra && matchRegion && matchSearch) {
        card.classList.remove('hidden');
        visibleCount++;
      } else {
        card.classList.add('hidden');
      }
    });

    // Filter table rows
    const tableRows = warTableBody.querySelectorAll('tr');
    tableRows.forEach(row => {
      const matchEra = activeEra === 'all' || row.dataset.era === activeEra;
      const matchRegion = activeRegion === 'all' || row.dataset.region === activeRegion;
      const matchSearch = !query || row.dataset.searchText.includes(query);

      if (matchEra && matchRegion && matchSearch) {
        row.classList.remove('hidden');
      } else {
        row.classList.add('hidden');
      }
    });

    resultCount.textContent = `${visibleCount}건의 전쟁 표시 중`;
  }

  // ── Era Tabs ──
  eraTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      eraTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeEra = tab.dataset.era;
      applyFilters();
    });
  });

  // ── Region Filter ──
  if (regionFilter) {
    regionFilter.addEventListener('change', () => {
      activeRegion = regionFilter.value;
      applyFilters();
    });
  }

  // ── Search ──
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        applyFilters();
      }, 250);
    });
  }

  // ── View Toggle (Card / Table) ──
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.dataset.view;
      if (view === 'card') {
        warGrid.style.display = '';
        warTable.style.display = 'none';
      } else {
        warGrid.style.display = 'none';
        warTable.style.display = '';
      }
    });
  });

  // ── Fade-in Animation ──
  const fadeElements = document.querySelectorAll('.fade-in');
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  fadeElements.forEach(el => fadeObserver.observe(el));
});
