// Strategy & Tactics Detail — 위키 형태 상세 페이지 스크립트

(function () {
  'use strict';

  // XSS 방지 유틸리티
  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // URL 파라미터에서 ID 추출
  function getStrategyId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  // 라벨 매핑
  const eraLabels = {
    ancient: '고대', medieval: '중세', earlymodern: '근세',
    modern: '근대', worldwar: '세계대전', contemporary: '현대'
  };
  const categoryLabels = {
    'grand-strategy': '대전략', 'operational': '작전술',
    'tactics': '전술', 'siege': '공성전',
    'naval': '해전 전술', 'guerrilla': '비정규전',
    'logistics': '병참·보급', 'doctrine': '군사 교리'
  };

  // JSON 파일 목록
  const strategyFiles = [
    'phalanx', 'legion tactics', 'art of war', 'envelopment',
    'cavalry charge', 'siege warfare', 'mongol tactics', 'longbow tactics',
    'tercio', 'line infantry', 'vauban fortification', 'naval line of battle',
    'napoleonic corps system', 'clausewitz doctrine', 'total war',
    'trench warfare', 'blitzkrieg', 'strategic bombing', 'amphibious assault',
    'guerrilla warfare', 'containment', 'counterinsurgency',
    'network centric warfare', 'hybrid warfare'
  ];

  let allStrategies = [];

  // 로마 숫자
  const romanNumerals = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ','Ⅺ','Ⅻ'];

  // ── 초기화 ──
  async function init() {
    const targetId = getStrategyId();
    if (!targetId) { showError(); return; }

    try {
      const responses = await Promise.all(
        strategyFiles.map(name =>
          fetch('../../data/strategy and tactics data/' + encodeURIComponent(name) + '.json')
            .then(res => res.ok ? res.json() : null)
            .catch(() => null)
        )
      );
      allStrategies = responses.filter(d => d !== null);

      const data = allStrategies.find(d => d.id === targetId);
      if (!data) { showError(); return; }

      renderDocument(data);
    } catch (err) {
      console.error('데이터 로드 오류:', err);
      showError();
    }
  }

  // ── 오류 표시 ──
  function showError() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
  }

  // ── 문서 렌더링 ──
  function renderDocument(data) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('document').style.display = 'block';

    // 페이지 타이틀
    document.title = (data.titleKr || data.title) + ' — War Archive';

    // 브레드크럼
    document.getElementById('breadcrumbTitle').textContent = data.titleKr || data.title;

    // 배지
    document.getElementById('docEraBadge').textContent = eraLabels[data.era] || data.era || '';
    document.getElementById('docCategoryBadge').textContent = categoryLabels[data.category] || data.category || '';

    // 제목
    document.getElementById('docTitle').textContent =
      (data.titleKr || '') + (data.title ? ' (' + data.title + ')' : '');
    document.getElementById('docSubtitle').textContent = data.description || '';

    // 메타
    document.getElementById('docOrigin').textContent = data.origin || '—';
    document.getElementById('docPeriod').textContent = data.period || '—';
    document.getElementById('docRegion').textContent = data.region || '—';
    document.getElementById('docKeyFigure').textContent = data.keyFigure || '—';

    // 키워드
    const kwContainer = document.getElementById('docKeywords');
    kwContainer.innerHTML = '';
    (data.keywords || []).forEach(kw => {
      const span = document.createElement('span');
      span.className = 'doc-keyword';
      span.textContent = kw;
      kwContainer.appendChild(span);
    });

    // 정보 상자
    renderInfoBox(data.infoBox);

    // 섹션 & 목차
    renderSections(data.sections || []);

    // 관련 전략
    renderRelated(data.relatedStrategies || []);

    // 이미지 갤러리
    renderImageGallery(data.images || []);

    // 스크롤스파이
    initScrollSpy();

    // 라이트박스 초기화
    initLightbox();
  }

  // ── 정보 상자 ──
  function renderInfoBox(infoBox) {
    const dl = document.getElementById('infoBoxList');
    dl.innerHTML = '';
    if (!infoBox) {
      document.getElementById('infoBox').style.display = 'none';
      return;
    }
    const fields = [
      { key: 'type', label: '유형' },
      { key: 'originNation', label: '기원 국가' },
      { key: 'firstUsed', label: '최초 사용' },
      { key: 'lastUsed', label: '최후 사용' },
      { key: 'mainWeapon', label: '주요 무기/수단' },
      { key: 'idealTerrain', label: '이상적 지형' },
      { key: 'weakness', label: '약점' }
    ];
    fields.forEach(f => {
      if (!infoBox[f.key]) return;
      const dt = document.createElement('dt');
      dt.textContent = f.label;
      const dd = document.createElement('dd');
      dd.textContent = infoBox[f.key];
      dl.appendChild(dt);
      dl.appendChild(dd);
    });
  }

  // ── 섹션 렌더링 ──
  function renderSections(sections) {
    const container = document.getElementById('docContent');
    const tocList = document.getElementById('tocList');
    container.innerHTML = '';
    tocList.innerHTML = '';

    sections.forEach((sec, i) => {
      const sectionId = 'section-' + i;

      // 섹션 DOM
      const sectionEl = document.createElement('section');
      sectionEl.className = 'doc-section';
      sectionEl.id = sectionId;
      sectionEl.innerHTML =
        '<div class="section-header">' +
          '<span class="section-number">' + (romanNumerals[i] || (i + 1)) + '</span>' +
          '<h2 class="section-title">' + escapeHTML(sec.title) + '</h2>' +
        '</div>' +
        '<div class="section-body">' + escapeHTML(sec.content) + '</div>';
      container.appendChild(sectionEl);

      // 목차 항목
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '#' + sectionId;
      a.textContent = sec.title;
      a.dataset.target = sectionId;
      li.appendChild(a);
      tocList.appendChild(li);
    });
  }

  // ── 관련 전략 렌더링 ──
  function renderRelated(relatedIds) {
    if (!relatedIds || relatedIds.length === 0) return;

    const related = allStrategies.filter(s => relatedIds.includes(s.id));
    if (related.length === 0) return;

    const section = document.getElementById('relatedSection');
    const grid = document.getElementById('relatedGrid');
    section.style.display = 'block';
    grid.innerHTML = '';

    related.forEach(item => {
      const card = document.createElement('a');
      card.className = 'related-card';
      card.href = 'strategy and tactics detail.html?id=' + encodeURIComponent(item.id);
      card.innerHTML =
        '<div class="related-card-era">' + escapeHTML(eraLabels[item.era] || item.era || '') + '</div>' +
        '<div class="related-card-title">' + escapeHTML(item.titleKr || item.title) + '</div>' +
        '<div class="related-card-desc">' + escapeHTML(item.description || '') + '</div>';
      grid.appendChild(card);
    });
  }

  // ── 이미지 갤러리 렌더링 ──
  function renderImageGallery(images) {
    if (!images || images.length === 0) return;

    const gallerySection = document.getElementById('imageGallery');
    if (!gallerySection) return;

    gallerySection.style.display = 'block';
    const grid = document.getElementById('imageGalleryGrid');
    grid.innerHTML = '';

    images.forEach(function (img) {
      var item = document.createElement('div');
      item.className = 'image-gallery-item';

      var imgEl = document.createElement('img');
      imgEl.src = img.url;
      imgEl.alt = img.caption || '';
      imgEl.loading = 'lazy';
      imgEl.referrerPolicy = 'no-referrer';
      imgEl.dataset.caption = img.caption || '';
      imgEl.addEventListener('error', function () {
        this.style.display = 'none';
        item.style.display = 'none';
      });

      var caption = document.createElement('div');
      caption.className = 'image-gallery-caption';
      caption.innerHTML =
        '<p>' + escapeHTML(img.caption || '') + '</p>' +
        '<span class="image-source">출처: ' + escapeHTML(img.source || 'Wikimedia Commons') + '</span>';

      item.appendChild(imgEl);
      item.appendChild(caption);
      grid.appendChild(item);
    });
  }

  // ── 라이트박스 ──
  function initLightbox() {
    var lightbox = document.createElement('div');
    lightbox.className = 'image-lightbox';
    lightbox.innerHTML =
      '<button class="lightbox-close" aria-label="닫기">&times;</button>' +
      '<img src="" alt="">' +
      '<div class="lightbox-caption"></div>';
    document.body.appendChild(lightbox);

    var lightboxImg = lightbox.querySelector('img');
    var lightboxCaption = lightbox.querySelector('.lightbox-caption');
    var closeBtn = lightbox.querySelector('.lightbox-close');

    function openLightbox(src, caption) {
      lightboxImg.src = src;
      lightboxImg.referrerPolicy = 'no-referrer';
      lightboxCaption.textContent = caption || '';
      lightbox.classList.add('active');
    }

    function closeLightbox() {
      lightbox.classList.remove('active');
      lightboxImg.src = '';
    }

    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLightbox();
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('.image-gallery-item img')) {
        var img = e.target.closest('.image-gallery-item img');
        openLightbox(img.src, img.dataset.caption || '');
      }
    });
  }

  // ── 스크롤스파이 ──
  function initScrollSpy() {
    const tocLinks = document.querySelectorAll('.toc-list a');
    const sectionEls = document.querySelectorAll('.doc-section');

    if (!tocLinks.length || !sectionEls.length) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          tocLinks.forEach(a => a.classList.remove('active'));
          const activeLink = document.querySelector('.toc-list a[data-target="' + entry.target.id + '"]');
          if (activeLink) activeLink.classList.add('active');
        }
      });
    }, { rootMargin: '-100px 0px -60% 0px', threshold: 0 });

    sectionEls.forEach(sec => observer.observe(sec));
  }

  // ── 모바일 메뉴 ──
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });
  }

  // 실행
  init();
})();
