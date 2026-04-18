// ── Battlefield Map - JavaScript ──

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
  const theaterFilter = document.getElementById('theaterFilter');
  const searchInput = document.getElementById('battleSearch');
  const resultCount = document.getElementById('resultCount');
  const fieldView = document.getElementById('fieldView');
  const gridView = document.getElementById('gridView');
  const emptyState = document.getElementById('emptyState');
  const viewBtns = document.querySelectorAll('.view-btn');
  const totalBattleCount = document.getElementById('totalBattleCount');
  const totalTheaterCount = document.getElementById('totalTheaterCount');

  let activeEra = 'all';
  let activeTheater = 'all';
  let searchQuery = '';
  let battlesData = [];
  let currentView = 'field';
  let currentPage = 1;
  const itemsPerPage = 9;

  const eraLabels = {
    ancient: '고대',
    medieval: '중세',
    earlymodern: '근세',
    modern: '근대',
    worldwar: '세계대전',
    contemporary: '현대'
  };

  const theaterLabels = {
    'europe': '유럽',
    'asia': '아시아',
    'mediterranean': '지중해',
    'pacific': '태평양',
    'middle-east': '중동',
    'americas': '아메리카'
  };

  // ── 명언 데이터 ──
  const quotes = [
    { text: '"지형을 아는 자가 전쟁을 지배한다."', author: '— 손자(孫子), 『손자병법』 지형편' },
    { text: '"전쟁에서 지형은 전투력의 절반이다."', author: '— 나폴레옹 보나파르트' },
    { text: '"모든 전투의 승패는 전장에 도착하기 전에 결정된다."', author: '— 손자(孫子)' },
    { text: '"지도를 읽지 못하는 장군은 전쟁을 수행할 수 없다."', author: '— 에르빈 롬멜' },
    { text: '"높은 곳을 점령하라. 그것이 전투의 시작이다."', author: '— 카를 폰 클라우제비츠' },
    { text: '"바다를 지배하는 자가 세계를 지배한다."', author: '— 알프레드 마한' },
    { text: '"필사즉생 필생즉사 (必死卽生 必生卽死)"', author: '— 이순신, 『난중일기』' },
    { text: '"전장의 안개 속에서 확실한 것은 아무것도 없다."', author: '— 카를 폰 클라우제비츠, 『전쟁론』' }
  ];

  // ── 랜덤 명언 표시 ──
  function showRandomQuote() {
    const q = quotes[Math.floor(Math.random() * quotes.length)];
    const quoteText = document.getElementById('quoteText');
    const quoteAuthor = document.getElementById('quoteAuthor');
    if (quoteText) quoteText.textContent = q.text;
    if (quoteAuthor) quoteAuthor.textContent = q.author;
  }
  showRandomQuote();

  // ── JSON 파일 목록 ──
  const mapFiles = [
    'battle of thermopylae',
    'battle of cannae',
    'battle of gaugamela',
    'battle of hansando',
    'battle of austerlitz',
    'battle of gettysburg',
    'battle of stalingrad',
    'normandy landings',
    'battle of midway',
    'battle of incheon',
    'battle of marathon',
    'battle of agincourt',
    'battle of lepanto',
    'battle of waterloo',
    'battle of trafalgar',
    'battle of the somme',
    'battle of kursk',
    'battle of britain',
    'siege of constantinople',
    'battle of dien bien phu'
  ];

  // ── AR HUD 오버레이 생성 ──
  function createARHUD() {
    // HUD 코너 브라켓
    const overlay = document.createElement('div');
    overlay.className = 'ar-hud-overlay';
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
      const corner = document.createElement('div');
      corner.className = 'hud-corner ' + pos;
      overlay.appendChild(corner);
    });
    document.body.appendChild(overlay);

    // HUD 상단 상태 바
    const topbar = document.createElement('div');
    topbar.className = 'ar-hud-topbar';
    topbar.innerHTML = `
      <div class="hud-indicator"><span class="hud-dot amber"></span> <span id="hudBattleCount">0</span> TARGETS</div>
      <div class="hud-indicator">SYS:ONLINE</div>
      <div class="hud-indicator" id="hudTimestamp"></div>
    `;
    document.body.appendChild(topbar);

    // HUD 데이터 리드아웃 (우하단)
    const readout = document.createElement('div');
    readout.className = 'ar-data-readout';
    readout.id = 'arDataReadout';
    readout.innerHTML = `
      <span class="readout-line"><span class="readout-label">STATUS: </span><span class="readout-value">SCANNING</span></span>
      <span class="readout-line"><span class="readout-label">ARCHIVE: </span><span class="readout-value">WAR-ARCHIVE v2.0</span></span>
      <span class="readout-line"><span class="readout-label">RECORDS: </span><span class="readout-value" id="readoutRecords">—</span></span>
      <span class="readout-line"><span class="readout-label">FILTER: </span><span class="readout-value" id="readoutFilter">ALL</span></span>
    `;
    document.body.appendChild(readout);

    // 타임스탬프 업데이트
    function updateHudTime() {
      const el = document.getElementById('hudTimestamp');
      if (el) {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        el.textContent = h + ':' + m + ':' + s + ' KST';
      }
    }
    updateHudTime();
    setInterval(updateHudTime, 1000);
  }

  // AR HUD 데이터 업데이트
  function updateARReadout() {
    const hudCount = document.getElementById('hudBattleCount');
    const readoutRecords = document.getElementById('readoutRecords');
    const readoutFilter = document.getElementById('readoutFilter');
    const filtered = getFiltered();
    if (hudCount) hudCount.textContent = filtered.length;
    if (readoutRecords) readoutRecords.textContent = filtered.length + '/' + battlesData.length;
    if (readoutFilter) {
      const parts = [];
      if (activeEra !== 'all') parts.push(eraLabels[activeEra] || activeEra);
      if (activeTheater !== 'all') parts.push(theaterLabels[activeTheater] || activeTheater);
      if (searchQuery) parts.push('"' + searchQuery + '"');
      readoutFilter.textContent = parts.length > 0 ? parts.join(' / ') : 'ALL';
    }
  }

  createARHUD();

  // ── Load JSON Data ──
  Promise.all(
    mapFiles.map(name =>
      fetch('/data/battlefield-map/' + encodeURIComponent(name) + '.json')
        .then(res => {
          if (!res.ok) throw new Error('File not found: ' + name);
          return res.json();
        })
        .catch(() => null)
    )
  )
    .then(results => {
      battlesData = results.filter(d => d !== null);
      updatePageStats();
      updateHeroCoords();
      renderAll();
    })
    .catch(err => {
      console.error('데이터 로드 실패:', err);
      fieldView.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:3rem;">데이터를 불러올 수 없습니다.</p>';
    });

  // ── Update Page Stats ──
  function updatePageStats() {
    if (totalBattleCount) totalBattleCount.textContent = battlesData.length;
    const theaters = new Set(battlesData.map(d => d.theater).filter(Boolean));
    if (totalTheaterCount) totalTheaterCount.textContent = theaters.size;
  }

  // ── 히어로 좌표 표시 (마지막 조회 전투 우선) ──
  function updateHeroCoords() {
    const coordEl = document.querySelector('.coord-value');
    if (!coordEl || battlesData.length === 0) return;

    const lastId = sessionStorage.getItem('lastViewedBattleId');
    if (lastId) {
      const last = battlesData.find(b => b.id === lastId);
      if (last) {
        coordEl.textContent = (last.titleKr || last.title || '') + ' — ' + (last.location || '');
        return;
      }
    }
    const first = battlesData[0];
    if (first.location) {
      coordEl.textContent = first.location;
    }
  }

  // ── 클릭 시 마지막 조회 전투 저장 ──
  function saveLastViewed(item) {
    sessionStorage.setItem('lastViewedBattleId', item.id);
  }

  // ── Filter Logic ──
  function getFiltered() {
    return battlesData.filter(item => {
      const matchEra = activeEra === 'all' || item.era === activeEra;
      const matchTheater = activeTheater === 'all' || item.theater === activeTheater;
      const matchSearch = !searchQuery ||
        (item.title && item.title.toLowerCase().includes(searchQuery)) ||
        (item.titleKr && item.titleKr.toLowerCase().includes(searchQuery)) ||
        (item.description && item.description.toLowerCase().includes(searchQuery)) ||
        (item.location && item.location.toLowerCase().includes(searchQuery)) ||
        (item.commanders && item.commanders.some(c => c.toLowerCase().includes(searchQuery))) ||
        (item.keywords && item.keywords.some(k => k.toLowerCase().includes(searchQuery)));
      return matchEra && matchTheater && matchSearch;
    });
  }

  // ── Render All ──
  function renderAll() {
    const filtered = getFiltered();

    if (resultCount) {
      resultCount.textContent = battlesData.length > 0
        ? `총 ${filtered.length}건의 전투 기록`
        : '데이터 파일을 추가하면 전투 기록이 표시됩니다.';
    }

    renderFieldView(filtered);
    renderGridView(filtered);
    updateScrollContainment(filtered.length);
    updateARReadout();

    if (filtered.length === 0 && battlesData.length > 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

  // ── 독립 스크롤 영역 관리 ──
  function updateScrollContainment(count) {
    const threshold = 5;
    const views = [fieldView, gridView];
    views.forEach(view => {
      if (!view) return;
      if (count >= threshold) {
        view.style.maxHeight = '75vh';
        view.style.overflowY = 'auto';
      } else {
        view.style.maxHeight = 'none';
        view.style.overflowY = 'visible';
      }
    });

    manageScrollFade(fieldView, count >= threshold && currentView === 'field');
    manageScrollFade(gridView, count >= threshold && currentView === 'grid');
  }

  function manageScrollFade(view, show) {
    if (!view) return;
    let fade = view.querySelector('.scroll-fade-overlay');
    if (show) {
      if (!fade) {
        fade = document.createElement('div');
        fade.className = 'scroll-fade-overlay';
        view.appendChild(fade);
      }
      fade.style.display = 'block';
      view.removeEventListener('scroll', view._fadeHandler);
      view._fadeHandler = () => {
        const atBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 10;
        fade.style.opacity = atBottom ? '0' : '1';
      };
      view.addEventListener('scroll', view._fadeHandler);
    } else {
      if (fade) fade.style.display = 'none';
    }
  }

  // ── Field View 렌더링 ──
  function renderFieldView(data) {
    fieldView.innerHTML = '';
    data.forEach((item, i) => {
      const entry = document.createElement('a');
      entry.className = 'field-entry';
      entry.href = 'Battlefield Map detail.html?id=' + encodeURIComponent(item.id);
      entry.addEventListener('click', () => saveLastViewed(item));

      const commanders = (item.commanders || []).join(' vs ');
      const coordText = item.location || '';

      entry.innerHTML = `
        <div class="ar-scan-line"></div>
        <div class="field-entry-coords">${coordText}</div>
        <div class="field-entry-header">
          <span class="field-entry-era">${eraLabels[item.era] || item.era || '—'}</span>
          <span class="field-entry-theater">${theaterLabels[item.theater] || item.theater || ''}</span>
        </div>
        <h3 class="field-entry-title">${item.titleKr || item.title || '제목 없음'}</h3>
        ${item.location ? `<div class="field-entry-location">${item.location}</div>` : ''}
        <p class="field-entry-desc">${item.description || ''}</p>
        <div class="field-entry-meta">
          ${item.terrain ? `<span class="field-terrain-tag">${item.terrain}</span>` : ''}
          ${item.date ? `<span class="field-meta-item"><strong>시기:</strong> ${item.date}</span>` : ''}
          ${commanders ? `<span class="field-meta-item"><strong>지휘관:</strong> ${commanders}</span>` : ''}
          ${item.result ? `<span class="field-meta-item"><strong>결과:</strong> ${item.result}</span>` : ''}
        </div>
      `;
      fieldView.appendChild(entry);

      if (i < data.length - 1) {
        const divider = document.createElement('div');
        divider.className = 'field-divider';
        fieldView.appendChild(divider);
      }
    });
  }

  // ── Grid View 렌더링 (페이지네이션) ──
  function renderGridView(data) {
    gridView.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * itemsPerPage;
    const pageData = data.slice(start, start + itemsPerPage);

    pageData.forEach(item => {
      const card = document.createElement('a');
      card.className = 'grid-card';
      card.href = 'Battlefield Map detail.html?id=' + encodeURIComponent(item.id);
      card.addEventListener('click', () => saveLastViewed(item));
      card.innerHTML = `
        <div class="holo-shimmer"></div>
        <div class="card-bracket tl"></div><div class="card-bracket tr"></div>
        <div class="card-bracket bl"></div><div class="card-bracket br"></div>
        <div class="ar-status">LINKED</div>
        <div class="grid-card-era">${eraLabels[item.era] || item.era || '—'}</div>
        <h3 class="grid-card-title">${item.titleKr || item.title || '제목 없음'}</h3>
        ${item.location ? `<div class="grid-card-location">📍 ${item.location}</div>` : ''}
        <p class="grid-card-desc">${item.description || ''}</p>
        <div class="grid-card-footer">
          <div class="grid-card-tags">
            ${(item.keywords || []).slice(0, 4).map(k => `<span class="grid-card-tag">${k}</span>`).join('')}
          </div>
          ${item.terrain ? `<span class="grid-card-terrain">${item.terrain}</span>` : ''}
        </div>
      `;
      gridView.appendChild(card);
    });

    renderPagination(data.length, totalPages);
  }

  // ── 페이지네이션 렌더링 ──
  function renderPagination(totalItems, totalPages) {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    pagination.style.display = (currentView === 'grid' && totalPages > 1) ? 'flex' : 'none';
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '◂';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => { currentPage--; renderAll(); scrollToGrid(); });
    pagination.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => { currentPage = i; renderAll(); scrollToGrid(); });
      pagination.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '▸';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => { currentPage++; renderAll(); scrollToGrid(); });
    pagination.appendChild(nextBtn);
  }

  function scrollToGrid() {
    gridView.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ── Era Tabs ──
  eraTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      eraTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeEra = tab.dataset.era;
      currentPage = 1;
      renderAll();
    });
  });

  // ── Theater Filter ──
  if (theaterFilter) {
    theaterFilter.addEventListener('change', () => {
      activeTheater = theaterFilter.value;
      currentPage = 1;
      renderAll();
    });
  }

  // ── Search ──
  if (searchInput) {
    let debounce;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        searchQuery = searchInput.value.trim().toLowerCase();
        currentPage = 1;
        renderAll();
      }, 300);
    });
  }

  // ── View Toggle ──
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;

      if (currentView === 'field') {
        fieldView.style.display = 'flex';
        gridView.style.display = 'none';
        document.getElementById('pagination').style.display = 'none';
      } else {
        fieldView.style.display = 'none';
        gridView.style.display = 'grid';
        currentPage = 1;
        renderAll();
      }
      const filtered = getFiltered();
      updateScrollContainment(filtered.length);
    });
  });

  // ── Scroll Animations ──
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document.querySelectorAll('.field-entry').forEach(el => {
    observer.observe(el);
  });
});
