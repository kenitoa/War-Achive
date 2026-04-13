// ── War Archive - Undefine Facts (미확인 자료집) JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

  // ── Mobile Menu Toggle ──
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        menuToggle.classList.remove('active');
      });
    });
  }

  // ── Header scroll effect ──
  const header = document.querySelector('.site-header');

  function onScroll() {
    const scrollY = window.scrollY;
    if (scrollY > 80) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Reveal on scroll ──
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '0px 0px -80px 0px',
    threshold: 0.12
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // ── Dust Particles — 창고 먼지 효과 ──
  const dustContainer = document.getElementById('dustParticles');

  if (dustContainer) {
    const particleCount = 30;

    for (let i = 0; i < particleCount; i++) {
      const dust = document.createElement('div');
      dust.classList.add('dust');

      const size = Math.random() * 3 + 1;
      dust.style.width = size + 'px';
      dust.style.height = size + 'px';
      dust.style.left = Math.random() * 100 + '%';
      dust.style.top = Math.random() * 100 + '%';
      dust.style.animationDuration = (Math.random() * 8 + 6) + 's';
      dust.style.animationDelay = (Math.random() * 5) + 's';
      dust.style.opacity = Math.random() * 0.4 + 0.1;

      dustContainer.appendChild(dust);
    }
  }

  // ── Shelf card hover — 나무 삐걱 효과 (subtle transform) ──
  const shelfCards = document.querySelectorAll('.shelf-card');

  shelfCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
      const randomRotate = (Math.random() - 0.5) * 0.5;
      card.style.transform = `translateY(-3px) rotate(${randomRotate}deg)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });

  // ── Bookshelf Inline Popup (3x3 grid) ──
  const DATA_BASE = '../../../back/data/Undefine facts data';
  const ITEMS_PER_PAGE = 9; // 3x3 grid

  // Per-book state
  const bookState = new Map();

  // Fetch index once and cache
  let indexCache = null;
  async function getIndex() {
    if (indexCache) return indexCache;
    const res = await fetch(`${DATA_BASE}/index.json`);
    indexCache = await res.json();
    return indexCache;
  }

  // Load items for a shelf
  async function loadShelfItems(shelfId) {
    const index = await getIndex();
    const shelf = index[shelfId];
    if (!shelf || !shelf.items || shelf.items.length === 0) return [];

    const promises = shelf.items.map(async (itemId) => {
      try {
        const res = await fetch(`${DATA_BASE}/${encodeURIComponent(shelfId)}/${encodeURIComponent(itemId)}.json`);
        return await res.json();
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter(Boolean);
  }

  // Render credibility dots
  function renderCredibility(level) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += `<div class="cred-dot ${i <= level ? 'filled' : ''}"></div>`;
    }
    return html;
  }

  // Render page into a book's popup grid
  function renderBookPage(book) {
    const state = bookState.get(book);
    if (!state) return;

    const grid = book.querySelector('.popup-grid');
    const empty = book.querySelector('.popup-empty');
    const pageInfo = book.querySelector('.popup-page-info');
    const prevBtn = book.querySelector('.popup-prev');
    const nextBtn = book.querySelector('.popup-next');

    const start = state.page * ITEMS_PER_PAGE;
    const pageItems = state.items.slice(start, start + ITEMS_PER_PAGE);

    if (pageItems.length === 0) {
      grid.style.display = 'none';
      empty.style.display = 'flex';
    } else {
      grid.style.display = 'grid';
      empty.style.display = 'none';

      grid.innerHTML = pageItems.map(item => `
        <a class="popup-card" href="Undefine detail.html?shelf=${encodeURIComponent(item.shelf)}&id=${encodeURIComponent(item.id)}">
          <div class="card-era">${item.era || '미상'}</div>
          <div class="card-name">${item.name}</div>
          <div class="card-summary">${item.summary || ''}</div>
          <div class="card-meta">
            <span class="card-origin">${item.origin || '미상'}</span>
            <div class="card-credibility">
              ${renderCredibility(item.credibility || 0)}
            </div>
          </div>
        </a>
      `).join('');
    }

    pageInfo.textContent = state.totalPages > 0 ? `${state.page + 1} / ${state.totalPages}` : '0 / 0';
    prevBtn.disabled = state.page <= 0;
    nextBtn.disabled = state.page >= state.totalPages - 1;
  }

  // Close all open popups
  function closeAllPopups() {
    document.querySelectorAll('.book.popup-open').forEach(b => {
      b.classList.remove('popup-open');
    });
  }

  // Open popup for a specific book
  async function openBookPopup(book) {
    const shelfId = book.dataset.shelf;

    // Close others first
    closeAllPopups();

    // Show popup
    book.classList.add('popup-open');

    // Load data if not cached
    if (!bookState.has(book)) {
      const items = await loadShelfItems(shelfId);
      bookState.set(book, {
        items,
        page: 0,
        totalPages: Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE))
      });
    }

    renderBookPage(book);
  }

  // Book click handlers
  document.querySelectorAll('.book[data-shelf]').forEach(book => {
    book.addEventListener('click', (e) => {
      e.stopPropagation();

      // If already open, close
      if (book.classList.contains('popup-open')) {
        book.classList.remove('popup-open');
        return;
      }

      openBookPopup(book);
    });

    // Pagination buttons
    const prevBtn = book.querySelector('.popup-prev');
    const nextBtn = book.querySelector('.popup-next');
    const closeBtn = book.querySelector('.popup-close');

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const state = bookState.get(book);
        if (state && state.page > 0) {
          state.page--;
          renderBookPage(book);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const state = bookState.get(book);
        if (state && state.page < state.totalPages - 1) {
          state.page++;
          renderBookPage(book);
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        book.classList.remove('popup-open');
      });
    }
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.book')) {
      closeAllPopups();
    }
  });

  // ESC key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllPopups();
    }
  });

  // ── Status Board — 자료 현황 동적 렌더링 ──
  const STATUS_BASE = '../../../back/data/Undefine facts data/Data status';
  const STATUS_CYCLE = ['대기', '검토 중', '검증 중', '완료'];
  const STATUS_CLASS = {
    '대기': 'tag-waiting',
    '검토 중': 'tag-review',
    '검증 중': 'tag-verify',
    '완료': 'tag-complete'
  };

  const CATEGORY_ORDER = [
    'Unidentified Documents',
    'Oral Traditions',
    'Disputed Sources',
    'Legends and Myths',
    'Incomplete Records',
    'Declassified Files'
  ];

  const CATEGORY_NAMES = {
    'Unidentified Documents': '출처 미상 문서',
    'Oral Traditions': '구전 사료',
    'Disputed Sources': '논쟁 중인 사료',
    'Legends and Myths': '전설 & 신화',
    'Incomplete Records': '미완성 기록',
    'Declassified Files': '기밀 해제 자료'
  };

  async function loadStatusBoard() {
    const statusBoard = document.getElementById('statusBoard');
    if (!statusBoard) return;

    let statusData;
    try {
      const res = await fetch(`${STATUS_BASE}/status-index.json`);
      if (!res.ok) throw new Error();
      statusData = await res.json();
    } catch {
      return;
    }

    // Count items per category + collect item details
    const counts = {};
    const categoryItems = {};
    CATEGORY_ORDER.forEach(cat => { counts[cat] = 0; categoryItems[cat] = []; });

    if (statusData.items && statusData.items.length > 0) {
      for (const itemFile of statusData.items) {
        try {
          const res = await fetch(`${STATUS_BASE}/${encodeURIComponent(itemFile)}.json`);
          if (!res.ok) continue;
          const item = await res.json();
          if (item.category && counts.hasOwnProperty(item.category)) {
            counts[item.category]++;
            categoryItems[item.category].push(item);
          }
        } catch { /* skip */ }
      }
    }

    // Render rows
    CATEGORY_ORDER.forEach(catKey => {
      const catInfo = statusData.categories[catKey];
      if (!catInfo) return;

      const currentStatus = catInfo.status || '대기';
      const count = counts[catKey];
      const tagClass = STATUS_CLASS[currentStatus] || 'tag-waiting';
      const items = categoryItems[catKey];

      // Build tooltip items HTML
      const tooltipContent = items.length > 0
        ? items.map(item => `
            <div class="status-tooltip-item">
              <span class="tooltip-item-name">${item.name}</span>
              <span class="tooltip-item-date">${item.dateAdded || '—'}</span>
            </div>
          `).join('')
        : '<div class="status-tooltip-empty">등록된 자료 없음</div>';

      const row = document.createElement('div');
      row.className = 'status-row';
      row.innerHTML = `
        <div class="status-cell status-category-cell" data-category="${catKey}">
          <span class="category-label">${CATEGORY_NAMES[catKey]}</span>
          <div class="status-tooltip">
            <div class="status-tooltip-header">
              <span class="tooltip-cat-name">${CATEGORY_NAMES[catKey]}</span>
              <span class="tooltip-cat-en">${catKey}</span>
            </div>
            <div class="status-tooltip-body">
              ${tooltipContent}
            </div>
            <div class="status-tooltip-footer">총 ${items.length}건</div>
          </div>
        </div>
        <div class="status-cell count-cell">${count > 0 ? count : '—'}</div>
        <div class="status-cell">
          <button class="tag ${tagClass} status-toggle-btn" data-category="${catKey}" data-status="${currentStatus}">
            ${currentStatus}
          </button>
        </div>
      `;
      statusBoard.appendChild(row);
    });

    // Status toggle click handlers
    statusBoard.querySelectorAll('.status-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const current = btn.dataset.status;
        const idx = STATUS_CYCLE.indexOf(current);
        const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];

        btn.dataset.status = next;
        btn.textContent = next;
        btn.className = `tag ${STATUS_CLASS[next] || 'tag-waiting'} status-toggle-btn`;

        // Update in-memory statusData and save to localStorage for persistence
        const catKey = btn.dataset.category;
        if (statusData.categories[catKey]) {
          statusData.categories[catKey].status = next;
        }
        localStorage.setItem('war-archive-status', JSON.stringify(statusData.categories));
      });
    });

    // Restore saved statuses from localStorage
    const saved = localStorage.getItem('war-archive-status');
    if (saved) {
      try {
        const savedCats = JSON.parse(saved);
        statusBoard.querySelectorAll('.status-toggle-btn').forEach(btn => {
          const catKey = btn.dataset.category;
          if (savedCats[catKey] && savedCats[catKey].status) {
            const savedStatus = savedCats[catKey].status;
            btn.dataset.status = savedStatus;
            btn.textContent = savedStatus;
            btn.className = `tag ${STATUS_CLASS[savedStatus] || 'tag-waiting'} status-toggle-btn`;
          }
        });
      } catch { /* ignore */ }
    }
  }

  loadStatusBoard();

});
