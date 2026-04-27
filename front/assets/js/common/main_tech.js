// ── War Archive - Main JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

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
    war:     'data/search/war overview search.json',
    bio:     'data/search/biography of people search.json',
    weapons: 'data/search/weapons and equipment search.json',
    tactics: 'data/search/strategy and tactics search.json',
    docs:    'data/search/Historical Sources & Documents search.json',
    battle:  'data/search/Battlefield Map search.json'
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

  // ── 카드 메타데이터 헬퍼 ──
  // 시대 코드 → 한글 표기
  var ERA_LABELS = {
    ancient: '고대',
    medieval: '중세',
    earlymodern: '근세',
    early_modern: '근세',
    modern: '근대',
    worldwar: '세계대전',
    world_war: '세계대전',
    contemporary: '현대',
    coldwar: '냉전',
    cold_war: '냉전'
  };
  // 표기 순서 (정렬 기준)
  var ERA_ORDER = ['ancient','medieval','earlymodern','early_modern','modern','worldwar','world_war','coldwar','cold_war','contemporary'];
  var REGION_LABELS = {
    europe: '유럽', asia: '아시아', americas: '아메리카', africa: '아프리카',
    oceania: '오세아니아', middleeast: '중동', middle_east: '중동', global: '전지구'
  };

  function uniqueLabels(values, dict) {
    var seen = {};
    var out = [];
    values.forEach(function (v) {
      if (!v) return;
      var key = String(v).toLowerCase();
      var label = (dict && dict[key]) ? dict[key] : String(v);
      if (!seen[label]) { seen[label] = true; out.push({ key: key, label: label }); }
    });
    return out;
  }

  function rangeOrList(labels, orderKeys) {
    if (!labels.length) return '—';
    if (labels.length === 1) return labels[0].label;
    if (orderKeys && orderKeys.length) {
      // 정렬 후 양 끝만 표시 (시대 범위 표현)
      var sorted = labels.slice().sort(function (a, b) {
        var ai = orderKeys.indexOf(a.key); if (ai === -1) ai = 999;
        var bi = orderKeys.indexOf(b.key); if (bi === -1) bi = 999;
        return ai - bi;
      });
      return sorted[0].label + ' – ' + sorted[sorted.length - 1].label;
    }
    if (labels.length <= 3) return labels.map(function (x) { return x.label; }).join(' · ');
    return labels.slice(0, 3).map(function (x) { return x.label; }).join(' · ') + ' 외 ' + (labels.length - 3);
  }

  function setCardMeta(metaContainerId, fields) {
    var box = document.getElementById(metaContainerId);
    if (!box) return;
    Object.keys(fields).forEach(function (key) {
      var el = box.querySelector('[data-meta="' + key + '"]');
      if (el) el.textContent = fields[key];
    });
  }

  function setCardCount(elId, n, suffix) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = n.toLocaleString() + suffix;
  }

  // ── War Overview 카드 건수 + 메타데이터 ──
  fetch('data/search/war overview search.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      setCardCount('warOverviewCount', list.length, '건의 기록');
      var eras = uniqueLabels(list.map(function (d) { return d.era; }), ERA_LABELS);
      var regions = uniqueLabels(list.map(function (d) { return d.region; }), REGION_LABELS);
      setCardMeta('warOverviewMeta', {
        era: rangeOrList(eras, ERA_ORDER),
        region: rangeOrList(regions)
      });
    })
    .catch(function () {
      var el = document.getElementById('warOverviewCount');
      if (el) el.textContent = '기록 로드 실패';
    });

  // ── 전쟁 연대기 동적 생성 (전쟁 개요 + 전장 지도 병합) ──
  const timelineContainer = document.getElementById('timelineContainer');
  if (timelineContainer) {
    var timelineEmpty = document.getElementById('timelineEmpty');
    var timelineSummary = document.getElementById('timelineSummary');
    var TIMELINE_ERA_LABEL = {
      ancient: '고대', medieval: '중세', earlymodern: '근세',
      modern: '근대', worldwar: '세계대전', contemporary: '현대'
    };
    var TIMELINE_REGION_LABEL = {
      europe: '유럽', eastasia: '동아시아', asia: '아시아',
      americas: '아메리카', middleeast: '중동', africa: '아프리카',
      oceania: '오세아니아', global: '전 세계'
    };
    var TIMELINE_TYPE_LABEL = { war: '전쟁', battle: '전투' };

    // 날짜 문자열에서 정렬용 숫자 추출 (BC는 음수)
    function parseSortYear(str) {
      if (!str) return Number.POSITIVE_INFINITY;
      var s = String(str).replace(/[–—~]/g, '-');
      var bcMatch = s.match(/BC\s*(\d+)/i);
      if (bcMatch) return -parseInt(bcMatch[1], 10);
      var yearMatch = s.match(/(\d{3,4})/);
      return yearMatch ? parseInt(yearMatch[1], 10) : Number.POSITIVE_INFINITY;
    }

    // 표시용 연도 문자열 정리
    function formatPeriod(str) {
      if (!str) return '';
      return String(str).replace(/\s*–\s*/g, '–').replace(/\s*-\s*/g, '–');
    }

    function escHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function truncate(s, n) {
      s = String(s || '');
      return s.length > n ? s.slice(0, n - 1) + '…' : s;
    }

    var warOverviewIndex = fetch('data/search/war overview search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            type: 'war',
            id: d.id,
            name: d.name,
            period: d.period,
            summary: d.summary,
            era: d.era || '',
            region: d.region || '',
            location: d.location || '',
            result: d.result || '',
            resultType: d.resultType || '',
            url: d.url || ('pages/war overview/war overview detail.html?id=' + encodeURIComponent(d.id || ''))
          };
        });
      })
      .catch(function () { return []; });

    var battlefieldIndex = fetch('data/search/Battlefield Map search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            type: 'battle',
            id: d.id,
            name: d.titleKr || d.title,
            period: d.date,
            summary: d.description,
            era: d.era || '',
            region: d.theater || '',
            location: d.location || '',
            result: d.result || '',
            commanders: Array.isArray(d.commanders) ? d.commanders : [],
            url: d.url || ('pages/Battlefield Map/Battlefield Map detail.html?id=' + encodeURIComponent(d.id || ''))
          };
        });
      })
      .catch(function () { return []; });

    var bioIndex = fetch('data/search/biography of people search.json')
      .then(function (r) { return r.json(); })
      .then(function (list) { return Array.isArray(list) ? list : []; })
      .catch(function () { return []; });

    Promise.all([warOverviewIndex, battlefieldIndex, bioIndex]).then(function (results) {
      var wars = results[0];
      var battles = results[1];
      var bios = results[2];

      // 전쟁명 → 인물 목록 매핑
      var warToPeople = {};
      bios.forEach(function (p) {
        if (!Array.isArray(p.wars)) return;
        p.wars.forEach(function (w) {
          var key = String(w).replace(/\s+/g, '').toLowerCase();
          if (!warToPeople[key]) warToPeople[key] = [];
          warToPeople[key].push({
            name: p.name,
            url: 'pages/biography of people/biography of people detail.html?id=' + encodeURIComponent(p.id)
          });
        });
      });
      // 인물명 → URL 매핑 (전투 지휘관 매칭용)
      var bioByName = {};
      bios.forEach(function (p) {
        bioByName[p.name] = 'pages/biography of people/biography of people detail.html?id=' + encodeURIComponent(p.id);
      });

      function relatedForItem(item) {
        var related = [];
        var seen = {};
        if (item.type === 'war') {
          var key = String(item.name).replace(/\s+/g, '').toLowerCase();
          (warToPeople[key] || []).forEach(function (p) {
            if (!seen[p.name]) { seen[p.name] = 1; related.push(p); }
          });
        } else if (item.type === 'battle' && item.commanders) {
          item.commanders.forEach(function (cmdRaw) {
            // 콤마/슬래시로 구분된 지휘관 분리
            String(cmdRaw).split(/[,/·]| 및 /).forEach(function (part) {
              var nm = part.trim();
              if (!nm) return;
              // 정확 일치 우선, 없으면 부분 일치
              if (bioByName[nm] && !seen[nm]) {
                seen[nm] = 1;
                related.push({ name: nm, url: bioByName[nm] });
                return;
              }
              for (var bn in bioByName) {
                if (!bioByName.hasOwnProperty(bn)) continue;
                if (bn.indexOf(nm) >= 0 || nm.indexOf(bn) >= 0) {
                  if (!seen[bn]) {
                    seen[bn] = 1;
                    related.push({ name: bn, url: bioByName[bn] });
                  }
                  return;
                }
              }
            });
          });
        }
        return related.slice(0, 4);
      }

      // 전체 항목 합치기
      var all = wars.concat(battles).filter(function (x) { return x && x.name; });
      all.forEach(function (it) {
        it.year = parseSortYear(it.period);
        it.related = relatedForItem(it);
      });

      var state = { era: 'all', type: 'all', sort: 'asc' };

      function compareTimeline(a, b) {
        var diff = a.year - b.year;
        if (diff !== 0) return state.sort === 'desc' ? -diff : diff;
        return a.name.localeCompare(b.name, 'ko');
      }

      function render() {
        var filtered = all.filter(function (it) {
          if (state.era !== 'all' && it.era !== state.era) return false;
          if (state.type !== 'all' && it.type !== state.type) return false;
          return true;
        });
        filtered.sort(compareTimeline);

        if (timelineSummary) {
          var warCnt = filtered.filter(function (x) { return x.type === 'war'; }).length;
          var batCnt = filtered.filter(function (x) { return x.type === 'battle'; }).length;
          timelineSummary.textContent = '총 ' + filtered.length + '건 (전쟁 ' + warCnt + ' · 전투 ' + batCnt + ')';
        }

        if (!filtered.length) {
          timelineContainer.innerHTML = '';
          if (timelineEmpty) timelineEmpty.hidden = false;
          return;
        }
        if (timelineEmpty) timelineEmpty.hidden = true;

        var html = '';
        filtered.forEach(function (item) {
          var eraLabel = TIMELINE_ERA_LABEL[item.era] || '';
          var regionLabel = TIMELINE_REGION_LABEL[item.region] || '';
          var typeLabel = TIMELINE_TYPE_LABEL[item.type] || '';
          var typeClass = 'tl-type-' + item.type;
          var related = item.related || [];

          html += '<article class="timeline-item fade-in" data-type="' + item.type + '" data-era="' + item.era + '">';
          html += '  <div class="timeline-dot tl-dot-' + item.type + '"></div>';
          html += '  <div class="timeline-content">';
          html += '    <div class="timeline-meta-row">';
          html += '      <span class="tl-badge ' + typeClass + '">' + typeLabel + '</span>';
          if (eraLabel) html += '      <span class="tl-badge tl-era">' + eraLabel + '</span>';
          if (regionLabel) html += '      <span class="tl-badge tl-region">' + regionLabel + '</span>';
          if (item.result) {
            var rt = item.resultType || '';
            html += '      <span class="tl-badge tl-result tl-result-' + (rt || 'na') + '" title="결과">' + escHtml(truncate(item.result, 28)) + '</span>';
          }
          html += '    </div>';
          html += '    <div class="timeline-year">' + escHtml(formatPeriod(item.period)) + '</div>';
          html += '    <h3 class="timeline-title"><a href="' + escHtml(item.url) + '">' + escHtml(item.name) + '</a></h3>';
          if (item.location) {
            html += '    <p class="timeline-location">' + escHtml(item.location) + '</p>';
          }
          html += '    <p class="timeline-desc">' + escHtml(truncate(item.summary, 140)) + '</p>';
          if (related.length) {
            html += '    <div class="timeline-related"><span class="tl-related-label">관련 인물</span>';
            related.forEach(function (p) {
              html += '<a class="tl-person" href="' + escHtml(p.url) + '">' + escHtml(p.name) + '</a>';
            });
            html += '    </div>';
          }
          html += '    <a class="timeline-detail-link" href="' + escHtml(item.url) + '">상세 자료 →</a>';
          html += '  </div>';
          html += '</article>';
        });

        timelineContainer.innerHTML = html;
        timelineContainer.querySelectorAll('.fade-in').forEach(function (el) {
          fadeObserver.observe(el);
        });
      }

      // 필터 칩 이벤트
      document.querySelectorAll('.timeline-filter-group').forEach(function (group) {
        var key = group.getAttribute('data-filter');
        group.querySelectorAll('.timeline-chip').forEach(function (chip) {
          chip.addEventListener('click', function () {
            var v = chip.getAttribute('data-value');
            state[key] = v;
            group.querySelectorAll('.timeline-chip').forEach(function (c) {
              c.classList.toggle('active', c === chip);
            });
            render();
          });
        });
      });

      render();
    });
  }

  // ── Biography 카드 건수 + 메타데이터 ──
  fetch('data/search/biography of people search.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      setCardCount('biographyCount', list.length, '명 수록');
      var eras = uniqueLabels(list.map(function (d) { return d.era; }), ERA_LABELS);
      var nationalities = uniqueLabels(list.map(function (d) { return d.nationality; }));
      setCardMeta('biographyMeta', {
        era: rangeOrList(eras, ERA_ORDER),
        region: rangeOrList(nationalities)
      });
    })
    .catch(function () {
      var el = document.getElementById('biographyCount');
      if (el) el.textContent = '로드 실패';
    });

  // ── Weapons & Equipment 카드 건수 + 메타데이터 ──
  fetch('data/search/weapons and equipment search.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      setCardCount('weaponsCount', list.length, '건의 기록');
      var eras = uniqueLabels(list.map(function (d) { return d.era; }), ERA_LABELS);
      var categories = uniqueLabels(list.map(function (d) { return d.category; }));
      setCardMeta('weaponsMeta', {
        era: rangeOrList(eras, ERA_ORDER),
        region: rangeOrList(categories)
      });
    })
    .catch(function () {
      var el = document.getElementById('weaponsCount');
      if (el) el.textContent = '기록 로드 실패';
    });

  // ── Strategy & Tactics 카드 건수 + 메타데이터 ──
  fetch('data/search/strategy and tactics search.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      setCardCount('strategyTacticsCount', list.length, '건의 기록');
      var eras = uniqueLabels(list.map(function (d) { return d.era; }), ERA_LABELS);
      var categories = uniqueLabels(list.map(function (d) { return d.category; }));
      setCardMeta('strategyTacticsMeta', {
        era: rangeOrList(eras, ERA_ORDER),
        region: rangeOrList(categories)
      });
    })
    .catch(function () {
      var el = document.getElementById('strategyTacticsCount');
      if (el) el.textContent = '기록 로드 실패';
    });

  // ── Historical Sources & Documents 카드 건수 + 메타데이터 ──
  fetch('data/search/Historical Sources & Documents search.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      setCardCount('historicalSourcesCount', list.length, '건의 기록');
      var eras = uniqueLabels(list.map(function (d) { return d.era; }), ERA_LABELS);
      var types = uniqueLabels(list.map(function (d) { return d.type; }));
      setCardMeta('historicalSourcesMeta', {
        era: rangeOrList(eras, ERA_ORDER),
        region: rangeOrList(types)
      });
    })
    .catch(function () {
      var el = document.getElementById('historicalSourcesCount');
      if (el) el.textContent = '기록 로드 실패';
    });

  // ── Battlefield Map 카드 건수 + 메타데이터 ──
  fetch('data/search/Battlefield Map search.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      setCardCount('battlefieldMapCount', list.length, '건의 기록');
      var eras = uniqueLabels(list.map(function (d) { return d.era; }), ERA_LABELS);
      var theaters = uniqueLabels(list.map(function (d) { return d.theater; }));
      setCardMeta('battlefieldMapMeta', {
        era: rangeOrList(eras, ERA_ORDER),
        region: rangeOrList(theaters)
      });
    })
    .catch(function () {
      var el = document.getElementById('battlefieldMapCount');
      if (el) el.textContent = '기록 로드 실패';
    });

  // ── Undefine Facts 카드 건수 + 메타데이터 ──
  fetch('data/search/Undefine facts search.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      setCardCount('undefineCount', list.length, '건의 미확인 자료');
      var shelves = uniqueLabels(list.map(function (d) { return d.shelf; }));
      setCardMeta('undefineMeta', {
        region: rangeOrList(shelves)
      });
    })
    .catch(function () {
      var el = document.getElementById('undefineCount');
      if (el) el.textContent = '기록 로드 실패';
    });

  // ── 통계 기준일 표시 ──
  var statsUpdated = document.getElementById('statsUpdated');
  if (statsUpdated) {
    var d = new Date(document.lastModified || Date.now());
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    var iso = y + '-' + m + '-' + day;
    statsUpdated.setAttribute('datetime', iso);
    statsUpdated.textContent = iso;
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

    var basePath = 'data/';

    // ── 정규화 헬퍼: 지역/유형/신뢰도 ──
    function normEra(v) {
      if (!v) return '';
      var s = String(v).toLowerCase().replace(/[\s_-]/g, '');
      if (s === 'earlymodern') return 'earlymodern';
      if (s === 'worldwar' || s === 'worldwars' || s === 'ww1' || s === 'ww2') return 'worldwar';
      if (s === 'coldwar') return 'contemporary';
      return s; // ancient, medieval, modern, contemporary
    }
    // 연도 추출: 'BC 480' → -480, '1861 – 1865' → 1861, '1805년 12월 2일' → 1805
    function extractYear(str) {
      if (!str) return null;
      var s = String(str);
      var bc = s.match(/BC\s*(\d+)/i) || s.match(/\bB\.?C\.?\s*(\d+)/i) || s.match(/기원전\s*(\d+)/);
      if (bc) return -parseInt(bc[1], 10);
      var y = s.match(/(\d{3,4})/);
      return y ? parseInt(y[1], 10) : null;
    }
    // 국적/원산지 → 지역 코드
    var REGION_MAP = {
      // 동아시아
      '일본': 'eastasia', '조선': 'eastasia', '한국': 'eastasia',
      '몽골': 'eastasia', '베트남': 'eastasia', '중국': 'eastasia',
      '유럽 / 중국': 'eastasia',
      // 유럽
      '독일': 'europe', '나치 독일': 'europe', '프랑스': 'europe',
      '영국': 'europe', '잉글랜드 / 웨일스': 'europe', '잉글랜드': 'europe',
      '스파르타': 'europe', '마케도니아': 'europe', '로마': 'europe',
      '로마 공화국': 'europe', '카르타고': 'europe', '소련': 'europe',
      '유럽': 'europe',
      // 중동
      '쿠르드 / 아이유브 왕조': 'middleeast', '아이유브 왕조': 'middleeast',
      '오스만': 'middleeast', '페르시아': 'middleeast',
      // 아메리카
      '미국': 'americas',
      // 아프리카 (현재 데이터에는 없음 — 향후 대비)
      '이집트': 'africa', '에티오피아': 'africa'
    };
    function normRegion(v) {
      if (!v) return '';
      var raw = String(v).trim();
      var lower = raw.toLowerCase();
      // 영문 코드 그대로 매핑 (war overview / battlefield: europe, asia, americas, africa, middleeast, oceania, global)
      if (lower === 'asia') return 'eastasia';
      if (lower === 'middle_east' || lower === 'middleeast') return 'middleeast';
      if (lower === 'europe' || lower === 'americas' || lower === 'africa' || lower === 'oceania' || lower === 'global' || lower === 'eastasia') return lower;
      // 한글 매핑
      if (REGION_MAP[raw]) return REGION_MAP[raw];
      return 'global';
    }
    function credibilityFromShelf(shelf) {
      if (!shelf) return 'unverified';
      var s = String(shelf);
      if (s === 'Disputed Sources') return 'disputed';
      if (s === 'Oral Traditions' || s === 'Legends and Myths') return 'oral';
      return 'unverified'; // Unidentified Documents / Incomplete Records / Declassified Files / Data status
    }

    // 각 카테고리의 search.json을 1회씩만 fetch
    var bioPromise = fetch(basePath + 'search/biography of people search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '인물',
            type: 'bio',
            era: normEra(d.era),
            region: normRegion(d.nationality),
            credibility: 'verified',
            year: extractYear(d.birth) || extractYear(d.period) || null,
            name: d.name || '',
            desc: d.title || d.summary || '',
            searchText: [d.name, d.title, d.role, d.nationality, d.summary, (d.tags || []).join(' '), (d.wars || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var battlePromise = fetch(basePath + 'search/Battlefield Map search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '전장지도',
            type: 'battle',
            era: normEra(d.era),
            region: normRegion(d.theater),
            credibility: 'verified',
            year: extractYear(d.date),
            name: d.titleKr || d.title || '',
            desc: d.description || '',
            searchText: [d.title, d.titleKr, d.era, d.theater, d.description, (d.commanders || []).join(' '), (d.keywords || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var warPromise = fetch(basePath + 'search/war overview search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '전쟁개요',
            type: 'war',
            era: normEra(d.era),
            region: normRegion(d.region),
            credibility: 'verified',
            year: extractYear(d.period),
            name: d.name || '',
            desc: d.summary || d.period || '',
            searchText: [d.name, d.era, d.region, d.period, d.summary, d.belligerents, (d.tags || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var docsPromise = fetch(basePath + 'search/Historical Sources & Documents search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '사료',
            type: 'docs',
            era: normEra(d.era),
            region: normRegion(d.region || d.author),
            credibility: 'verified',
            year: extractYear(d.date) || extractYear(d.year),
            name: d.titleKr || d.title || '',
            desc: d.description || '',
            searchText: [d.title, d.titleKr, d.type, d.era, d.author, d.description, (d.keywords || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var tacticsPromise = fetch(basePath + 'search/strategy and tactics search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '전략전술',
            type: 'tactics',
            era: normEra(d.era),
            region: normRegion(d.region),
            credibility: 'verified',
            name: d.titleKr || d.title || '',
            desc: d.description || '',
            searchText: [d.title, d.titleKr, d.era, d.category, d.description, d.keyFigure, (d.keywords || []).join(' ')].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var weaponsPromise = fetch(basePath + 'search/weapons and equipment search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '무기장비',
            type: 'weapons',
            era: normEra(d.era),
            region: normRegion(d.origin),
            credibility: 'verified',
            name: d.name || '',
            desc: d.nameEn || d.category || '',
            searchText: [d.name, d.nameEn, d.category, d.era, d.origin, (d.tags || []).join(' '), d.overview || ''].join(' '),
            url: d.url
          };
        });
      }).catch(function () { return []; });

    var undefinePromise = fetch(basePath + 'search/Undefine facts search.json')
      .then(function (r) { return r.json(); })
      .then(function (items) {
        return items.map(function (d) {
          return {
            category: '미확인',
            type: 'undefine',
            era: normEra(d.era),
            region: normRegion(d.origin),
            credibility: credibilityFromShelf(d.shelf),
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

  // ── 라벨/순서 (탐색 + 검색 정렬 공용) ──
  var TYPE_LABELS = {
    war: '전쟁 개요', bio: '인물', battle: '전투', weapons: '무기',
    docs: '사료', tactics: '전략·전술', undefine: '미확인'
  };
  var REGION_LABELS_BROWSE = {
    eastasia: '동아시아', europe: '유럽', middleeast: '중동',
    americas: '아메리카', africa: '아프리카', oceania: '오세아니아', global: '전지구·기타'
  };
  var ERA_LABELS_BROWSE = {
    ancient: '고대', medieval: '중세', earlymodern: '근세',
    modern: '근대', worldwar: '세계대전', contemporary: '현대'
  };
  var ERA_RANK = { ancient: 1, medieval: 2, earlymodern: 3, modern: 4, worldwar: 5, contemporary: 6 };
  var CRED_LABELS = { verified: '검증됨', disputed: '논쟁 있음', unverified: '미확인', oral: '구전 자료' };
  var CRED_RANK = { verified: 1, disputed: 2, unverified: 3, oral: 4 };

  function compareItems(a, b, sortKey) {
    if (sortKey === 'name') {
      return (a.name || '').localeCompare(b.name || '', 'ko');
    }
    if (sortKey === 'year') {
      var ay = (a.year == null) ? Infinity : a.year;
      var by = (b.year == null) ? Infinity : b.year;
      if (ay !== by) return ay - by;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    }
    if (sortKey === 'era') {
      var ae = ERA_RANK[a.era] || 99, be = ERA_RANK[b.era] || 99;
      if (ae !== be) return ae - be;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    }
    if (sortKey === 'credibility') {
      var ac = CRED_RANK[a.credibility] || 99, bc = CRED_RANK[b.credibility] || 99;
      if (ac !== bc) return ac - bc;
      return (a.name || '').localeCompare(b.name || '', 'ko');
    }
    if (sortKey === 'type') {
      var at = a.type || '', bt = b.type || '';
      if (at !== bt) return at.localeCompare(bt);
      return (a.name || '').localeCompare(b.name || '', 'ko');
    }
    return 0;
  }

  // 현재 검색 상태 (정렬/리파인 공유)
  var currentSearchQuery = '';
  var currentSearchMatched = [];

  // HTML 이스케이프
  function escSearchHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // 검색어 하이라이트 (이스케이프된 텍스트에 <mark class="search-hl"> 적용)
  function highlightSearch(str, query) {
    var safe = escSearchHTML(str == null ? '' : String(str));
    if (!query) return safe;
    var tokens = String(query).trim().split(/\s+/).filter(function (t) { return t.length > 0; });
    if (!tokens.length) return safe;
    var escaped = tokens.map(function (t) {
      return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    var re = new RegExp('(' + escaped.join('|') + ')', 'gi');
    return safe.replace(re, '<mark class="search-hl">$1</mark>');
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

  // 검색 결과 정렬 변경
  var searchSortEl = document.getElementById('searchSort');
  if (searchSortEl) {
    searchSortEl.addEventListener('change', function () {
      renderSearchResults();
    });
  }

  function performSearch(query) {
    if (!query) return;

    currentSearchQuery = query;
    searchResults.classList.add('active');
    searchResultsCount.textContent = '';
    searchResultsList.innerHTML = '<div class="search-loading">검색 중...</div>';

    buildSearchIndex().then(function (index) {
      var lowerQuery = query.toLowerCase();
      var keywords = lowerQuery.split(/\s+/).filter(Boolean);

      currentSearchMatched = index.filter(function (item) {
        var text = item.searchText.toLowerCase();
        return keywords.every(function (kw) {
          return text.indexOf(kw) !== -1;
        });
      });

      renderSearchResultsRefine();
      renderSearchResults();
    });
  }

  // 결과 리파인 칩(카테고리별 분포) 렌더링
  function renderSearchResultsRefine() {
    var refineEl = document.getElementById('searchResultsRefine');
    if (!refineEl) return;
    if (!currentSearchMatched.length) { refineEl.hidden = true; refineEl.innerHTML = ''; return; }

    var counts = {};
    currentSearchMatched.forEach(function (it) {
      counts[it.type] = (counts[it.type] || 0) + 1;
    });
    var keys = Object.keys(counts);
    if (keys.length <= 1) { refineEl.hidden = true; refineEl.innerHTML = ''; return; }

    var html = '<span class="refine-label">유형별:</span>';
    html += '<button type="button" class="refine-chip active" data-type="">전체 ' + currentSearchMatched.length + '</button>';
    keys.sort().forEach(function (k) {
      html += '<button type="button" class="refine-chip" data-type="' + k + '">'
            + escSearchHTML(TYPE_LABELS[k] || k) + ' ' + counts[k] + '</button>';
    });
    refineEl.innerHTML = html;
    refineEl.hidden = false;

    refineEl.querySelectorAll('.refine-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        refineEl.querySelectorAll('.refine-chip').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderSearchResults();
      });
    });
  }

  function renderSearchResults() {
    if (!currentSearchMatched.length) {
      searchResultsCount.textContent = '검색 결과 없음';
      var refineEmpty = document.getElementById('searchResultsRefine');
      if (refineEmpty) { refineEmpty.hidden = true; refineEmpty.innerHTML = ''; }
      var suggestions = ['이순신', '나폴레옥', '노르만디', '제2차 세계대전', '한니발', '핵무기', '손자병법'];
      var sugHtml = '';
      suggestions.forEach(function (s) {
        sugHtml += '<button type="button" class="sug-chip" data-q="' + escSearchHTML(s) + '">' + escSearchHTML(s) + '</button>';
      });
      searchResultsList.innerHTML =
        '<div class="search-no-result">' +
        '  <p class="sug-title">"' + escSearchHTML(currentSearchQuery) + '"에 대한 결과가 없습니다.</p>' +
        '  <p class="sug-hint">철자를 확인하거나 다른 키워드로 시도해 보세요.</p>' +
        '  <div class="sug-list">' + sugHtml + '</div>' +
        '  <p class="sug-link"><a href="#browse">또는 탐색 필터로 자료 둘러보기 →</a></p>' +
        '</div>';
      searchResultsList.querySelectorAll('.sug-chip').forEach(function (b) {
        b.addEventListener('click', function () {
          var q = b.getAttribute('data-q');
          if (searchInput) searchInput.value = q;
          performSearch(q);
        });
      });
      return;
    }

    var refineEl = document.getElementById('searchResultsRefine');
    var activeType = refineEl && !refineEl.hidden
      ? (refineEl.querySelector('.refine-chip.active') || {}).dataset && (refineEl.querySelector('.refine-chip.active').dataset.type)
      : '';

    var list = currentSearchMatched.slice();
    if (activeType) list = list.filter(function (i) { return i.type === activeType; });

    var sortKey = searchSortEl ? searchSortEl.value : 'relevance';
    if (sortKey !== 'relevance') {
      list.sort(function (a, b) { return compareItems(a, b, sortKey); });
    }

    searchResultsCount.textContent = list.length + '건의 결과'
      + (list.length !== currentSearchMatched.length ? ' (전체 ' + currentSearchMatched.length + ')' : '');

    var html = '';
    list.forEach(function (item) {
      var credClass = 'cred-' + (item.credibility || 'verified');
      html += '<a class="search-result-item" href="' + escSearchHTML(item.url) + '">';
      html += '  <span class="search-result-category">' + escSearchHTML(item.category) + '</span>';
      html += '  <div class="search-result-info">';
      html += '    <div class="search-result-name">' + highlightSearch(item.name, currentSearchQuery) + '</div>';
      if (item.desc) {
        html += '    <div class="search-result-desc">' + highlightSearch(item.desc.substring(0, 80), currentSearchQuery) + '</div>';
      }
      html += '    <div class="search-result-meta">';
      if (item.era) html += '<span class="meta-pill">' + escSearchHTML(ERA_LABELS_BROWSE[item.era] || item.era) + '</span>';
      if (item.region) html += '<span class="meta-pill">' + escSearchHTML(REGION_LABELS_BROWSE[item.region] || item.region) + '</span>';
      html += '<span class="meta-pill ' + credClass + '">' + escSearchHTML(CRED_LABELS[item.credibility] || '검증됨') + '</span>';
      html += '    </div>';
      html += '  </div>';
      html += '  <span class="search-result-arrow">&#8250;</span>';
      html += '</a>';
    });

    searchResultsList.innerHTML = html;
  }

  // ─────────────────────────────────────────────────────
  // Browse / 탐색 (필터 + 정렬)
  // ─────────────────────────────────────────────────────
  var browseSection = document.getElementById('browse');
  if (browseSection) {
    var browseState = { era: '', region: '', type: '', credibility: '', keyword: '', sort: 'name', page: 1, perPage: 24 };
    var browseGrid = document.getElementById('browseGrid');
    var browseCount = document.getElementById('browseCount');
    var browseEmpty = document.getElementById('browseEmpty');
    var browsePagination = document.getElementById('browsePagination');
    var browseActiveFilters = document.getElementById('browseActiveFilters');
    var browseSortEl = document.getElementById('browseSort');
    var browseKeywordEl = document.getElementById('browseKeyword');
    var browseResetEl = document.getElementById('browseReset');

    // 칩 클릭 (필터 그룹별 단일 선택)
    browseSection.querySelectorAll('.browse-filter-group').forEach(function (group) {
      var key = group.getAttribute('data-filter');
      group.querySelectorAll('.browse-chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
          group.querySelectorAll('.browse-chip').forEach(function (c) { c.classList.remove('active'); });
          chip.classList.add('active');
          browseState[key] = chip.getAttribute('data-value') || '';
          browseState.page = 1;
          renderBrowse();
        });
      });
    });

    if (browseSortEl) {
      browseSortEl.addEventListener('change', function () {
        browseState.sort = browseSortEl.value;
        renderBrowse();
      });
    }
    if (browseKeywordEl) {
      var kwTimer;
      browseKeywordEl.addEventListener('input', function () {
        clearTimeout(kwTimer);
        kwTimer = setTimeout(function () {
          browseState.keyword = browseKeywordEl.value.trim().toLowerCase();
          browseState.page = 1;
          renderBrowse();
        }, 180);
      });
    }
    if (browseResetEl) {
      browseResetEl.addEventListener('click', function () {
        browseState = { era: '', region: '', type: '', credibility: '', keyword: '', sort: browseState.sort, page: 1, perPage: browseState.perPage };
        browseSection.querySelectorAll('.browse-filter-group').forEach(function (group) {
          group.querySelectorAll('.browse-chip').forEach(function (c, i) {
            c.classList.toggle('active', i === 0);
          });
        });
        if (browseKeywordEl) browseKeywordEl.value = '';
        renderBrowse();
      });
    }

    function applyBrowseFilters(items) {
      return items.filter(function (it) {
        if (browseState.era && it.era !== browseState.era) return false;
        if (browseState.region && it.region !== browseState.region) return false;
        if (browseState.type && it.type !== browseState.type) return false;
        if (browseState.credibility && it.credibility !== browseState.credibility) return false;
        if (browseState.keyword) {
          if (it.searchText.toLowerCase().indexOf(browseState.keyword) === -1) return false;
        }
        return true;
      });
    }

    function renderActiveFilters() {
      if (!browseActiveFilters) return;
      var chips = [];
      if (browseState.era) chips.push({ k: 'era', label: '시대: ' + (ERA_LABELS_BROWSE[browseState.era] || browseState.era) });
      if (browseState.region) chips.push({ k: 'region', label: '지역: ' + (REGION_LABELS_BROWSE[browseState.region] || browseState.region) });
      if (browseState.type) chips.push({ k: 'type', label: '유형: ' + (TYPE_LABELS[browseState.type] || browseState.type) });
      if (browseState.credibility) chips.push({ k: 'credibility', label: '신뢰도: ' + (CRED_LABELS[browseState.credibility] || browseState.credibility) });
      if (browseState.keyword) chips.push({ k: 'keyword', label: '"' + browseState.keyword + '"' });

      if (!chips.length) { browseActiveFilters.innerHTML = ''; return; }
      var html = '';
      chips.forEach(function (c) {
        html += '<button type="button" class="active-filter" data-key="' + c.k + '">'
              + escSearchHTML(c.label) + ' <span class="active-filter-x">×</span></button>';
      });
      browseActiveFilters.innerHTML = html;
      browseActiveFilters.querySelectorAll('.active-filter').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = btn.getAttribute('data-key');
          if (key === 'keyword') {
            browseState.keyword = '';
            if (browseKeywordEl) browseKeywordEl.value = '';
          } else {
            browseState[key] = '';
            var group = browseSection.querySelector('.browse-filter-group[data-filter="' + key + '"]');
            if (group) {
              group.querySelectorAll('.browse-chip').forEach(function (c, i) {
                c.classList.toggle('active', i === 0);
              });
            }
          }
          browseState.page = 1;
          renderBrowse();
        });
      });
    }

    function renderBrowse() {
      if (!browseGrid) return;
      buildSearchIndex().then(function (index) {
        var filtered = applyBrowseFilters(index);
        filtered.sort(function (a, b) { return compareItems(a, b, browseState.sort); });

        renderActiveFilters();

        if (browseCount) {
          browseCount.textContent = filtered.length.toLocaleString() + '건의 자료'
            + ' (전체 ' + index.length.toLocaleString() + '건 중)';
        }

        if (!filtered.length) {
          browseGrid.innerHTML = '';
          if (browseEmpty) browseEmpty.hidden = false;
          if (browsePagination) browsePagination.hidden = true;
          return;
        }
        if (browseEmpty) browseEmpty.hidden = true;

        // 페이지네이션
        var totalPages = Math.max(1, Math.ceil(filtered.length / browseState.perPage));
        if (browseState.page > totalPages) browseState.page = totalPages;
        var start = (browseState.page - 1) * browseState.perPage;
        var pageItems = filtered.slice(start, start + browseState.perPage);

        var html = '';
        pageItems.forEach(function (item) {
          var credClass = 'cred-' + (item.credibility || 'verified');
          html += '<a class="browse-card ' + credClass + '" href="' + escSearchHTML(item.url) + '">';
          html += '  <div class="browse-card-top">';
          html += '    <span class="browse-card-type">' + escSearchHTML(TYPE_LABELS[item.type] || item.category) + '</span>';
          html += '    <span class="browse-card-cred ' + credClass + '">' + escSearchHTML(CRED_LABELS[item.credibility] || '검증됨') + '</span>';
          html += '  </div>';
          html += '  <h3 class="browse-card-name">' + escSearchHTML(item.name) + '</h3>';
          if (item.desc) {
            var d = item.desc.length > 110 ? item.desc.substring(0, 110) + '…' : item.desc;
            html += '  <p class="browse-card-desc">' + escSearchHTML(d) + '</p>';
          }
          html += '  <div class="browse-card-meta">';
          if (item.era) html += '<span class="meta-pill">' + escSearchHTML(ERA_LABELS_BROWSE[item.era] || item.era) + '</span>';
          if (item.region) html += '<span class="meta-pill">' + escSearchHTML(REGION_LABELS_BROWSE[item.region] || item.region) + '</span>';
          html += '  </div>';
          html += '</a>';
        });
        browseGrid.innerHTML = html;

        // 페이지네이션 렌더
        if (browsePagination) {
          if (totalPages <= 1) {
            browsePagination.hidden = true;
            browsePagination.innerHTML = '';
          } else {
            var pHtml = '';
            pHtml += '<button type="button" class="page-btn" data-page="' + (browseState.page - 1) + '"' + (browseState.page === 1 ? ' disabled' : '') + '>‹ 이전</button>';
            pHtml += '<span class="page-info">' + browseState.page + ' / ' + totalPages + '</span>';
            pHtml += '<button type="button" class="page-btn" data-page="' + (browseState.page + 1) + '"' + (browseState.page === totalPages ? ' disabled' : '') + '>다음 ›</button>';
            browsePagination.innerHTML = pHtml;
            browsePagination.hidden = false;
            browsePagination.querySelectorAll('.page-btn').forEach(function (btn) {
              btn.addEventListener('click', function () {
                var p = parseInt(btn.getAttribute('data-page'), 10);
                if (!isNaN(p)) {
                  browseState.page = p;
                  renderBrowse();
                  browseGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              });
            });
          }
        }
      });
    }

    // 초기 렌더 (인덱스 로드 후)
    renderBrowse();
  }

  // ── Featured / 대표 자료 (Phase B) ──
  var featuredGrid = document.getElementById('featuredGrid');
  if (featuredGrid && typeof buildSearchIndex === 'function') {
    buildSearchIndex().then(function (items) {
      if (!items || !items.length) {
        featuredGrid.innerHTML = '<div class="featured-empty">표시할 자료가 없습니다.</div>';
        featuredGrid.removeAttribute('aria-busy');
        return;
      }
      // 카테고리별로 그룹핑 후 각 카테고리에서 1건씩 무작위 선택
      var byCat = {};
      items.forEach(function (it) {
        if (!byCat[it.type]) byCat[it.type] = [];
        byCat[it.type].push(it);
      });
      var picks = [];
      Object.keys(byCat).forEach(function (k) {
        var arr = byCat[k];
        var pick = arr[Math.floor(Math.random() * arr.length)];
        if (pick) picks.push(pick);
      });
      // 카테고리 우선 정렬: war, bio, weapons, tactics, docs, battle, undefine
      var order = { war: 1, bio: 2, weapons: 3, tactics: 4, docs: 5, battle: 6, undefine: 7 };
      picks.sort(function (a, b) { return (order[a.type] || 99) - (order[b.type] || 99); });

      var TYPE_LABEL = {
        war: '전쟁 개요', bio: '인물', battle: '전투 지도', weapons: '무기·장비',
        docs: '사료·문서', tactics: '전략·전술', undefine: '미확인 자료'
      };
      var ERA_LABEL = {
        ancient: '고대', medieval: '중세', earlymodern: '근세',
        modern: '근대', worldwar: '세계대전', contemporary: '현대'
      };
      var REGION_LABEL = {
        eastasia: '동아시아', europe: '유럽', middleeast: '중동',
        americas: '아메리카', africa: '아프리카', oceania: '오세아니아', global: '전지구·기타'
      };
      var CRED_VARIANT = {
        verified: { cls: 'is-verified', label: '검증' },
        disputed: { cls: 'is-disputed', label: '논쟁' },
        unverified: { cls: 'is-pending', label: '미확인' },
        oral: { cls: 'is-oral', label: '구전' }
      };

      function escHtml(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
      }

      var html = picks.map(function (it) {
        var cv = CRED_VARIANT[it.credibility] || CRED_VARIANT.verified;
        var meta = [];
        if (it.era) meta.push('<dt>시대</dt><dd>' + escHtml(ERA_LABEL[it.era] || it.era) + '</dd>');
        if (it.region) meta.push('<dt>지역</dt><dd>' + escHtml(REGION_LABEL[it.region] || it.region) + '</dd>');
        if (it.year) meta.push('<dt>연도</dt><dd>' + escHtml(it.year) + '</dd>');
        var desc = it.desc ? escHtml(String(it.desc).substring(0, 110)) : '';
        return '<a class="featured-card" href="' + escHtml(it.url) + '">'
          + '  <div class="featured-card-head">'
          + '    <span class="featured-cat">' + escHtml(TYPE_LABEL[it.type] || it.category || '') + '</span>'
          + '    <span class="trust-badge ' + cv.cls + '">' + cv.label + '</span>'
          + '  </div>'
          + '  <h3 class="featured-title">' + escHtml(it.name) + '</h3>'
          + (desc ? '  <p class="featured-desc">' + desc + '</p>' : '')
          + (meta.length ? '  <dl class="featured-meta">' + meta.join('') + '</dl>' : '')
          + '  <span class="featured-go" aria-hidden="true">자료 보기 →</span>'
          + '</a>';
      }).join('');
      featuredGrid.innerHTML = html;
      featuredGrid.removeAttribute('aria-busy');
    }).catch(function () {
      featuredGrid.innerHTML = '<div class="featured-empty">자료를 불러오지 못했습니다.</div>';
      featuredGrid.removeAttribute('aria-busy');
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
