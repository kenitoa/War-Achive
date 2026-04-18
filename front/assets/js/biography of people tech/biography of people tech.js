// ── Biography of People - JavaScript ──

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
  const roleTabs = document.querySelectorAll('.filter-tab');
  const eraFilter = document.getElementById('eraFilter');
  const nationFilter = document.getElementById('nationFilter');
  const searchInput = document.getElementById('personSearch');
  const resultCount = document.getElementById('resultCount');
  const personGrid = document.getElementById('personGrid');
  const personTable = document.getElementById('personTable');
  const personTableBody = document.getElementById('personTableBody');
  const viewBtns = document.querySelectorAll('.view-btn');
  const noResults = document.getElementById('noResults');

  let activeRole = 'all';
  let activeEra = 'all';
  let activeNation = 'all';
  let searchQuery = '';
  let peopleData = [];

  const roleLabels = {
    commander: '지휘관',
    strategist: '전략가',
    politician: '정치인',
    hero: '영웅',
    civilian: '민간인',
    other: '기타'
  };

  const eraLabels = {
    ancient: '고대',
    medieval: '중세',
    earlymodern: '근세',
    modern: '근대',
    worldwar: '세계대전',
    contemporary: '현대'
  };

  // ── 개별 JSON 파일 목록 (로드 순서 = 표시 순서) ──
  const personFiles = [
    'alexander the great',
    'leonidas',
    'hannibal',
    'scipio africanus',
    'saladin',
    'genghis khan',
    'joan of arc',
    'yi sun sin',
    'napoleon',
    'wellington',
    'abraham lincoln',
    'ulysses grant',
    'florence nightingale',
    'togo heihachiro',
    'winston churchill',
    'erwin rommel',
    'dwight eisenhower',
    'douglas macarthur',
    'ho chi minh',
    'vo nguyen giap',
    'norman schwarzkopf'
  ];

  // ── Load JSON Data ──
  Promise.all(
    personFiles.map(name =>
      fetch('/data/biography-of-people/' + encodeURIComponent(name) + '.json')
        .then(res => res.json())
    )
  )
    .then(people => {
      peopleData = people;
      populateNationFilter();
      updateStats();
      renderCards();
      buildTable();
      applyFilters();
    })
    .catch(err => {
      console.error('데이터 로드 실패:', err);
      personGrid.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:3rem;">데이터를 불러올 수 없습니다.</p>';
    });

  // ── Populate Nation Filter ──
  function populateNationFilter() {
    const nations = new Set();
    peopleData.forEach(p => {
      if (p.nationality) nations.add(p.nationality);
    });
    const sorted = [...nations].sort();
    sorted.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      nationFilter.appendChild(opt);
    });
  }

  // ── Update Page Stats ──
  function updateStats() {
    const totalEl = document.getElementById('statTotal');
    if (totalEl) totalEl.textContent = peopleData.length.toLocaleString();

    const warSet = new Set();
    peopleData.forEach(p => {
      if (p.wars) p.wars.forEach(w => warSet.add(w));
    });
    const warsEl = document.getElementById('statWars');
    if (warsEl) warsEl.textContent = warSet.size.toLocaleString();

    const nationSet = new Set();
    peopleData.forEach(p => {
      if (p.nationality) nationSet.add(p.nationality);
    });
    const nationsEl = document.getElementById('statNations');
    if (nationsEl) nationsEl.textContent = nationSet.size.toLocaleString();
  }

  // ── Render Cards ──
  function renderCards() {
    personGrid.innerHTML = '';
    peopleData.forEach(person => {
      const tagsHTML = (person.tags || []).map(t => `<span class="person-tag">${escapeHTML(t)}</span>`).join('');
      const warsText = (person.wars || []).join(', ');

      const article = document.createElement('article');
      article.className = 'person-card';
      article.style.cursor = 'pointer';
      article.addEventListener('click', () => {
        window.location.href = 'biography of people detail.html?id=' + encodeURIComponent(person.id);
      });
      article.dataset.role = person.role;
      article.dataset.era = person.era;
      article.dataset.nation = person.nationality || '';
      article.dataset.searchText = [
        person.name, person.nationality, person.title,
        warsText, (person.tags || []).join(' ')
      ].join(' ').toLowerCase();

      article.innerHTML = `
        <div class="person-card-header">
          <span class="role-badge ${escapeHTML(person.role)}">${escapeHTML(roleLabels[person.role] || person.role)}</span>
          <span class="person-lifespan">${escapeHTML(person.lifespan || '')}</span>
        </div>
        <h3 class="person-name">${escapeHTML(person.name)}</h3>
        <p class="person-title">${escapeHTML(person.title || '')}</p>
        <p class="person-summary">${escapeHTML(person.summary || '')}</p>
        <div class="person-meta">
          <div class="meta-item"><span class="meta-label">국적</span><span class="meta-value">${escapeHTML(person.nationality || '-')}</span></div>
          <div class="meta-item"><span class="meta-label">관련 전쟁</span><span class="meta-value">${escapeHTML(warsText || '-')}</span></div>
        </div>
        <div class="person-tags">${tagsHTML}</div>
      `;
      personGrid.appendChild(article);
    });
  }

  // ── Build Table ──
  function buildTable() {
    personTableBody.innerHTML = '';
    peopleData.forEach(person => {
      const warsText = (person.wars || []).join(', ');
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        window.location.href = 'biography of people detail.html?id=' + encodeURIComponent(person.id);
      });
      tr.dataset.role = person.role;
      tr.dataset.era = person.era;
      tr.dataset.nation = person.nationality || '';
      tr.dataset.searchText = [
        person.name, person.nationality, person.title,
        warsText, (person.tags || []).join(' ')
      ].join(' ').toLowerCase();

      tr.innerHTML = `
        <td><span class="table-role role-badge ${escapeHTML(person.role)}">${escapeHTML(roleLabels[person.role] || person.role)}</span></td>
        <td class="table-name">${escapeHTML(person.name)}</td>
        <td>${escapeHTML(eraLabels[person.era] || person.era)}</td>
        <td>${escapeHTML(person.nationality || '-')}</td>
        <td class="table-war">${escapeHTML(warsText || '-')}</td>
        <td>${escapeHTML(person.lifespan || '-')}</td>
      `;
      personTableBody.appendChild(tr);
    });
  }

  // ── Apply Filters ──
  function applyFilters() {
    const cards = personGrid.querySelectorAll('.person-card');
    const rows = personTableBody.querySelectorAll('tr');
    let visible = 0;

    const check = el => {
      const matchRole = activeRole === 'all' || el.dataset.role === activeRole;
      const matchEra = activeEra === 'all' || el.dataset.era === activeEra;
      const matchNation = activeNation === 'all' || el.dataset.nation === activeNation;
      const matchSearch = !searchQuery || el.dataset.searchText.includes(searchQuery);

      if (matchRole && matchEra && matchNation && matchSearch) {
        el.classList.remove('hidden');
        visible++;
      } else {
        el.classList.add('hidden');
      }
    };

    cards.forEach(check);
    visible = 0;
    // re-count with rows
    cards.forEach(c => {
      if (!c.classList.contains('hidden')) visible++;
    });
    rows.forEach(r => {
      const matchRole = activeRole === 'all' || r.dataset.role === activeRole;
      const matchEra = activeEra === 'all' || r.dataset.era === activeEra;
      const matchNation = activeNation === 'all' || r.dataset.nation === activeNation;
      const matchSearch = !searchQuery || r.dataset.searchText.includes(searchQuery);

      if (matchRole && matchEra && matchNation && matchSearch) {
        r.classList.remove('hidden');
      } else {
        r.classList.add('hidden');
      }
    });

    resultCount.textContent = visible + '명의 인물';
    noResults.style.display = visible === 0 ? 'block' : 'none';
  }

  // ── Role Tab Click ──
  roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      roleTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeRole = tab.dataset.role;
      applyFilters();
    });
  });

  // ── Era Filter Change ──
  eraFilter.addEventListener('change', () => {
    activeEra = eraFilter.value;
    applyFilters();
  });

  // ── Nation Filter Change ──
  nationFilter.addEventListener('change', () => {
    activeNation = nationFilter.value;
    applyFilters();
  });

  // ── Search Input ──
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    applyFilters();
  });

  // ── View Toggle ──
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.dataset.view;
      if (view === 'card') {
        personGrid.style.display = '';
        personTable.style.display = 'none';
      } else {
        personGrid.style.display = 'none';
        personTable.style.display = '';
      }
    });
  });

  // ── Escape HTML ──
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
});
