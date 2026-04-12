/* ============================================================
   Battlefield Map Detail – JavaScript
   ============================================================ */
(function () {
  'use strict';

  // ── 라벨 ──
  const eraLabels = {
    ancient: '고대', medieval: '중세', earlymodern: '근세',
    modern: '근대', worldwar: '세계대전', contemporary: '현대'
  };
  const theaterLabels = {
    europe: '유럽', asia: '아시아', mediterranean: '지중해',
    pacific: '태평양', 'middle-east': '중동', americas: '아메리카'
  };

  // ── JSON 파일 목록 (리스트 페이지와 동일) ──
  const mapFiles = [
    'battle of thermopylae', 'battle of cannae', 'battle of gaugamela',
    'battle of hansando', 'battle of austerlitz', 'battle of gettysburg',
    'battle of stalingrad', 'normandy landings', 'battle of midway',
    'battle of incheon', 'battle of marathon', 'battle of agincourt',
    'battle of lepanto', 'battle of waterloo', 'battle of trafalgar',
    'battle of the somme', 'battle of kursk', 'battle of britain',
    'siege of constantinople', 'battle of dien bien phu'
  ];

  const romanNumerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

  let allBattles = [];

  // ── XSS 방지 ──
  function escapeHTML(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // ── URL 파라미터에서 id 추출 ──
  function getBattleId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  // ── AR HUD 오버레이 생성 ──
  function createDetailARHUD() {
    // HUD 코너 브라켓
    var overlay = document.createElement('div');
    overlay.className = 'ar-hud-overlay';
    ['tl', 'tr', 'bl', 'br'].forEach(function (pos) {
      var corner = document.createElement('div');
      corner.className = 'hud-corner ' + pos;
      overlay.appendChild(corner);
    });
    document.body.appendChild(overlay);

    // HUD 상단 바
    var topbar = document.createElement('div');
    topbar.className = 'ar-hud-topbar';
    topbar.innerHTML =
      '<div class="hud-indicator"><span class="hud-dot"></span> AR DETAIL</div>' +
      '<div class="hud-indicator"><span class="hud-dot amber"></span> ARCHIVE</div>' +
      '<div class="hud-indicator">SYS:ONLINE</div>' +
      '<div class="hud-indicator" id="hudDetailTime"></div>';
    document.body.appendChild(topbar);

    // 데이터 리드아웃
    var readout = document.createElement('div');
    readout.className = 'ar-data-readout';
    readout.id = 'arDetailReadout';
    readout.innerHTML =
      '<span class="readout-line"><span class="readout-label">MODE: </span><span class="readout-value">DETAIL VIEW</span></span>' +
      '<span class="readout-line"><span class="readout-label">STATUS: </span><span class="readout-value">ANALYZING</span></span>' +
      '<span class="readout-line"><span class="readout-label">TARGET: </span><span class="readout-value" id="readoutTarget">—</span></span>';
    document.body.appendChild(readout);

    // 시계 업데이트
    function tick() {
      var el = document.getElementById('hudDetailTime');
      if (el) {
        var now = new Date();
        el.textContent = String(now.getHours()).padStart(2, '0') + ':' +
          String(now.getMinutes()).padStart(2, '0') + ':' +
          String(now.getSeconds()).padStart(2, '0') + ' KST';
      }
    }
    tick();
    setInterval(tick, 1000);
  }

  createDetailARHUD();

  // ── 초기화 ──
  function init() {
    const battleId = getBattleId();
    if (!battleId) { showError(); return; }

    Promise.all(
      mapFiles.map(function (name) {
        return fetch('../../data/Battlefield Map data/' + encodeURIComponent(name) + '.json')
          .then(function (res) { return res.ok ? res.json() : null; })
          .catch(function () { return null; });
      })
    ).then(function (results) {
      allBattles = results.filter(Boolean);
      var data = allBattles.find(function (d) { return d.id === battleId; });
      if (!data) { showError(); return; }
      renderDocument(data);
    }).catch(function () { showError(); });
  }

  function showError() {
    var loading = document.getElementById('loading');
    var errorState = document.getElementById('errorState');
    if (loading) loading.style.display = 'none';
    if (errorState) errorState.style.display = 'block';
  }

  // ── 전체 렌더링 ──
  function renderDocument(data) {
    document.title = escapeHTML(data.titleKr || data.title) + ' — War Archive';

    // 로딩 숨기고 문서 표시
    document.getElementById('loading').style.display = 'none';
    document.getElementById('document').style.display = 'block';

    // 빵부스러기
    document.getElementById('breadcrumbTitle').textContent = data.titleKr || data.title;

    // 뱃지
    var eraBadge = document.getElementById('docEraBadge');
    eraBadge.textContent = eraLabels[data.era] || data.era || '';
    eraBadge.style.display = data.era ? '' : 'none';

    var theaterBadge = document.getElementById('docTheaterBadge');
    theaterBadge.textContent = theaterLabels[data.theater] || data.theater || '';
    theaterBadge.style.display = data.theater ? '' : 'none';

    // 제목
    document.getElementById('docTitle').textContent = data.titleKr || data.title;
    document.getElementById('docSubtitle').textContent = data.title || '';

    // 메타 정보
    document.getElementById('docDate').textContent = data.date || '';
    document.getElementById('docLocation').textContent = data.location || '';
    document.getElementById('docCommanders').textContent =
      Array.isArray(data.commanders) ? data.commanders.join(' vs ') : (data.commanders || '');
    document.getElementById('docResult').textContent = data.result || '';

    // 교전 병력 / 피해
    renderForces(data);

    // 지형
    var terrainEl = document.getElementById('docTerrain');
    if (data.terrain) {
      terrainEl.style.display = '';
      document.getElementById('terrainValue').textContent = data.terrain;
    } else {
      terrainEl.style.display = 'none';
    }

    // 키워드
    renderKeywords(data.keywords);

    // 인포박스
    renderInfoBox(data.infoBox);

    // 섹션
    renderSections(data.sections);

    // 이미지 갤러리
    renderImageGallery(data.images);

    // 관련 전투
    renderRelated(data.relatedBattles);

    // 스크롤 스파이 & 라이트박스
    initScrollSpy();
    initLightbox();

    // AR 리드아웃 업데이트
    var readoutTarget = document.getElementById('readoutTarget');
    if (readoutTarget) readoutTarget.textContent = data.titleKr || data.title || '—';
  }

  // ── 교전 병력 / 피해 ──
  function renderForces(data) {
    var container = document.getElementById('docForces');
    var forcesList = document.getElementById('forcesList');
    var casualtiesList = document.getElementById('casualtiesList');

    var hasForces = Array.isArray(data.forces) && data.forces.length;
    var hasCasualties = Array.isArray(data.casualties) && data.casualties.length;

    if (!hasForces && !hasCasualties) { container.style.display = 'none'; return; }

    container.style.display = '';
    forcesList.innerHTML = hasForces
      ? data.forces.map(function (f) { return '<span>' + escapeHTML(f) + '</span>'; }).join('')
      : '<span>정보 없음</span>';
    casualtiesList.innerHTML = hasCasualties
      ? data.casualties.map(function (c) { return '<span>' + escapeHTML(c) + '</span>'; }).join('')
      : '<span>정보 없음</span>';
  }

  // ── 키워드 ──
  function renderKeywords(keywords) {
    var container = document.getElementById('docKeywords');
    if (!Array.isArray(keywords) || !keywords.length) { container.style.display = 'none'; return; }
    container.innerHTML = keywords.map(function (kw) {
      return '<span class="keyword-tag">' + escapeHTML(kw) + '</span>';
    }).join('');
  }

  // ── 인포박스 ──
  function renderInfoBox(infoBox) {
    var box = document.getElementById('infoBox');
    var list = document.getElementById('infoBoxList');
    if (!infoBox || typeof infoBox !== 'object') { box.style.display = 'none'; return; }

    var fieldLabels = {
      type: '유형', theater: '전역', duration: '기간',
      terrain: '지형', keyWeapon: '주요 병기', outcome: '결과', legacy: '역사적 의의'
    };

    var html = '';
    Object.keys(infoBox).forEach(function (key) {
      if (infoBox[key]) {
        html += '<dt>' + escapeHTML(fieldLabels[key] || key) + '</dt>';
        html += '<dd>' + escapeHTML(infoBox[key]) + '</dd>';
      }
    });
    list.innerHTML = html;
  }

  // ── 섹션 렌더링 ──
  function renderSections(sections) {
    var content = document.getElementById('docContent');
    var tocList = document.getElementById('tocList');
    if (!Array.isArray(sections) || !sections.length) return;

    var contentHTML = '';
    var tocHTML = '';

    sections.forEach(function (sec, i) {
      var sectionId = 'section-' + i;
      var numeral = romanNumerals[i] || (i + 1);

      contentHTML +=
        '<section class="doc-section" id="' + sectionId + '">' +
          '<div class="section-number">SECTION ' + numeral + '</div>' +
          '<h2 class="section-title">' + escapeHTML(sec.title) + '</h2>' +
          '<div class="section-body">' + formatContent(sec.content) + '</div>' +
        '</section>';

      tocHTML +=
        '<li><a href="#' + sectionId + '" data-target="' + sectionId + '">' +
          escapeHTML(sec.title) +
        '</a></li>';
    });

    content.innerHTML = contentHTML;
    tocList.innerHTML = tocHTML;
  }

  function formatContent(text) {
    if (!text) return '';
    return text.split('\n').filter(Boolean).map(function (p) {
      return '<p>' + escapeHTML(p.trim()) + '</p>';
    }).join('');
  }

  // ── 이미지 갤러리 ──
  function renderImageGallery(images) {
    var gallery = document.getElementById('imageGallery');
    var grid = document.getElementById('imageGalleryGrid');
    var divider = document.getElementById('imageGalleryDivider');
    if (!Array.isArray(images) || !images.length) {
      gallery.style.display = 'none';
      if (divider) divider.style.display = 'none';
      return;
    }

    gallery.style.display = '';
    grid.innerHTML = images.map(function (img, idx) {
      return '<div class="image-gallery-item" data-src="' + escapeHTML(img.url) + '" data-caption="' + escapeHTML(img.caption) + '" data-source="' + escapeHTML(img.source || '') + '" data-index="' + idx + '">' +
        '<div class="ar-image-wrap">' +
          '<img src="' + escapeHTML(img.url) + '" alt="' + escapeHTML(img.caption) + '" loading="lazy">' +
          '<div class="ar-image-scan"></div>' +
          '<div class="ar-bracket tl"></div><div class="ar-bracket tr"></div>' +
          '<div class="ar-bracket bl"></div><div class="ar-bracket br"></div>' +
          '<div class="ar-image-status">AR SCAN</div>' +
          '<div class="ar-image-coords">IMG-' + String(idx + 1).padStart(3, '0') + '</div>' +
        '</div>' +
        '<div class="image-gallery-caption">' +
          '<p>' + escapeHTML(img.caption) + '</p>' +
          (img.source ? '<span class="image-source">' + escapeHTML(img.source) + '</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    // 갤러리 아이템 3D 틸트
    grid.querySelectorAll('.ar-image-wrap').forEach(function (wrap) {
      wrap.addEventListener('mousemove', function (e) {
        var rect = wrap.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        wrap.style.transform = 'rotateY(' + (x * 12) + 'deg) rotateX(' + (-y * 12) + 'deg) scale(1.02)';
      });
      wrap.addEventListener('mouseleave', function () {
        wrap.style.transform = '';
      });
    });
  }

  // ── 관련 전투 ──
  function renderRelated(relatedIds) {
    var section = document.getElementById('relatedSection');
    var grid = document.getElementById('relatedGrid');
    if (!Array.isArray(relatedIds) || !relatedIds.length) { section.style.display = 'none'; return; }

    var relatedData = relatedIds.map(function (rid) {
      return allBattles.find(function (b) { return b.id === rid; });
    }).filter(Boolean);

    if (!relatedData.length) { section.style.display = 'none'; return; }

    section.style.display = '';
    grid.innerHTML = relatedData.map(function (b) {
      return '<a class="related-card" href="Battlefield Map detail.html?id=' + encodeURIComponent(b.id) + '">' +
        '<div class="related-card-title">' + escapeHTML(b.titleKr || b.title) + '</div>' +
        '<div class="related-card-subtitle">' + escapeHTML(b.date || '') + ' · ' + escapeHTML(b.location || '') + '</div>' +
        '<div class="related-card-desc">' + escapeHTML(b.description || '') + '</div>' +
      '</a>';
    }).join('');
  }

  // ── AR 3D 라이트박스 ──
  function initLightbox() {
    // AR 3D 패널 생성
    var panel = document.createElement('div');
    panel.className = 'ar-3d-panel';
    panel.innerHTML =
      '<button class="panel-close" aria-label="닫기">&times;</button>' +
      '<div class="panel-scene">' +
        '<div class="panel-card">' +
          '<img src="" alt="">' +
          '<div class="panel-scanline"></div>' +
          '<div class="panel-bracket tl"></div><div class="panel-bracket tr"></div>' +
          '<div class="panel-bracket bl"></div><div class="panel-bracket br"></div>' +
          '<div class="panel-info" id="panelInfo"></div>' +
        '</div>' +
        '<div class="panel-caption" id="panelCaption"></div>' +
      '</div>' +
      '<div class="panel-hint">마우스를 움직여 3D 효과 확인 · ESC로 닫기</div>';
    document.body.appendChild(panel);

    var panelImg = panel.querySelector('.panel-card img');
    var panelCard = panel.querySelector('.panel-card');
    var panelInfo = document.getElementById('panelInfo');
    var panelCaption = document.getElementById('panelCaption');
    var panelClose = panel.querySelector('.panel-close');

    // 현재 전투 데이터를 가져옴
    var currentBattle = null;
    var battleId = getBattleId();
    if (battleId) {
      currentBattle = allBattles.find(function (b) { return b.id === battleId; });
    }

    function open(src, caption, source) {
      panelImg.src = src;
      panelCaption.innerHTML = escapeHTML(caption) +
        (source ? '<span class="caption-source">출처: ' + escapeHTML(source) + '</span>' : '');

      // 3D 정보 패널 — 전투 데이터 표시
      var infoHTML = '<div class="panel-info-title">ARCHIVE DATA</div>';
      if (currentBattle) {
        if (currentBattle.titleKr || currentBattle.title) {
          infoHTML += '<div class="panel-info-row"><span class="panel-info-label">전투</span><span class="panel-info-value">' + escapeHTML(currentBattle.titleKr || currentBattle.title) + '</span></div>';
        }
        if (currentBattle.date) {
          infoHTML += '<div class="panel-info-row"><span class="panel-info-label">일시</span><span class="panel-info-value">' + escapeHTML(currentBattle.date) + '</span></div>';
        }
        if (currentBattle.location) {
          infoHTML += '<div class="panel-info-row"><span class="panel-info-label">위치</span><span class="panel-info-value">' + escapeHTML(currentBattle.location) + '</span></div>';
        }
        if (currentBattle.terrain) {
          infoHTML += '<div class="panel-info-row"><span class="panel-info-label">지형</span><span class="panel-info-value">' + escapeHTML(currentBattle.terrain) + '</span></div>';
        }
        if (currentBattle.result) {
          infoHTML += '<div class="panel-info-row"><span class="panel-info-label">결과</span><span class="panel-info-value">' + escapeHTML(currentBattle.result) + '</span></div>';
        }
        if (currentBattle.commanders && currentBattle.commanders.length) {
          infoHTML += '<div class="panel-info-row"><span class="panel-info-label">지휘관</span><span class="panel-info-value">' + escapeHTML(currentBattle.commanders.join(' vs ')) + '</span></div>';
        }
      }
      panelInfo.innerHTML = infoHTML;

      panel.classList.add('active');
    }

    function close() {
      panel.classList.remove('active');
      panelImg.src = '';
      panelCard.style.transform = '';
    }

    // 3D 마우스 트래킹
    panel.addEventListener('mousemove', function (e) {
      if (!panel.classList.contains('active')) return;
      var w = window.innerWidth;
      var h = window.innerHeight;
      var x = (e.clientX / w - 0.5) * 2;
      var y = (e.clientY / h - 0.5) * 2;
      panelCard.style.transform =
        'rotateY(' + (x * 10) + 'deg) rotateX(' + (-y * 8) + 'deg)';
    });

    panel.addEventListener('mouseleave', function () {
      panelCard.style.transform = '';
    });

    // 갤러리 아이템 클릭
    document.querySelectorAll('.image-gallery-item').forEach(function (item) {
      item.addEventListener('click', function () {
        open(item.dataset.src, item.dataset.caption, item.dataset.source || '');
      });
    });

    panelClose.addEventListener('click', close);
    panel.addEventListener('click', function (e) {
      if (e.target === panel) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  // ── 스크롤 스파이 ──
  function initScrollSpy() {
    var sections = document.querySelectorAll('.doc-section');
    var tocLinks = document.querySelectorAll('.toc-list a');
    if (!sections.length || !tocLinks.length) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          tocLinks.forEach(function (link) { link.classList.remove('active'); });
          var activeLink = document.querySelector('.toc-list a[data-target="' + entry.target.id + '"]');
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { rootMargin: '-80px 0px -60% 0px', threshold: 0 });

    sections.forEach(function (sec) { observer.observe(sec); });

    // TOC 클릭 부드러운 스크롤
    tocLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        var target = document.getElementById(link.dataset.target);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // ── 모바일 메뉴 ──
  var menuToggle = document.querySelector('.menu-toggle');
  var navLinks = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', function () {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('open');
    });
  }

  // ── Start ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
