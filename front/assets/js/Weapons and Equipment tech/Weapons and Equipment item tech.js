// Weapons & Equipment Detail — 도감 사전 스크립트

(function () {
    'use strict';

    // XSS 방지 유틸리티
    function escapeHTML(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // URL 파라미터에서 항목 ID 추출
    function getItemId() {
        var params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    // 카테고리 라벨
    var categoryLabels = {
        melee: '근접 무기',
        ranged: '원거리 무기',
        firearms: '화기',
        artillery: '포병 / 폭발물',
        armor: '기갑 / 차량',
        aircraft: '항공기',
        naval: '함선',
        defense: '방어 장비'
    };

    // 시대 라벨
    var eraLabels = {
        ancient: '고대',
        medieval: '중세',
        earlymodern: '근세',
        modern: '근대',
        worldwar: '세계대전',
        contemporary: '현대'
    };

    // 카테고리 → SVG 아이콘 매핑
    var categoryIcons = {
        melee: '../../assets/images/weapons/melee.svg',
        ranged: '../../assets/images/weapons/ranged.svg',
        firearms: '../../assets/images/weapons/firearms.svg',
        artillery: '../../assets/images/weapons/artillery.svg',
        armor: '../../assets/images/weapons/armor.svg',
        aircraft: '../../assets/images/weapons/aircraft.svg',
        naval: '../../assets/images/weapons/naval.svg',
        defense: '../../assets/images/weapons/defense.svg'
    };

    // 섹션 정의 (목차 & 스크롤 스파이)
    var sections = [
        { id: 'sectionOverview', title: '개요' },
        { id: 'sectionSpecs', title: '제원' },
        { id: 'sectionHistory', title: '역사' },
        { id: 'sectionDesign', title: '설계 및 구조' },
        { id: 'sectionOperation', title: '운용' },
        { id: 'sectionCombatRecord', title: '실전 기록' },
        { id: 'sectionVariants', title: '파생형' },
        { id: 'sectionEvaluation', title: '평가' },
        { id: 'sectionRelated', title: '관련 항목' },
        { id: 'sectionReferences', title: '참고 자료' }
    ];

    // 데이터 파일 로드 (향후 data 폴더 연동)
    function loadItemData(itemId) {
        // 데이터 파일 경로 (추후 JSON 연동)
        var dataPath = '/data/weapons-and-equipment/' + itemId + '.json';

        return fetch(dataPath)
            .then(function (res) {
                if (!res.ok) throw new Error('Not found');
                return res.json();
            });
    }

    // 페이지 렌더
    function renderPage(data) {
        var loading = document.getElementById('loading');
        var page = document.getElementById('encyclopediaPage');

        loading.style.display = 'none';
        page.style.display = 'block';

        // 브레드크럼
        document.getElementById('breadcrumbTitle').textContent = data.name || '';
        document.title = (data.name || '무기·장비') + ' — War Archive 도감';

        // 히어로 카드
        var cat = data.category || '';
        var era = data.era || '';

        var categoryBadge = document.getElementById('categoryBadge');
        categoryBadge.textContent = categoryLabels[cat] || cat;

        var eraBadge = document.getElementById('eraBadge');
        eraBadge.textContent = eraLabels[era] || era;
        eraBadge.className = 'era-badge ' + era;

        document.getElementById('entryName').textContent = data.name || '';
        document.getElementById('entryNameEn').textContent = data.nameEn || '';

        // 아이콘
        var iconEl = document.getElementById('entryIcon');
        var imgSrc = data.image || categoryIcons[cat];
        if (imgSrc) {
            iconEl.src = imgSrc;
            iconEl.alt = data.name || categoryLabels[cat] || '';
            iconEl.referrerPolicy = 'no-referrer';
        }

        // 이미지가 있으면 "이미지 미등록" 라벨 숨기기
        if (data.image) {
            var visualLabel = document.querySelector('.visual-label');
            if (visualLabel) visualLabel.style.display = 'none';
        }

        // 퀵 팩트
        document.getElementById('factCategory').textContent = categoryLabels[cat] || '-';
        document.getElementById('factEra').textContent = eraLabels[era] || '-';
        document.getElementById('factOrigin').textContent = data.origin || '-';
        document.getElementById('factPeriod').textContent = data.period || '-';
        document.getElementById('factOperators').textContent = Array.isArray(data.operators) ? data.operators.join(', ') : (data.operators || '-');

        // 태그
        var tagsEl = document.getElementById('entryTags');
        tagsEl.innerHTML = '';
        if (Array.isArray(data.tags)) {
            data.tags.forEach(function (tag) {
                var span = document.createElement('span');
                span.className = 'entry-tag';
                span.textContent = escapeHTML(tag);
                tagsEl.appendChild(span);
            });
        }

        // 목차 생성
        buildTOC(data);

        // 본문 섹션
        renderSection('contentOverview', data.overview);
        renderSpecs(data.specs);
        renderSection('contentHistory', data.history);
        renderSection('contentDesign', data.design);
        renderSection('contentOperation', data.operation);
        renderSection('contentCombatRecord', data.combatRecord);
        renderVariants(data.variants);
        renderSection('contentEvaluation', data.evaluation);
        renderRelated(data.related);
        renderReferences(data.references);

        // 빈 섹션 숨기기
        hideSectionsIfEmpty(data);

        // 스크롤 스파이 활성화
        initScrollSpy();
    }

    function renderSection(elementId, content) {
        var el = document.getElementById(elementId);
        if (!el) return;

        if (!content) {
            el.innerHTML = '<p class="empty-notice">아직 등록된 내용이 없습니다.</p>';
            return;
        }

        if (Array.isArray(content)) {
            el.innerHTML = content.map(function (p) {
                return '<p>' + escapeHTML(p) + '</p>';
            }).join('');
        } else {
            el.innerHTML = '<p>' + escapeHTML(content) + '</p>';
        }
    }

    function renderSpecs(specs) {
        var table = document.getElementById('specsTable');
        if (!table) return;

        if (!specs || (Array.isArray(specs) && specs.length === 0) || Object.keys(specs).length === 0) {
            table.innerHTML = '<p class="empty-notice" style="padding:1rem; background:var(--bg-card);">제원 정보 없음</p>';
            return;
        }

        var html = '';
        if (Array.isArray(specs)) {
            specs.forEach(function (item) {
                html += '<div class="spec-label">' + escapeHTML(item.label) + '</div>';
                html += '<div class="spec-value">' + escapeHTML(item.value) + '</div>';
            });
        } else {
            Object.keys(specs).forEach(function (key) {
                html += '<div class="spec-label">' + escapeHTML(key) + '</div>';
                html += '<div class="spec-value">' + escapeHTML(specs[key]) + '</div>';
            });
        }
        table.innerHTML = html;
    }

    function renderVariants(variants) {
        var grid = document.getElementById('variantsGrid');
        if (!grid) return;

        if (!variants || variants.length === 0) {
            grid.innerHTML = '<p class="empty-notice">파생형 정보 없음</p>';
            return;
        }

        grid.innerHTML = variants.map(function (v) {
            return '<div class="variant-card">' +
                '<div class="variant-name">' + escapeHTML(v.name) + '</div>' +
                '<div class="variant-desc">' + escapeHTML(v.description) + '</div>' +
                '</div>';
        }).join('');
    }

    function renderRelated(related) {
        var grid = document.getElementById('relatedGrid');
        if (!grid) return;

        if (!related || related.length === 0) {
            grid.innerHTML = '<p class="empty-notice">관련 항목 없음</p>';
            return;
        }

        grid.innerHTML = related.map(function (r) {
            var href = 'Weapons and Equipment item.html?id=' + encodeURIComponent(r.id || '');
            return '<a class="related-card" href="' + href + '">' +
                '<div class="related-card-name">' + escapeHTML(r.name) + '</div>' +
                '<div class="related-card-type">' + escapeHTML(r.type || '') + '</div>' +
                '</a>';
        }).join('');
    }

    function renderReferences(refs) {
        var el = document.getElementById('contentReferences');
        if (!el) return;

        if (!refs || refs.length === 0) {
            el.innerHTML = '<p class="empty-notice">참고 자료 없음</p>';
            return;
        }

        var html = '<ul style="list-style:decimal inside; color:var(--text-secondary); font-size:0.85rem;">';
        refs.forEach(function (ref) {
            html += '<li style="margin-bottom:0.5rem; line-height:1.7;">' + escapeHTML(ref) + '</li>';
        });
        html += '</ul>';
        el.innerHTML = html;
    }

    function hideSectionsIfEmpty(data) {
        var mapping = {
            sectionSpecs: data.specs,
            sectionVariants: data.variants,
            sectionRelated: data.related,
            sectionReferences: data.references
        };

        Object.keys(mapping).forEach(function (sectionId) {
            var val = mapping[sectionId];
            var isEmpty = !val || (Array.isArray(val) && val.length === 0) || (typeof val === 'object' && Object.keys(val).length === 0);
            // Don't hide, just show empty notice (already handled by render functions)
        });
    }

    function buildTOC(data) {
        var tocList = document.getElementById('tocList');
        if (!tocList) return;

        tocList.innerHTML = '';
        sections.forEach(function (sec) {
            var sectionEl = document.getElementById(sec.id);
            if (!sectionEl) return;

            var li = document.createElement('li');
            var a = document.createElement('a');
            a.href = '#' + sec.id;
            a.textContent = sec.title;
            a.addEventListener('click', function (e) {
                e.preventDefault();
                sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
            li.appendChild(a);
            tocList.appendChild(li);
        });
    }

    function initScrollSpy() {
        var tocLinks = document.querySelectorAll('.toc-list a');
        if (tocLinks.length === 0) return;

        var sectionEls = sections.map(function (s) {
            return document.getElementById(s.id);
        }).filter(Boolean);

        window.addEventListener('scroll', function () {
            var scrollPos = window.scrollY + 100;
            var currentId = '';

            sectionEls.forEach(function (el) {
                if (el.offsetTop <= scrollPos) {
                    currentId = el.id;
                }
            });

            tocLinks.forEach(function (link) {
                if (link.getAttribute('href') === '#' + currentId) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            });
        }, { passive: true });
    }

    function showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    }

    // 초기화
    document.addEventListener('DOMContentLoaded', function () {
        var itemId = getItemId();

        if (!itemId) {
            showError();
            return;
        }

        loadItemData(itemId)
            .then(renderPage)
            .catch(function () {
                showError();
            });
    });

})();
