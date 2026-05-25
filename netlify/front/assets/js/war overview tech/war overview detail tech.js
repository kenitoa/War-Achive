// War Overview Detail — 문헌 형태 상세 페이지 스크립트

(function () {
    'use strict';

    // XSS 방지 유틸리티
    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // URL 파라미터에서 전쟁 ID 추출
    function getWarId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    // 시대 라벨 매핑
    const eraLabels = {
        ancient: '고대',
        medieval: '중세',
        earlymodern: '근세',
        modern: '근대',
        worldwar: '세계대전',
        contemporary: '현대'
    };

    // 섹션 정의 (목차 생성용)
    const sections = [
        { id: 'sectionSummary', title: '개요' },
        { id: 'sectionBackground', title: '배경' },
        { id: 'sectionCauses', title: '전쟁의 원인' },
        { id: 'sectionPhases', title: '전쟁 경과' },
        { id: 'sectionBattles', title: '주요 전투' },
        { id: 'sectionFigures', title: '주요 인물' },
        { id: 'sectionCasualties', title: '피해 규모' },
        { id: 'sectionAftermath', title: '결과 및 영향' },
        { id: 'sectionSignificance', title: '역사적 의의' },
        { id: 'sectionReferences', title: '참고 자료' }
    ];

    // ID → 개별 JSON 파일명 매핑
    const warFileMap = {
        'greco-persian': 'greco persian war',
        'peloponnesian': 'peloponnesian war',
        'punic': 'punic war',
        'crusades': 'crusades',
        'hundred-years': 'hundred years war',
        'mongol-conquest': 'mongol conquest',
        'imjin': 'imjin war',
        'thirty-years': 'thirty years war',
        'napoleonic': 'napoleonic war',
        'american-civil': 'american civil war',
        'russo-japanese': 'russo japanese war',
        'crimean': 'crimean war',
        'ww1': 'world war 1',
        'ww2': 'world war 2',
        'korean': 'korean war',
        'vietnam': 'vietnam war',
        'gulf': 'gulf war'
    };

    // 자료형 헤더 이미지 매핑 (외부 Wikimedia 등). 누락 시 헤더 이미지 영역 미표시.
    const warHeroImages = {
        'greco-persian':  'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Battle_of_Thermopylae_and_movements_to_Salamis%2C_480_BC.gif/960px-Battle_of_Thermopylae_and_movements_to_Salamis%2C_480_BC.gif',
        'peloponnesian':  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Map_Peloponnesian_War_431_BC-en.svg/960px-Map_Peloponnesian_War_431_BC-en.svg.png',
        'punic':          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Map_of_Rome_and_Carthage_at_the_start_of_the_Second_Punic_War.svg/960px-Map_of_Rome_and_Carthage_at_the_start_of_the_Second_Punic_War.svg.png',
        'crusades':       'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Counquest_of_Jeusalem_%281099%29.jpg/960px-Counquest_of_Jeusalem_%281099%29.jpg',
        'hundred-years':  'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Bataille_d%27Azincourt.jpg/960px-Bataille_d%27Azincourt.jpg',
        'mongol-conquest':'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/MongolEmpireDivisions1300.png/960px-MongolEmpireDivisions1300.png',
        'imjin':          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Battle_of_Hansando.JPG/960px-Battle_of_Hansando.JPG',
        'thirty-years':   'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Sebastiaen_Vrancx_-_The_Battle_of_White_Mountain.jpg/960px-Sebastiaen_Vrancx_-_The_Battle_of_White_Mountain.jpg',
        'napoleonic':     'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Napoleon_at_the_Battle_of_Austerlitz%2C_by_Fran%C3%A7ois_G%C3%A9rard.jpg/960px-Napoleon_at_the_Battle_of_Austerlitz%2C_by_Fran%C3%A7ois_G%C3%A9rard.jpg',
        'american-civil': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Thure_de_Thulstrup_-_L._Prang_and_Co._-_Battle_of_Gettysburg_-_Restoration_by_Adam_Cuerden.jpg/960px-Thure_de_Thulstrup_-_L._Prang_and_Co._-_Battle_of_Gettysburg_-_Restoration_by_Adam_Cuerden.jpg',
        'russo-japanese': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Battle_of_Tsushima_Russian.jpg/960px-Battle_of_Tsushima_Russian.jpg',
        'crimean':        'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Battle_of_balaklava.jpg/960px-Battle_of_balaklava.jpg',
        'ww1':            'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Cheshire_Regiment_trench_Somme_1916.jpg/960px-Cheshire_Regiment_trench_Somme_1916.jpg',
        'ww2':            'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Into_the_Jaws_of_Death_23-0455M_edit.jpg/960px-Into_the_Jaws_of_Death_23-0455M_edit.jpg',
        'korean':         'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/B-26_Marauders_in_action_during_the_Korean_war.jpg/960px-B-26_Marauders_in_action_during_the_Korean_war.jpg',
        'vietnam':        'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/UH-1D_helicopters_in_Vietnam_1966.jpg/960px-UH-1D_helicopters_in_Vietnam_1966.jpg',
        'gulf':           'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/DesertStormMap_v2.svg/960px-DesertStormMap_v2.svg.png'
    };

    // 전체 전쟁 데이터 (자동 크로스 링크용)
    let allWarsData = [];

    // 데이터 로드 및 렌더링
    async function init() {
        const warId = getWarId();
        if (!warId || !warFileMap[warId]) {
            showError();
            return;
        }

        try {
            // 모든 전쟁 데이터를 병렬 로드 (크로스 링크용)
            const fileEntries = Object.entries(warFileMap);
            const allResponses = await Promise.all(
                fileEntries.map(([id, fileName]) =>
                    fetch('../../data/war overview data/' + encodeURIComponent(fileName) + '.json')
                        .then(res => res.ok ? res.json() : null)
                        .catch(() => null)
                )
            );
            allWarsData = allResponses.filter(w => w !== null);

            const war = allWarsData.find(w => w.id === warId);
            if (!war || !war.detail) {
                showError();
                return;
            }

            renderDocument(war);
        } catch (err) {
            console.error('데이터 로드 오류:', err);
            showError();
        }
    }

    // 전투명으로 다른 전쟁의 전투를 검색하여 링크 대상 찾기
    function findLinkedWar(battleName, currentWarId) {
        for (const otherWar of allWarsData) {
            if (otherWar.id === currentWarId) continue;
            if (!otherWar.detail || !otherWar.detail.majorBattles) continue;
            for (const otherBattle of otherWar.detail.majorBattles) {
                if (otherBattle.name === battleName) {
                    return otherWar.id;
                }
            }
        }
        // 전투명이 다른 전쟁의 이름과 일치하는지도 확인
        for (const otherWar of allWarsData) {
            if (otherWar.id === currentWarId) continue;
            if (otherWar.name === battleName) {
                return otherWar.id;
            }
        }
        return null;
    }

    function showError() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    }

    function renderDocument(war) {
        const detail = war.detail;

        // 페이지 타이틀 설정
        document.title = escapeHTML(war.name) + ' — War Archive';

        // 헤더 정보
        document.getElementById('breadcrumbTitle').textContent = war.name;
        document.getElementById('docTitle').textContent = war.name;

        // 자료형 헤더 이미지 (있을 때만 doc-header 위에 삽입)
        const heroSrc = war.heroImage || warHeroImages[war.id];
        if (heroSrc) {
            const docHeader = document.querySelector('.doc-header');
            if (docHeader && !docHeader.querySelector('.doc-hero-image')) {
                const wrap = document.createElement('div');
                wrap.className = 'doc-hero-image';
                const img = document.createElement('img');
                img.src = heroSrc;
                img.alt = war.name + ' 자료 이미지';
                img.loading = 'lazy';
                img.referrerPolicy = 'no-referrer';
                img.onerror = function () { wrap.remove(); };
                wrap.appendChild(img);
                docHeader.insertBefore(wrap, docHeader.firstChild);
            }
        }

        // 시대 배지
        const badge = document.getElementById('docEraBadge');
        badge.textContent = eraLabels[war.era] || war.era;
        badge.classList.add(war.era);

        // 메타 정보
        document.getElementById('docPeriod').textContent = war.period;
        document.getElementById('docLocation').textContent = war.location;
        document.getElementById('docBelligerents').textContent = war.belligerents;
        document.getElementById('docResult').textContent = war.result;

        // 태그
        const tagsEl = document.getElementById('docTags');
        tagsEl.innerHTML = war.tags.map(t =>
            '<span class="doc-tag">' + escapeHTML(t) + '</span>'
        ).join('');

        // 목차 생성
        buildTOC();

        // 개요
        document.getElementById('docSummary').textContent = war.summary;

        // 배경
        document.getElementById('docBackground').textContent = detail.background;

        // 원인
        const causesEl = document.getElementById('docCauses');
        causesEl.innerHTML = detail.causes.map(c =>
            '<li>' + escapeHTML(c) + '</li>'
        ).join('');

        // 전쟁 경과
        const phasesEl = document.getElementById('docPhases');
        phasesEl.innerHTML = detail.phases.map(p => `
            <div class="phase-item">
                <div class="phase-period">${escapeHTML(p.period)}</div>
                <div class="phase-title">${escapeHTML(p.title)}</div>
                <div class="phase-desc">${escapeHTML(p.description)}</div>
            </div>
        `).join('');

        // 주요 전투
        const battlesEl = document.getElementById('docBattles');
        battlesEl.innerHTML = detail.majorBattles.map(b => {
            const linkedWarId = findLinkedWar(b.name, war.id);
            const nameHTML = linkedWarId
                ? `<a href="war overview detail.html?id=${encodeURIComponent(linkedWarId)}" class="battle-link">${escapeHTML(b.name)}</a>`
                : escapeHTML(b.name);
            return `
            <div class="battle-card${linkedWarId ? ' battle-card-linked' : ''}">
                <div class="battle-header">
                    <span class="battle-name">${nameHTML}</span>
                    <span class="battle-date">${escapeHTML(b.date)}</span>
                </div>
                <div class="battle-desc">${escapeHTML(b.description)}</div>
                <div class="battle-result"><strong>결과:</strong> ${escapeHTML(b.result)}</div>
            </div>
        `;
        }).join('');

        // 주요 인물
        const figuresEl = document.getElementById('docFigures');
        figuresEl.innerHTML = detail.keyFigures.map(f => `
            <div class="figure-card">
                <div class="figure-name">${escapeHTML(f.name)}</div>
                <div class="figure-side">${escapeHTML(f.side)}</div>
                <div class="figure-role">${escapeHTML(f.role)}</div>
            </div>
        `).join('');

        // 피해 규모
        const casualtiesEl = document.getElementById('docCasualties');
        casualtiesEl.innerHTML = `
            <div class="casualty-side">
                <div class="casualty-label">측 1</div>
                <div class="casualty-value">${escapeHTML(detail.casualties.side1)}</div>
            </div>
            <div class="casualty-side">
                <div class="casualty-label">측 2</div>
                <div class="casualty-value">${escapeHTML(detail.casualties.side2)}</div>
            </div>
        `;

        // 결과 및 영향
        document.getElementById('docAftermath').textContent = detail.aftermath;

        // 역사적 의의
        document.getElementById('docSignificance').textContent = detail.significance;

        // 참고 자료
        const refsEl = document.getElementById('docReferences');
        refsEl.innerHTML = detail.references.map(r => `
            <li>
                <div class="ref-title">${escapeHTML(r.title)}</div>
                <div class="ref-author">${escapeHTML(r.author)}, ${escapeHTML(r.year)}</div>
                ${r.note ? '<div class="ref-note">' + escapeHTML(r.note) + '</div>' : ''}
            </li>
        `).join('');

        // 로딩 해제, 문서 표시
        document.getElementById('loading').style.display = 'none';
        document.getElementById('document').style.display = 'block';

        // 사이드 목차 초기화
        buildSideTOC();
        setupScrollSpy();
    }

    function buildTOC() {
        const tocList = document.getElementById('tocList');
        tocList.innerHTML = sections.map(s =>
            '<li><a href="#' + s.id + '">' + escapeHTML(s.title) + '</a></li>'
        ).join('');
    }

    function buildSideTOC() {
        const sideTocList = document.getElementById('sideTocList');
        sideTocList.innerHTML = sections.map(s =>
            '<li><a href="#' + s.id + '" data-section="' + s.id + '">' + escapeHTML(s.title) + '</a></li>'
        ).join('');
    }

    function setupScrollSpy() {
        const sideLinks = document.querySelectorAll('.side-toc-list a');
        if (!sideLinks.length) return;

        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    sideLinks.forEach(l => l.classList.remove('active'));
                    const activeLink = document.querySelector('.side-toc-list a[data-section="' + entry.target.id + '"]');
                    if (activeLink) activeLink.classList.add('active');
                }
            });
        }, { rootMargin: '-100px 0px -60% 0px', threshold: 0 });

        sections.forEach(s => {
            const el = document.getElementById(s.id);
            if (el) observer.observe(el);
        });
    }

    // 스무스 스크롤
    document.addEventListener('click', function (e) {
        const link = e.target.closest('a[href^="#"]');
        if (!link) return;
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    // 초기화
    document.addEventListener('DOMContentLoaded', init);
})();
