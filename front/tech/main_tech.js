// ── War Archive - Main JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

  // ── Login State Management ──
  const loginBtn = document.getElementById('loginBtn');
  const userMenu = document.getElementById('userMenu');
  const userMenuToggle = document.getElementById('userMenuToggle');
  const userMenuName = document.getElementById('userMenuName');
  const userDropdown = document.getElementById('userDropdown');
  const logoutBtn = document.getElementById('logoutBtn');

  const currentUser = sessionStorage.getItem('warArchiveCurrentUser');
  if (currentUser) {
    const user = JSON.parse(currentUser);
    if (loginBtn) loginBtn.style.display = 'none';
    if (userMenu) {
      userMenu.style.display = 'block';
      if (userMenuName) userMenuName.textContent = user.username || user.email;
    }
  }

  if (userMenuToggle && userDropdown) {
    userMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      userDropdown.classList.toggle('open');
    });
    document.addEventListener('click', () => {
      userDropdown.classList.remove('open');
    });
    userDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('warArchiveCurrentUser');
      window.location.reload();
    });
  }

  // ── Mobile Menu Toggle ──
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    // Close menu when a nav link is clicked
    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        menuToggle.classList.remove('active');
      });
    });
  }

  // ── Scroll-based Fade-in Animation ──
  const fadeElements = document.querySelectorAll('.fade-in');

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.15
  };

  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  fadeElements.forEach(el => fadeObserver.observe(el));

  // ── Stat Counter Animation ──
  const statNumbers = document.querySelectorAll('.stat-number');

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNumbers.forEach(el => countObserver.observe(el));

  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    if (isNaN(target) || target === 0) return;

    const suffix = el.dataset.suffix || '';
    const duration = 2000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      const current = Math.floor(eased * target);
      el.textContent = current.toLocaleString() + suffix;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // ── 통계 바: search.json 기반 동적 카운트 ──
  function fetchSearchCount(url) {
    return fetch(url).then(r => r.json()).then(arr => arr.length).catch(() => 0);
  }

  var searchUrls = {
    war:     '../data/war overview data/search.json',
    bio:     '../data/biography of people data/search.json',
    weapons: '../data/weapons and equipment data/search.json',
    tactics: '../data/strategy and tactics data/search.json',
    docs:    '../data/Historical Sources & Documents data/search.json',
    battle:  '../data/Battlefield Map data/search.json'
  };

  Promise.all([
    fetchSearchCount(searchUrls.war),
    fetchSearchCount(searchUrls.bio),
    fetchSearchCount(searchUrls.weapons),
    fetchSearchCount(searchUrls.tactics),
    fetchSearchCount(searchUrls.docs),
    fetchSearchCount(searchUrls.battle)
  ]).then(function (counts) {
    var warCount     = counts[0];
    var bioCount     = counts[1];
    var weaponsCount = counts[2];
    var tacticsCount = counts[3];
    var docsCount    = counts[4];
    var battleCount  = counts[5];
    var totalDocs    = warCount + bioCount + weaponsCount + tacticsCount + docsCount + battleCount;

    function setStat(id, count, suffix) {
      var el = document.getElementById(id);
      if (!el) return;
      el.dataset.count = count;
      el.dataset.suffix = suffix;
      // 이미 뷰포트에 있으면 즉시 애니메이션
      animateCount(el);
    }

    setStat('statWarCount',    warCount,    '건');
    setStat('statDocCount',    totalDocs,   '건');
    setStat('statPeopleCount', bioCount,    '명');
    setStat('statBattleCount', battleCount, '건');
  });

  // ── War Overview 카드 건수 동적 로드 ──
  const countEl = document.getElementById('warOverviewCount');
  if (countEl) {
    fetch('../data/war overview data/search.json')
      .then(r => r.json())
      .then(list => { countEl.textContent = `${list.length}건의 기록`; })
      .catch(() => { countEl.textContent = '기록 로드 실패'; });
  }

  // ── 전쟁 연대기 동적 생성 (전쟁 개요 + 전장 지도 병합) ──
  const timelineContainer = document.getElementById('timelineContainer');
  if (timelineContainer) {
    // 날짜 문자열에서 정렬용 숫자 추출 (BC는 음수)
    function parseSortYear(str) {
      if (!str) return 9999;
      var s = str.replace(/[–—~]/g, '-');
      var bcMatch = s.match(/BC\s*(\d+)/i);
      if (bcMatch) return -parseInt(bcMatch[1], 10);
      var yearMatch = s.match(/(\d{3,4})/);
      return yearMatch ? parseInt(yearMatch[1], 10) : 9999;
    }

    // 표시용 연도 문자열 정리
    function formatPeriod(str) {
      if (!str) return '';
      return str.replace(/\s*–\s*/g, '–').replace(/\s*-\s*/g, '–');
    }

    var warOverviewIndex = fetch('../data/war overview data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return { source: 'war-overview', name: d.name, period: d.period, summary: d.summary, id: d.id };
        });
      })
      .catch(function () { return []; });

    var battlefieldIndex = fetch('../data/Battlefield Map data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return { source: 'battlefield', name: d.titleKr, period: d.date, summary: d.description, id: d.id };
        });
      })
      .catch(function () { return []; });

    Promise.all([warOverviewIndex, battlefieldIndex]).then(function (bothResults) {
      var items = bothResults[0].concat(bothResults[1]).filter(Boolean);

      // 중복 제거: 이름이 같은 항목은 하나만 유지 (전쟁 개요 우선)
      var seen = {};
      var unique = [];
      items.forEach(function (item) {
        var key = item.name.replace(/\s+/g, '').toLowerCase();
        if (!seen[key]) {
          seen[key] = true;
          unique.push(item);
        }
      });

      // 정렬 (시간순)
      unique.sort(function (a, b) {
        return parseSortYear(a.period) - parseSortYear(b.period);
      });

      // 렌더링
      var html = '';
      unique.forEach(function (item) {
        html += '<div class="timeline-item fade-in">';
        html += '  <div class="timeline-dot"></div>';
        html += '  <div class="timeline-content">';
        html += '    <div class="timeline-year">' + formatPeriod(item.period) + '</div>';
        html += '    <h3 class="timeline-title">' + item.name + '</h3>';
        html += '    <p class="timeline-desc">' + item.summary + '</p>';
        html += '  </div>';
        html += '</div>';
      });

      timelineContainer.innerHTML = html;

      // 새로 추가된 요소에 fade-in 옵저버 적용
      timelineContainer.querySelectorAll('.fade-in').forEach(function (el) {
        fadeObserver.observe(el);
      });
    });
  }

  // ── Biography 카드 건수 동적 로드 ──
  var bioCountEl = document.getElementById('biographyCount');
  if (bioCountEl) {
    fetch('../data/biography of people data/search.json')
      .then(r => r.json())
      .then(list => { bioCountEl.textContent = list.length + '명 수록'; })
      .catch(() => { bioCountEl.textContent = '로드 실패'; });
  }

  // ── Weapons & Equipment 카드 건수 동적 로드 ──
  var weaponsCountEl = document.getElementById('weaponsCount');
  if (weaponsCountEl) {
    fetch('../data/weapons and equipment data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (arr) {
        weaponsCountEl.textContent = arr.length + '건의 기록';
      }).catch(function () {
        weaponsCountEl.textContent = '기록 로드 실패';
      });
  }

  // ── Historical Sources & Documents 카드 건수 동적 로드 ──
  var hsCountEl = document.getElementById('historicalSourcesCount');
  if (hsCountEl) {
    fetch('../data/Historical Sources & Documents data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        hsCountEl.textContent = list.length + '건의 기록';
      }).catch(function () {
        hsCountEl.textContent = '기록 로드 실패';
      });
  }

  // ── Battlefield Map 카드 건수 동적 로드 ──
  var bmCountEl = document.getElementById('battlefieldMapCount');
  if (bmCountEl) {
    fetch('../data/Battlefield Map data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (list) {
        bmCountEl.textContent = list.length + '건의 기록';
      }).catch(function () {
        bmCountEl.textContent = '기록 로드 실패';
      });
  }

  // ── Header Background on Scroll ──
  const header = document.querySelector('.site-header');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }, { passive: true });

  // ── Smooth Scroll for Anchor Links ──
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ── Search Functionality ──
  const searchInput = document.querySelector('.search-box input');
  const searchBtn = document.querySelector('.search-box button');
  const searchTags = document.querySelectorAll('.search-tag');
  const searchResults = document.getElementById('searchResults');
  const searchResultsList = document.getElementById('searchResultsList');
  const searchResultsCount = document.getElementById('searchResultsCount');
  const searchResultsClose = document.getElementById('searchResultsClose');

  // 검색 인덱스 캐시
  let searchIndex = null;
  let searchIndexLoading = false;

  // search.json 기반 검색 인덱스 구축 (카테고리당 1회 fetch)
  function buildSearchIndex() {
    if (searchIndex) return Promise.resolve(searchIndex);
    if (searchIndexLoading) {
      return new Promise(function (resolve) {
        var check = setInterval(function () {
          if (searchIndex) { clearInterval(check); resolve(searchIndex); }
        }, 100);
      });
    }
    searchIndexLoading = true;

    var basePath = '../data/';

    // 각 카테고리의 search.json을 1회씩만 fetch
    var bioPromise = fetch(basePath + 'biography of people data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '인물',
            name: d.name || '',
            desc: d.title || d.summary || '',
            searchText: [d.name, d.title, d.role, d.nationality, d.summary, (d.tags || []).join(' '), (d.wars || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var battlePromise = fetch(basePath + 'Battlefield Map data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '전장지도',
            name: d.titleKr || d.title || '',
            desc: d.description || '',
            searchText: [d.title, d.titleKr, d.era, d.theater, d.description, (d.commanders || []).join(' '), (d.keywords || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var warPromise = fetch(basePath + 'war overview data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '전쟁개요',
            name: d.name || '',
            desc: d.summary || d.period || '',
            searchText: [d.name, d.era, d.region, d.period, d.summary, d.belligerents, (d.tags || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var docsPromise = fetch(basePath + 'Historical Sources & Documents data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '사료',
            name: d.titleKr || d.title || '',
            desc: d.description || '',
            searchText: [d.title, d.titleKr, d.type, d.era, d.author, d.description, (d.keywords || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var tacticsPromise = fetch(basePath + 'strategy and tactics data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '전략전술',
            name: d.titleKr || d.title || '',
            desc: d.description || '',
            searchText: [d.title, d.titleKr, d.era, d.category, d.description, d.keyFigure, (d.keywords || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var weaponsPromise = fetch(basePath + 'weapons and equipment data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '무기장비',
            name: d.name || '',
            desc: d.nameEn || d.category || '',
            searchText: [d.name, d.nameEn, d.category, d.era, d.origin, (d.tags || []).join(' '), d.overview || ''].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var undefinePromise = fetch(basePath + 'Undefine facts data/search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '미분류',
            name: d.name || '',
            desc: d.nameEn || d.summary || '',
            searchText: [d.name, d.nameEn, d.shelf, d.era, d.origin, d.summary, (d.tags || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    return Promise.all([bioPromise, battlePromise, warPromise, docsPromise, tacticsPromise, weaponsPromise, undefinePromise])
      .then(function (results) {
        searchIndex = [];
        results.forEach(function (arr) {
          arr.forEach(function (item) {
            if (item) searchIndex.push(item);
          });
        });
        searchIndexLoading = false;
        return searchIndex;
      });
  }

  // HTML 이스케이프
  function escSearchHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  if (searchBtn && searchInput) {
    searchBtn.addEventListener('click', function () {
      performSearch(searchInput.value.trim());
    });

    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        performSearch(searchInput.value.trim());
      }
    });
  }

  searchTags.forEach(function (tag) {
    tag.addEventListener('click', function () {
      if (searchInput) {
        searchInput.value = tag.textContent;
        performSearch(tag.textContent.trim());
      }
    });
  });

  if (searchResultsClose) {
    searchResultsClose.addEventListener('click', function () {
      searchResults.classList.remove('active');
    });
  }

  function performSearch(query) {
    if (!query) return;

    // 로딩 표시
    searchResults.classList.add('active');
    searchResultsCount.textContent = '';
    searchResultsList.innerHTML = '<div class="search-loading">검색 중...</div>';

    buildSearchIndex().then(function (index) {
      var lowerQuery = query.toLowerCase();
      var keywords = lowerQuery.split(/\s+/).filter(Boolean);

      var matched = index.filter(function (item) {
        var text = item.searchText.toLowerCase();
        return keywords.every(function (kw) {
          return text.indexOf(kw) !== -1;
        });
      });

      if (matched.length === 0) {
        searchResultsCount.textContent = '검색 결과 없음';
        searchResultsList.innerHTML = '<div class="search-no-result">\"' + escSearchHTML(query) + '\"에 대한 검색 결과가 없습니다.</div>';
        return;
      }

      searchResultsCount.textContent = matched.length + '건의 결과';

      var html = '';
      matched.forEach(function (item) {
        html += '<a class="search-result-item" href="' + escSearchHTML(item.url) + '">';
        html += '  <span class="search-result-category">' + escSearchHTML(item.category) + '</span>';
        html += '  <div class="search-result-info">';
        html += '    <div class="search-result-name">' + escSearchHTML(item.name) + '</div>';
        if (item.desc) {
          html += '    <div class="search-result-desc">' + escSearchHTML(item.desc.substring(0, 80)) + '</div>';
        }
        html += '  </div>';
        html += '  <span class="search-result-arrow">&#8250;</span>';
        html += '</a>';
      });

      searchResultsList.innerHTML = html;
    });
  }

  // ── Active Nav Highlight on Scroll ──
  const sections = document.querySelectorAll('section[id]');
  const navAnchors = document.querySelectorAll('.nav-links a[href^="#"]');

  window.addEventListener('scroll', () => {
    let current = '';
    sections.forEach(section => {
      const top = section.offsetTop - 100;
      if (window.scrollY >= top) {
        current = section.getAttribute('id');
      }
    });

    // 페이지 끝에 도달하면 마지막 섹션을 활성화
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 50) {
      current = sections[sections.length - 1].getAttribute('id');
    }

    navAnchors.forEach(a => {
      a.classList.remove('active');
      if (a.getAttribute('href') === '#' + current) {
        a.classList.add('active');
      }
    });
  }, { passive: true });

});
