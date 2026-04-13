// Historical Sources & Documents Detail — 사료 & 문서 상세 페이지 스크립트

(function () {
    'use strict';

    // XSS 방지 유틸리티
    function escapeHTML(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // URL 파라미터에서 문서 ID 추출
    function getDocId() {
        var params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    // 유형 라벨 매핑
    var typeLabels = {
        treaty: '조약문',
        declaration: '선전포고문',
        letter: '편지',
        diary: '일기',
        speech: '연설문',
        report: '공식 보고서',
        order: '작전 명령서',
        memoir: '회고록'
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
        { id: 'sectionHero', title: '문서 정보' },
        { id: 'sectionSummary', title: '개요' },
        { id: 'sectionBackground', title: '역사적 배경' },
        { id: 'sectionOriginalText', title: '원문 발췌' },
        { id: 'sectionSignificance', title: '역사적 의의' },
        { id: 'sectionAftermath', title: '이후 영향' },
        { id: 'sectionPhysical', title: '원본 정보' },
        { id: 'sectionRelated', title: '관련 문서' },
        { id: 'sectionReferences', title: '참고 자료' }
    ];

    // ID → 개별 JSON 파일명 매핑
    var docFileMap = {
        'treaty-of-westphalia': 'treaty of westphalia',
        'treaty-of-versailles': 'treaty of versailles',
        'potsdam-declaration': 'potsdam declaration',
        'emancipation-proclamation': 'emancipation proclamation',
        'churchills-speech': 'churchills speech',
        'gettysburg-address': 'gettysburg address',
        'declaration-of-war-1914': 'declaration of war 1914',
        'letters-from-iwo-jima': 'letters from iwo jima',
        'diary-of-anne-frank': 'diary of anne frank',
        'art-of-war-excerpts': 'the art of war excerpts',
        'the-art-of-war-excerpts': 'the art of war excerpts',
        'geneva-convention': 'geneva convention',
        'atlantic-charter': 'atlantic charter',
        'operation-overlord-order': 'operation overlord order',
        'manhattan-project-memo': 'manhattan project memo',
        'hiroshima-survivors-testimony': 'hiroshima survivors testimony',
        'nuremberg-trial-records': 'nuremberg trial records'
    };

    // 전체 문서 인덱스 (관련 문서 자동 매핑용)
    var allDocsIndex = []; // { id, title, titleKr }

    // 모든 JSON을 로드하여 인덱스 구축
    async function buildDocsIndex() {
        var fileNames = Object.values(docFileMap);
        // 중복 제거
        var unique = fileNames.filter(function (v, i, a) { return a.indexOf(v) === i; });
        var results = await Promise.all(unique.map(function (name) {
            return fetch('../../../back/data/Historical Sources & Documents data/' + encodeURIComponent(name) + '.json')
                .then(function (res) { return res.ok ? res.json() : null; })
                .catch(function () { return null; });
        }));
        results.forEach(function (doc) {
            if (doc && doc.id) {
                allDocsIndex.push({
                    id: doc.id,
                    title: (doc.title || '').toLowerCase(),
                    titleKr: doc.titleKr || ''
                });
            }
        });
    }

    // 관련 문서 텍스트에서 매칭되는 문서 찾기
    function findMatchingDoc(text) {
        if (!text) return null;
        var normalized = text.replace(/\(.*?\)/g, '').trim();
        for (var i = 0; i < allDocsIndex.length; i++) {
            var doc = allDocsIndex[i];
            // titleKr 포함 여부 (양방향)
            if (doc.titleKr && (
                normalized.indexOf(doc.titleKr) !== -1 ||
                doc.titleKr.indexOf(normalized) !== -1
            )) {
                return doc.id;
            }
            // 영문 title 포함 여부
            if (doc.title && (
                normalized.toLowerCase().indexOf(doc.title) !== -1 ||
                doc.title.indexOf(normalized.toLowerCase()) !== -1
            )) {
                return doc.id;
            }
        }
        return null;
    }

    // 데이터 로드 및 렌더링
    async function init() {
        var docId = getDocId();
        if (!docId || !docFileMap[docId]) {
            showError();
            return;
        }

        try {
            // 문서 인덱스 구축 (관련 문서 자동 매핑용)
            await buildDocsIndex();

            var fileName = docFileMap[docId];
            var res = await fetch('../../../back/data/Historical Sources & Documents data/' + encodeURIComponent(fileName) + '.json');
            if (!res.ok) { showError(); return; }

            var doc = await res.json();
            if (!doc || !doc.detail) { showError(); return; }

            renderPage(doc);
        } catch (err) {
            console.error('데이터 로드 오류:', err);
            showError();
        }
    }

    function showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    }

    function renderPage(doc) {
        var detail = doc.detail;

        // 페이지 타이틀
        document.title = (doc.titleKr || doc.title) + ' — War Archive 사료 & 문서';

        // 브레드크럼
        document.getElementById('breadcrumbTitle').textContent = doc.titleKr || doc.title;

        // ── 문서 히어로 ──
        var badge = document.getElementById('docTypeBadge');
        badge.textContent = typeLabels[doc.type] || doc.type;
        badge.classList.add(doc.type);

        document.getElementById('docTitle').textContent = doc.titleKr || doc.title;
        document.getElementById('docTitleEn').textContent = doc.title || '';
        document.getElementById('docDate').textContent = doc.date || '-';
        document.getElementById('docAuthor').textContent = doc.author || '-';
        document.getElementById('docType').textContent = typeLabels[doc.type] || doc.type || '-';
        document.getElementById('docEra').textContent = eraLabels[doc.era] || doc.era || '-';
        document.getElementById('docOrigin').textContent = doc.origin || '-';

        // 표지 이미지
        if (doc.coverImage) {
            var frame = document.getElementById('coverFrame');
            frame.innerHTML = '<img src="' + escapeHTML(doc.coverImage) + '" alt="' + escapeHTML(doc.titleKr || doc.title) + '" onerror="this.parentElement.innerHTML=\'<div class=cover-placeholder><span class=cover-icon>NO IMAGE</span><span class=cover-label>이미지를 불러올 수 없습니다</span></div>\'">';
        }

        // 태그
        var tagsEl = document.getElementById('docTags');
        if (doc.keywords && doc.keywords.length) {
            tagsEl.innerHTML = doc.keywords.map(function (k) {
                return '<span class="doc-tag">' + escapeHTML(k) + '</span>';
            }).join('');
        }

        // ── 개요 ──
        document.getElementById('docDescription').textContent = doc.description || '';

        // ── 배경 ──
        var bgEl = document.getElementById('docBackground');
        bgEl.textContent = detail.background || '';
        bgEl.classList.add('drop-cap');

        // ── 원문 발췌 ──
        var originalEl = document.getElementById('docOriginalText');
        if (detail.originalText) {
            originalEl.innerHTML = '<div class="manuscript-content">' + escapeHTML(detail.originalText) + '</div>';
        } else {
            originalEl.innerHTML = '<p style="color:var(--text-muted);font-style:italic;">등록된 원문이 없습니다.</p>';
        }

        // ── 역사적 의의 ──
        var sigEl = document.getElementById('docSignificance');
        sigEl.textContent = detail.significance || '';
        sigEl.classList.add('drop-cap');

        // ── 이후 영향 ──
        document.getElementById('docAftermath').textContent = detail.aftermath || '';

        // ── 원본 정보 ──
        document.getElementById('docPhysical').textContent = detail.physicalDescription || '';

        // ── 관련 문서 (자동 매핑) ──
        var relatedEl = document.getElementById('docRelated');
        if (detail.relatedDocuments && detail.relatedDocuments.length) {
            relatedEl.innerHTML = detail.relatedDocuments.map(function (rd) {
                var matchedId = findMatchingDoc(rd);
                if (matchedId) {
                    return '<li><a href="Historical Sources & Documents detail.html?id=' +
                        encodeURIComponent(matchedId) + '">' + escapeHTML(rd) + '</a></li>';
                }
                return '<li>' + escapeHTML(rd) + '</li>';
            }).join('');
        } else {
            relatedEl.innerHTML = '<li>등록된 관련 문서가 없습니다.</li>';
        }

        // ── 참고 자료 ──
        var refsEl = document.getElementById('docReferences');
        if (detail.references && detail.references.length) {
            refsEl.innerHTML = detail.references.map(function (r) {
                return '<li>' + escapeHTML(r) + '</li>';
            }).join('');
        } else {
            refsEl.innerHTML = '<li>등록된 참고 자료가 없습니다.</li>';
        }

        // ── 로딩 해제 ──
        document.getElementById('loading').style.display = 'none';
        document.getElementById('docPage').style.display = 'block';

        // ── 탭 초기화 ──
        setupTabs();

        // ── 사이드 목차 ──
        buildSideTOC();
        setupScrollSpy();
    }

    // ── 탭 네비게이션 ──
    function setupTabs() {
        var tabs = document.querySelectorAll('.doc-nav-tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                var targetId = tab.getAttribute('data-target');
                var target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
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
        var navTabs = document.querySelectorAll('.doc-nav-tab');
        if (!sideLinks.length) return;

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    sideLinks.forEach(function (l) { l.classList.remove('active'); });
                    var activeLink = document.querySelector('.side-toc-list a[data-section="' + entry.target.id + '"]');
                    if (activeLink) activeLink.classList.add('active');

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
