// Biography of People Detail — 인물 열전 상세 페이지 스크립트

(function () {
    'use strict';

    // XSS 방지 유틸리티
    function escapeHTML(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // URL 파라미터에서 인물 ID 추출
    function getPersonId() {
        var params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    // 역할 라벨 매핑
    var roleLabels = {
        commander: '지휘관',
        strategist: '전략가',
        politician: '정치인',
        hero: '영웅',
        civilian: '민간인',
        other: '기타'
    };

    var eraLabels = {
        ancient: '고대',
        medieval: '중세',
        earlymodern: '근세',
        modern: '근대',
        worldwar: '세계대전',
        contemporary: '현대'
    };

    // 섹션 정의 (사이드 목차 & 스크롤 스파이용)
    var sections = [
        { id: 'sectionProfile', title: '프로필' },
        { id: 'sectionSummary', title: '개요' },
        { id: 'sectionLifeStory', title: '생애' },
        { id: 'sectionAchievements', title: '업적' },
        { id: 'sectionWarsBattles', title: '전쟁과 전투' },
        { id: 'sectionAnecdotes', title: '일화' },
        { id: 'sectionEvaluation', title: '평가' },
        { id: 'sectionReferences', title: '참고 자료' }
    ];

    // ID → 개별 JSON 파일명 매핑
    var personFileMap = {
        'alexander_the_great': 'alexander the great',
        'leonidas': 'leonidas',
        'hannibal': 'hannibal',
        'scipio_africanus': 'scipio africanus',
        'saladin': 'saladin',
        'genghis_khan': 'genghis khan',
        'joan_of_arc': 'joan of arc',
        'yi_sun_sin': 'yi sun sin',
        'napoleon': 'napoleon',
        'wellington': 'wellington',
        'abraham_lincoln': 'abraham lincoln',
        'ulysses_grant': 'ulysses grant',
        'florence_nightingale': 'florence nightingale',
        'togo_heihachiro': 'togo heihachiro',
        'winston_churchill': 'winston churchill',
        'erwin_rommel': 'erwin rommel',
        'dwight_eisenhower': 'dwight eisenhower',
        'douglas_macarthur': 'douglas macarthur',
        'ho_chi_minh': 'ho chi minh',
        'vo_nguyen_giap': 'vo nguyen giap',
        'norman_schwarzkopf': 'norman schwarzkopf'
    };

    // 데이터 로드 및 렌더링
    async function init() {
        var personId = getPersonId();
        if (!personId || !personFileMap[personId]) {
            showError();
            return;
        }

        try {
            var fileName = personFileMap[personId];
            var res = await fetch('../../data/biography of people data/' + encodeURIComponent(fileName) + '.json');
            if (!res.ok) { showError(); return; }

            var person = await res.json();
            if (!person || !person.detail) { showError(); return; }

            renderPage(person);
        } catch (err) {
            console.error('데이터 로드 오류:', err);
            showError();
        }
    }

    function showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    }

    function renderPage(person) {
        var detail = person.detail;

        // 페이지 타이틀
        document.title = person.name + ' — War Archive 인물 열전';

        // 브레드크럼
        document.getElementById('breadcrumbTitle').textContent = person.name;

        // ── 프로필 히어로 ──
        var badge = document.getElementById('docRoleBadge');
        badge.textContent = roleLabels[person.role] || person.role;
        badge.classList.add(person.role);

        document.getElementById('docTitle').textContent = person.name;
        document.getElementById('docSubtitle').textContent = person.title || '';
        document.getElementById('docLifespan').textContent = person.lifespan;
        document.getElementById('docNationality').textContent = person.nationality;
        document.getElementById('docRole').textContent = roleLabels[person.role] || person.role;
        document.getElementById('docEra').textContent = eraLabels[person.era] || person.era;
        document.getElementById('docWars').textContent = (person.wars || []).join(', ') || '-';

        // 초상화: portrait 필드가 있으면 이미지 표시
        if (person.portrait) {
            var frame = document.getElementById('portraitFrame');
            var src = /^https?:\/\//.test(person.portrait) ? person.portrait : '../../' + person.portrait;
            frame.innerHTML = '<img src="' + escapeHTML(src) + '" alt="' + escapeHTML(person.name) + ' 초상화" referrerpolicy="no-referrer" onerror="this.onerror=null;this.parentElement.innerHTML=\'<div class=portrait-placeholder><span class=portrait-icon>👤</span><span class=portrait-label>초상화를 불러올 수 없습니다</span></div>\'">';
        }
        var caption = document.getElementById('portraitCaption');
        caption.textContent = person.name + ' (' + (person.lifespan || '') + ')';

        // 태그
        var tagsEl = document.getElementById('docTags');
        if (person.tags && person.tags.length) {
            tagsEl.innerHTML = person.tags.map(function (t) {
                return '<span class="doc-tag">' + escapeHTML(t) + '</span>';
            }).join('');
        }

        // ── 개요 인용 ──
        document.getElementById('docSummary').textContent = person.summary;

        // ── 생애 섹션 ──
        document.getElementById('docEarlyLife').textContent = detail.earlyLife;
        document.getElementById('docLeadership').textContent = detail.leadership;
        document.getElementById('docLaterLife').textContent = detail.laterLife;
        document.getElementById('docLegacy').textContent = detail.legacy;

        // ── 업적 타임라인 ──
        var achievementsEl = document.getElementById('docAchievements');
        if (detail.achievements && detail.achievements.length) {
            achievementsEl.innerHTML = detail.achievements.map(function (a, i) {
                return '<div class="achievement-item">' +
                    '<div class="achievement-order">업적 ' + (i + 1) + '</div>' +
                    '<div class="achievement-title">' + escapeHTML(a.title) + '</div>' +
                    '<div class="achievement-desc">' + escapeHTML(a.description) + '</div>' +
                    '</div>';
            }).join('');
        }

        // ── 전쟁과 전투 ──
        var battlesEl = document.getElementById('docBattles');
        if (detail.warsBattles && detail.warsBattles.length) {
            battlesEl.innerHTML = detail.warsBattles.map(function (b) {
                return '<div class="battle-card">' +
                    '<div class="battle-date-col">' +
                    '<span class="battle-date">' + escapeHTML(b.date) + '</span>' +
                    '</div>' +
                    '<div class="battle-content">' +
                    '<div class="battle-name">' + escapeHTML(b.name) + '</div>' +
                    '<div class="battle-role"><strong>역할:</strong> ' + escapeHTML(b.role) + '</div>' +
                    '<div class="battle-result"><strong>결과:</strong> ' + escapeHTML(b.result) + '</div>' +
                    '</div>' +
                    '</div>';
            }).join('');
        }

        // ── 일화 ──
        var anecdotesEl = document.getElementById('docAnecdotes');
        if (detail.anecdotes && detail.anecdotes.length) {
            anecdotesEl.innerHTML = detail.anecdotes.map(function (a) {
                return '<div class="anecdote-card">' +
                    '<div class="anecdote-title">' + escapeHTML(a.title) + '</div>' +
                    '<div class="anecdote-body">' + escapeHTML(a.content) + '</div>' +
                    '</div>';
            }).join('');
        } else {
            anecdotesEl.innerHTML = '<div class="no-anecdotes">등록된 일화가 없습니다.</div>';
        }

        // ── 평가 ──
        document.getElementById('docEvaluation').textContent = detail.evaluation;

        // ── 참고 자료 ──
        var refsEl = document.getElementById('docReferences');
        if (detail.references && detail.references.length) {
            refsEl.innerHTML = detail.references.map(function (r) {
                return '<li>' +
                    '<div class="ref-title">' + escapeHTML(r.title) + '</div>' +
                    '<div class="ref-author">' + escapeHTML(r.author) + ', ' + escapeHTML(r.year) + '</div>' +
                    (r.note ? '<div class="ref-note">' + escapeHTML(r.note) + '</div>' : '') +
                    '</li>';
            }).join('');
        }

        // ── 로딩 해제 ──
        document.getElementById('loading').style.display = 'none';
        document.getElementById('bioPage').style.display = 'block';

        // ── 탭 초기화 ──
        setupTabs();

        // ── 사이드 목차 ──
        buildSideTOC();
        setupScrollSpy();
    }

    // ── 탭 네비게이션 ──
    function setupTabs() {
        var tabs = document.querySelectorAll('.bio-nav-tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var targetId = tab.getAttribute('data-target');
                var target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                // 활성 탭 업데이트
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');
            });
        });
    }

    // ── 사이드 목차 ──
    function buildSideTOC() {
        var sideTocList = document.getElementById('sideTocList');
        sideTocList.innerHTML = sections.map(function (s) {
            return '<li><a href="#' + s.id + '" data-section="' + s.id + '">' + escapeHTML(s.title) + '</a></li>';
        }).join('');
    }

    function setupScrollSpy() {
        var sideLinks = document.querySelectorAll('.side-toc-list a');
        var navTabs = document.querySelectorAll('.bio-nav-tab');
        if (!sideLinks.length) return;

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    // 사이드 TOC 활성화
                    sideLinks.forEach(function (l) { l.classList.remove('active'); });
                    var activeLink = document.querySelector('.side-toc-list a[data-section="' + entry.target.id + '"]');
                    if (activeLink) activeLink.classList.add('active');

                    // 탭 네비게이션 동기화
                    navTabs.forEach(function (t) {
                        t.classList.toggle('active', t.getAttribute('data-target') === entry.target.id);
                    });
                }
            });
        }, { rootMargin: '-100px 0px -60% 0px', threshold: 0 });

        sections.forEach(function (s) {
            var el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });
    }

    // 스무스 스크롤 (사이드 TOC 링크)
    document.addEventListener('click', function (e) {
        var link = e.target.closest('a[href^="#"]');
        if (!link) return;
        var target = document.querySelector(link.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    // 초기화
    document.addEventListener('DOMContentLoaded', init);
})();
