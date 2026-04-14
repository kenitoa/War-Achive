// ── Historical Sources & Documents - JavaScript ──

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
  const eraTabs = document.querySelectorAll('.catalog-tab');
  const typeFilter = document.getElementById('typeFilter');
  const searchInput = document.getElementById('docSearch');
  const resultCount = document.getElementById('resultCount');
  const shelfView = document.getElementById('shelfView');
  const catalogView = document.getElementById('catalogView');
  const emptyState = document.getElementById('emptyState');
  const viewBtns = document.querySelectorAll('.view-btn');
  const totalDocCount = document.getElementById('totalDocCount');
  const totalTypeCount = document.getElementById('totalTypeCount');
  const totalEraCount = document.getElementById('totalEraCount');

  let activeEra = 'all';
  let activeType = 'all';
  let searchQuery = '';
  let documentsData = [];
  let currentView = 'shelf';
  let currentPage = 1;
  const itemsPerPage = 12;

  const eraLabels = {
    ancient: '고대',
    medieval: '중세',
    earlymodern: '근세',
    modern: '근대',
    worldwar: '세계대전',
    contemporary: '현대'
  };

  const typeLabels = {
    treaty: '조약문',
    declaration: '선전포고문',
    letter: '편지',
    diary: '일기',
    speech: '연설문',
    report: '공식 보고서',
    order: '작전 명령서',
    memoir: '회고록'
  };

  const typeIcons = {
    treaty: '📜',
    declaration: '⚔️',
    letter: '✉️',
    diary: '📔',
    speech: '🎙️',
    report: '📋',
    order: '🗺️',
    memoir: '📖'
  };

  // ── 명언 데이터 ──
  const quotes = [
    { text: '"역사를 기억하지 못하는 자는 그것을 반복할 운명에 처한다."', author: '— 조지 산타야나' },
    { text: '"역사는 승자의 것이 아니라, 기록하는 자의 것이다."', author: '— 윈스턴 처칠' },
    { text: '"한 권의 책은 전쟁의 결과를 바꿀 수 있다."', author: '— 나폴레옹 보나파르트' },
    { text: '"과거를 통제하는 자가 미래를 통제하고, 현재를 통제하는 자가 과거를 통제한다."', author: '— 조지 오웰, 『1984』' },
    { text: '"역사란 현재와 과거의 끝없는 대화이다."', author: '— E.H. 카' },
    { text: '"문서 없이는 역사도 없다."', author: '— 샤를 랑글루아 & 샤를 세뇨보' },
    { text: '"진실은 전쟁의 첫 번째 희생자다."', author: '— 아이스킬로스' },
    { text: '"기록되지 않은 것은 기억되지 않는다."', author: '— 격언' }
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

  // ── XSS 방지 ──
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // ── JSON 파일 동적 로드 ──
  // data 폴더에서 모든 JSON 파일을 로드
  const docFiles = [
    'treaty of westphalia',
    'treaty of versailles',
    'potsdam declaration',
    'emancipation proclamation',
    'churchills speech',
    'gettysburg address',
    'declaration of war 1914',
    'letters from iwo jima',
    'diary of anne frank',
    'the art of war excerpts',
    'geneva convention',
    'atlantic charter',
    'operation overlord order',
    'manhattan project memo',
    'hiroshima survivors testimony',
    'nuremberg trial records'
  ];

  // ── Load JSON Data ──
  Promise.all(
    docFiles.map(name =>
      fetch('/data/historical-sources/' + encodeURIComponent(name) + '.json')
        .then(res => {
          if (!res.ok) throw new Error('File not found: ' + name);
          return res.json();
        })
        .catch(() => null)
    )
  )
    .then(results => {
      documentsData = results.filter(d => d !== null);
      updatePageStats();
      renderAll();
    })
    .catch(err => {
      console.error('데이터 로드 실패:', err);
      shelfView.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:3rem;">데이터를 불러올 수 없습니다. back/data/historical-sources/ 폴더에 JSON 파일을 추가해 주세요.</p>';
    });

  // ── Update Page Stats ──
  function updatePageStats() {
    if (totalDocCount) totalDocCount.textContent = documentsData.length;
    const types = new Set(documentsData.map(d => d.type).filter(Boolean));
    if (totalTypeCount) totalTypeCount.textContent = types.size;
    const eras = new Set(documentsData.map(d => d.era).filter(Boolean));
    if (totalEraCount) totalEraCount.textContent = eras.size;
  }

  // ── Filter Logic ──
  function getFiltered() {
    return documentsData.filter(item => {
      const matchEra = activeEra === 'all' || item.era === activeEra;
      const matchType = activeType === 'all' || item.type === activeType;
      const matchSearch = !searchQuery ||
        (item.title && item.title.toLowerCase().includes(searchQuery)) ||
        (item.titleKr && item.titleKr.toLowerCase().includes(searchQuery)) ||
        (item.author && item.author.toLowerCase().includes(searchQuery)) ||
        (item.description && item.description.toLowerCase().includes(searchQuery)) ||
        (item.keywords && item.keywords.some(k => k.toLowerCase().includes(searchQuery)));
      return matchEra && matchType && matchSearch;
    });
  }

  // ── Render All ──
  function renderAll() {
    const filtered = getFiltered();

    if (resultCount) {
      resultCount.textContent = documentsData.length > 0
        ? '총 ' + filtered.length + '건의 사료'
        : '데이터 파일을 추가하면 사료가 표시됩니다.';
    }

    renderShelfView(filtered);
    renderCatalogView(filtered);
    updateScrollContainment(filtered.length);

    if (filtered.length === 0 && documentsData.length > 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
    }
  }

  // ── 독립 스크롤 영역 관리 ──
  function updateScrollContainment(count) {
    const threshold = 5;
    const views = [shelfView, catalogView];
    views.forEach(view => {
      if (!view) return;
      if (count >= threshold) {
        view.style.maxHeight = '78vh';
        view.style.overflowY = 'auto';
      } else {
        view.style.maxHeight = 'none';
        view.style.overflowY = 'visible';
      }
    });
    manageScrollFade(shelfView, count >= threshold && currentView === 'shelf');
    manageScrollFade(catalogView, count >= threshold && currentView === 'catalog');
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

  // ── Shelf View 렌더링 (책장 스타일) ──
  function renderShelfView(data) {
    shelfView.innerHTML = '';

    if (data.length === 0) return;

    // 유형별로 그룹핑하여 서가 행 구성
    const grouped = {};
    data.forEach(item => {
      const type = item.type || 'default';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(item);
    });

    // 유형 순서대로 서가 행 생성
    const typeOrder = ['treaty', 'declaration', 'speech', 'letter', 'diary', 'report', 'order', 'memoir'];
    const sortedTypes = Object.keys(grouped).sort((a, b) => {
      const ia = typeOrder.indexOf(a);
      const ib = typeOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    sortedTypes.forEach(type => {
      const items = grouped[type];

      // 서가 유형 헤더
      const header = document.createElement('div');
      header.className = 'shelf-type-header';
      header.innerHTML =
        '<span class="shelf-type-icon">' + (typeIcons[type] || '📄') + '</span>' +
        '<span class="shelf-type-label">' + escapeHTML(typeLabels[type] || type) + '</span>' +
        '<span class="shelf-type-count">' + items.length + '편</span>';
      shelfView.appendChild(header);

      // 서가 행 (책장 선반)
      const row = document.createElement('div');
      row.className = 'shelf-row';

      items.forEach(item => {
        const book = document.createElement('div');
        book.className = 'book-item';
        book.addEventListener('click', () => {
          window.location.href = 'Historical Sources & Documents detail.html?id=' + encodeURIComponent(item.id);
        });

        const spineType = item.type || 'default';
        const title = escapeHTML(item.titleKr || item.title || '제목 없음');
        const eraLabel = escapeHTML(eraLabels[item.era] || item.era || '');
        const typeLabel = escapeHTML(typeLabels[spineType] || spineType);
        const icon = typeIcons[spineType] || '📄';

        // 이미지가 있으면 표지 이미지, 없으면 유형별 색상 폴백
        let coverHTML;
        if (item.coverImage) {
          coverHTML =
            '<div class="book-cover book-cover--' + escapeHTML(spineType) + '">' +
              '<img src="' + escapeHTML(item.coverImage) + '" alt="' + title + '" loading="lazy" onerror="this.parentElement.innerHTML=\'<div class=book-cover-fallback><span>' + icon + '</span><span>' + title + '</span></div>\'">' +
              '<span class="book-cover-badge badge--' + escapeHTML(spineType) + '">' + typeLabel + '</span>' +
            '</div>';
        } else {
          coverHTML =
            '<div class="book-cover book-cover--' + escapeHTML(spineType) + '">' +
              '<div class="book-cover-fallback">' + icon + '<span>' + typeLabel + '</span></div>' +
            '</div>';
        }

        book.innerHTML =
          coverHTML +
          '<div class="book-label">' +
            '<div class="book-label-title">' + title + '</div>' +
            '<div class="book-label-era">' + eraLabel + '</div>' +
          '</div>';

        row.appendChild(book);
      });

      // 선반 그림자
      const shadow = document.createElement('div');
      shadow.className = 'shelf-row-shadow';
      row.appendChild(shadow);

      shelfView.appendChild(row);
    });
  }

  // ── Catalog View 렌더링 (도서 카드 목록) ──
  function renderCatalogView(data) {
    catalogView.innerHTML = '';
    const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * itemsPerPage;
    const pageData = data.slice(start, start + itemsPerPage);

    pageData.forEach(item => {
      const type = item.type || 'default';
      const card = document.createElement('div');
      card.className = 'catalog-card catalog-card--' + type;
      card.addEventListener('click', () => {
        window.location.href = 'Historical Sources & Documents detail.html?id=' + encodeURIComponent(item.id);
      });

      card.innerHTML =
        '<div class="catalog-card-header">' +
          '<span class="catalog-card-type type--' + escapeHTML(type) + '">' + escapeHTML(typeLabels[type] || type) + '</span>' +
          '<span class="catalog-card-era">' + escapeHTML(eraLabels[item.era] || item.era || '') + '</span>' +
        '</div>' +
        '<div class="catalog-card-body">' +
          '<h3 class="catalog-card-title">' + escapeHTML(item.titleKr || item.title || '제목 없음') + '</h3>' +
          (item.author ? '<div class="catalog-card-author">' + escapeHTML(item.author) + '</div>' : '') +
          '<p class="catalog-card-desc">' + escapeHTML(item.description || '') + '</p>' +
        '</div>' +
        '<div class="catalog-card-footer">' +
          (item.date ? '<span class="catalog-meta"><strong>날짜:</strong> ' + escapeHTML(item.date) + '</span>' : '') +
          (item.origin ? '<span class="catalog-meta"><strong>출처:</strong> ' + escapeHTML(item.origin) + '</span>' : '') +
          '<div class="catalog-card-tags">' +
            ((item.keywords || []).slice(0, 3).map(k => '<span class="catalog-tag">' + escapeHTML(k) + '</span>').join('')) +
          '</div>' +
        '</div>';

      catalogView.appendChild(card);
    });

    renderPagination(data.length, totalPages);
  }

  // ── 페이지네이션 렌더링 ──
  function renderPagination(totalItems, totalPages) {
    const pagination = document.getElementById('pagination');
    pagination.innerHTML = '';
    pagination.style.display = (currentView === 'catalog' && totalPages > 1) ? 'flex' : 'none';
    if (totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '◂';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => { currentPage--; renderAll(); scrollToCatalog(); });
    pagination.appendChild(prevBtn);

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => { currentPage = i; renderAll(); scrollToCatalog(); });
      pagination.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '▸';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => { currentPage++; renderAll(); scrollToCatalog(); });
    pagination.appendChild(nextBtn);
  }

  function scrollToCatalog() {
    catalogView.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  // ── Type Filter ──
  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      activeType = typeFilter.value;
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

      if (currentView === 'shelf') {
        shelfView.style.display = 'flex';
        catalogView.style.display = 'none';
        document.getElementById('pagination').style.display = 'none';
      } else {
        shelfView.style.display = 'none';
        catalogView.style.display = 'grid';
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

  document.querySelectorAll('.shelf-row, .catalog-card').forEach(el => {
    observer.observe(el);
  });
});
