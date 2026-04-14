// ── Strategy & Tactics - JavaScript ──

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
  const categoryFilter = document.getElementById('categoryFilter');
  const searchInput = document.getElementById('strategySearch');
  const resultCount = document.getElementById('resultCount');
  const scrollView = document.getElementById('scrollView');
  const gridView = document.getElementById('gridView');
  const emptyState = document.getElementById('emptyState');
  const viewBtns = document.querySelectorAll('.view-btn');
  const totalDocCount = document.getElementById('totalDocCount');
  const totalCategoryCount = document.getElementById('totalCategoryCount');

  let activeEra = 'all';
  let activeCategory = 'all';
  let searchQuery = '';
  let strategiesData = [];
  let currentView = 'scroll';
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

  const categoryLabels = {
    'grand-strategy': '대전략',
    'operational': '작전술',
    'tactics': '전술',
    'siege': '공성전',
    'naval': '해전 전술',
    'guerrilla': '비정규전',
    'logistics': '병참·보급',
    'doctrine': '군사 교리'
  };

  // ── 명언 데이터 ──
  const quotes = [
    { text: '"전쟁의 최고 경지는 싸우지 않고 이기는 것이다."', author: '— 손자(孫子), 『손자병법』' },
    { text: '"전쟁은 다른 수단에 의한 정치의 연속이다."', author: '— 카를 폰 클라우제비츠, 『전쟁론』' },
    { text: '"적을 알고 나를 알면 백 번 싸워도 위태롭지 않다."', author: '— 손자(孫子), 『손자병법』' },
    { text: '"전략 없는 전술은 패배 전의 소란에 불과하다."', author: '— 손자(孫子)' },
    { text: '"방어는 공격보다 강한 전쟁의 형태이다."', author: '— 카를 폰 클라우제비츠' },
    { text: '"전투에 이기는 것보다 전쟁에 이기는 것이 중요하다."', author: '— 바실 리델 하트' },
    { text: '"신속함은 전쟁의 본질이다."', author: '— 나폴레옹 보나파르트' },
    { text: '"필사즉생 필생즉사 (必死卽生 必生卽死)"', author: '— 이순신, 『난중일기』' }
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
  const strategyFiles = [
    'phalanx',
    'legion tactics',
    'art of war',
    'envelopment',
    'cavalry charge',
    'siege warfare',
    'mongol tactics',
    'longbow tactics',
    'tercio',
    'line infantry',
    'vauban fortification',
    'naval line of battle',
    'napoleonic corps system',
    'clausewitz doctrine',
    'total war',
    'trench warfare',
    'blitzkrieg',
    'strategic bombing',
    'amphibious assault',
    'guerrilla warfare',
    'containment',
    'counterinsurgency',
    'network centric warfare',
    'hybrid warfare'
  ];

  // ── Load JSON Data ──
  Promise.all(
    strategyFiles.map(name =>
      fetch('/data/strategy-and-tactics/' + encodeURIComponent(name) + '.json')
        .then(res => {
          if (!res.ok) throw new Error('File not found: ' + name);
          return res.json();
        })
        .catch(() => null)
    )
  )
    .then(results => {
      strategiesData = results.filter(d => d !== null);
      updatePageStats();
      renderAll();
    })
    .catch(err => {
      console.error('데이터 로드 실패:', err);
      scrollView.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:3rem;">데이터를 불러올 수 없습니다. 데이터 파일을 추가해 주세요.</p>';
    });

  // ── Update Page Stats ──
  function updatePageStats() {
    if (totalDocCount) totalDocCount.textContent = strategiesData.length;
    const cats = new Set(strategiesData.map(d => d.category).filter(Boolean));
    if (totalCategoryCount) totalCategoryCount.textContent = cats.size;
  }

  // ── Filter Logic ──
  function getFiltered() {
    return strategiesData.filter(item => {
      const matchEra = activeEra === 'all' || item.era === activeEra;
      const matchCat = activeCategory === 'all' || item.category === activeCategory;
      const matchSearch = !searchQuery ||
        (item.title && item.title.toLowerCase().includes(searchQuery)) ||
        (item.titleKr && item.titleKr.toLowerCase().includes(searchQuery)) ||
        (item.description && item.description.toLowerCase().includes(searchQuery)) ||
        (item.origin && item.origin.toLowerCase().includes(searchQuery)) ||
        (item.keywords && item.keywords.some(k => k.toLowerCase().includes(searchQuery)));
      return matchEra && matchCat && matchSearch;
    });
  }

  // ── Render All ──
  function renderAll() {
    const filtered = getFiltered();

    if (resultCount) {
      resultCount.textContent = strategiesData.length > 0
        ? `총 ${filtered.length}건의 문헌`
        : '데이터 파일을 추가하면 문헌이 표시됩니다.';
    }

    renderScrollView(filtered);
    renderGridView(filtered);

    // 5개 이상이면 독립 스크롤 활성화
    updateScrollContainment(filtered.length);

    if (filtered.length === 0 && strategiesData.length > 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

  // ── 독립 스크롤 영역 관리 ──
  function updateScrollContainment(count) {
    const threshold = 5;
    const views = [scrollView, gridView];
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

    // 하단 페이드 오버레이 관리
    manageScrollFade(scrollView, count >= threshold && currentView === 'scroll');
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
      // 스크롤이 바닥에 도달하면 페이드 숨기기
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

  // ── Scroll View 렌더링 ──
  function renderScrollView(data) {
    scrollView.innerHTML = '';
    data.forEach((item, i) => {
      const entry = document.createElement('a');
      entry.className = 'scroll-entry';
      entry.href = 'strategy and tactics detail.html?id=' + encodeURIComponent(item.id);
      entry.innerHTML = `
        <div class="scroll-entry-header">
          <span class="scroll-entry-era">${eraLabels[item.era] || item.era || '—'}</span>
          <span class="scroll-entry-category">${categoryLabels[item.category] || item.category || ''}</span>
        </div>
        <h3 class="scroll-entry-title">${item.titleKr || item.title || '제목 없음'}</h3>
        ${item.origin ? `<div class="scroll-entry-origin">${item.origin}</div>` : ''}
        <p class="scroll-entry-desc">${item.description || ''}</p>
        <div class="scroll-entry-meta">
          ${item.period ? `<span class="scroll-meta-item"><strong>시기:</strong> ${item.period}</span>` : ''}
          ${item.region ? `<span class="scroll-meta-item"><strong>지역:</strong> ${item.region}</span>` : ''}
          ${item.keyFigure ? `<span class="scroll-meta-item"><strong>핵심 인물:</strong> ${item.keyFigure}</span>` : ''}
        </div>
      `;
      scrollView.appendChild(entry);

      if (i < data.length - 1) {
        const divider = document.createElement('div');
        divider.className = 'scroll-divider';
        scrollView.appendChild(divider);
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
      card.href = 'strategy and tactics detail.html?id=' + encodeURIComponent(item.id);
      card.innerHTML = `
        <div class="grid-card-era">${eraLabels[item.era] || item.era || '—'}</div>
        <h3 class="grid-card-title">${item.titleKr || item.title || '제목 없음'}</h3>
        ${item.origin ? `<div class="grid-card-origin">${item.origin}</div>` : ''}
        <p class="grid-card-desc">${item.description || ''}</p>
        <div class="grid-card-tags">
          ${(item.keywords || []).slice(0, 4).map(k => `<span class="grid-card-tag">${k}</span>`).join('')}
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

    // 이전 버튼
    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '◂';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => { currentPage--; renderAll(); scrollToGrid(); });
    pagination.appendChild(prevBtn);

    // 페이지 번호
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => { currentPage = i; renderAll(); scrollToGrid(); });
      pagination.appendChild(btn);
    }

    // 다음 버튼
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

  // ── Category Filter ──
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      activeCategory = categoryFilter.value;
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

      if (currentView === 'scroll') {
        scrollView.style.display = 'flex';
        gridView.style.display = 'none';
        document.getElementById('pagination').style.display = 'none';
      } else {
        scrollView.style.display = 'none';
        gridView.style.display = 'grid';
        currentPage = 1;
        renderAll();
      }
      // 뷰 전환 시 독립 스크롤 상태 업데이트
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

  document.querySelectorAll('.st-item, .scroll-entry').forEach(el => {
    observer.observe(el);
  });
});
