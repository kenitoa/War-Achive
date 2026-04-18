// Weapons & Equipment History — 시대별 무기 목록 스크립트

(function () {
    'use strict';

    // 시대 정보
    var eraInfo = {
        ancient: {
            label: '고대',
            title: 'BC 3000 ~ AD 476',
            desc: '청동·철기 시대의 냉병기, 고대 공성 무기, 갤리선. 로마 군단과 그리스 팔랑크스가 활약한 시대의 무기와 장비를 수록합니다.'
        },
        medieval: {
            label: '중세',
            title: '476 ~ 1453',
            desc: '기사 갑옷, 장궁, 석궁, 공성 장비, 초기 화약 무기. 십자군 전쟁과 백년전쟁 시기의 무기 발전사를 다룹니다.'
        },
        earlymodern: {
            label: '근세',
            title: '1453 ~ 1789',
            desc: '화승총, 플린트록, 전열함, 대포의 발전. 화약 무기가 전장을 지배하기 시작한 시대의 장비를 기록합니다.'
        },
        modern: {
            label: '근대',
            title: '1789 ~ 1914',
            desc: '소총 혁명, 기관총 등장, 철갑함, 산업화 전쟁. 나폴레옹 전쟁부터 제1차 세계대전 직전까지의 무기 발전을 수록합니다.'
        },
        worldwar: {
            label: '세계대전',
            title: '1914 ~ 1945',
            desc: '전차, 전투기, 항공모함, 원자폭탄의 시대. 두 차례 세계대전에서 사용된 무기와 장비를 총망라합니다.'
        },
        contemporary: {
            label: '현대',
            title: '1945 ~ 현재',
            desc: '스텔스, 정밀유도무기, 드론, 사이버 전쟁. 냉전기부터 현대 전장까지의 첨단 무기 체계를 기록합니다.'
        }
    };

    // 카테고리 정보
    var categoryInfo = {
        melee:     { title: '근접 무기',      icon: '../../assets/images/weapons/melee.svg',     files: ['gladius', 'katana', 'longsword', 'pilum'] },
        ranged:    { title: '원거리 무기',    icon: '../../assets/images/weapons/ranged.svg',    files: ['english longbow', 'crossbow', 'yumi'] },
        firearms:  { title: '화기',          icon: '../../assets/images/weapons/firearms.svg',  files: ['ak-47', 'm16', 'stg44', 'bar m1918'] },
        artillery: { title: '포병 / 폭발물', icon: '../../assets/images/weapons/artillery.svg', files: ['katyusha', 'm101 howitzer', 'v-2 rocket'] },
        armor:     { title: '기갑 / 차량',   icon: '../../assets/images/weapons/armor.svg',     files: ['m4 sherman', 'tiger i', 't-34'] },
        aircraft:  { title: '항공기',        icon: '../../assets/images/weapons/aircraft.svg',  files: ['p-51 mustang', 'spitfire', 'bf109'] },
        naval:     { title: '함선',          icon: '../../assets/images/weapons/naval.svg',     files: ['geobukseon', 'hms dreadnought', 'type vii u-boat'] },
        defense:   { title: '방어 장비',     icon: '../../assets/images/weapons/defense.svg',   files: ['plate armor', 'roman scutum', 'samurai armor'] }
    };

    // XSS 방지
    function escapeHTML(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // URL 파라미터에서 시대 추출
    function getEraId() {
        var params = new URLSearchParams(window.location.search);
        return params.get('era');
    }

    // 모든 카테고리의 JSON 로드
    function loadAllItems() {
        var promises = [];

        Object.keys(categoryInfo).forEach(function (cat) {
            categoryInfo[cat].files.forEach(function (file) {
                var path = '/data/weapons-and-equipment/' + cat + '/' + file + '.json';
                promises.push(
                    fetch(path)
                        .then(function (res) {
                            if (!res.ok) throw new Error('Not found');
                            return res.json();
                        })
                        .then(function (data) {
                            data._fileId = cat + '/' + file;
                            return data;
                        })
                        .catch(function () { return null; })
                );
            });
        });

        return Promise.all(promises).then(function (results) {
            return results.filter(Boolean);
        });
    }

    // 시대에 맞는 아이템 필터링
    function filterByEra(items, era) {
        return items.filter(function (item) {
            return item.era === era;
        });
    }

    // 카테고리별 그룹핑
    function groupByCategory(items) {
        var groups = {};
        items.forEach(function (item) {
            var cat = item.category || 'unknown';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        return groups;
    }

    // 페이지 렌더
    function renderPage(era, items) {
        var info = eraInfo[era];
        var loading = document.getElementById('loading');
        loading.style.display = 'none';

        // 시대별 클래스 적용
        document.querySelector('.era-hero').classList.add('era-' + era);
        document.getElementById('eraAccent').style.background = '';

        // 브레드크럼
        document.getElementById('breadcrumbEra').textContent = info.label;
        document.title = info.label + ' 시대의 무기 — War Archive';

        // 히어로
        document.getElementById('eraLabel').textContent = info.label;
        document.getElementById('eraTitle').textContent = info.title;
        document.getElementById('eraDesc').textContent = info.desc;
        document.getElementById('eraItemCount').innerHTML =
            '수록 무기 <strong>' + items.length + '</strong>건';

        // 카테고리별 그룹핑 & 렌더링
        var groups = groupByCategory(items);
        var container = document.getElementById('weaponSections');

        // 카테고리 순서 유지
        var catOrder = ['melee', 'ranged', 'firearms', 'artillery', 'armor', 'aircraft', 'naval', 'defense'];
        var html = '';

        catOrder.forEach(function (cat) {
            if (!groups[cat] || groups[cat].length === 0) return;

            var catInfo = categoryInfo[cat] || { title: cat, icon: '' };
            var catItems = groups[cat];

            html += '<section class="weapon-category-section">';
            html += '<div class="weapon-category-header">';
            html += '<img class="weapon-category-icon" src="' + escapeHTML(catInfo.icon) + '" alt="" referrerpolicy="no-referrer">';
            html += '<h2 class="weapon-category-title">' + escapeHTML(catInfo.title) + '</h2>';
            html += '<span class="weapon-category-count">' + catItems.length + '건</span>';
            html += '</div>';

            html += '<div class="weapon-grid">';
            catItems.forEach(function (item) {
                var href = 'Weapons and Equipment item.html?id=' + encodeURIComponent(item._fileId);
                var imgSrc = item.image || catInfo.icon;
                var origin = item.origin || '';
                var period = item.period || '';

                html += '<a class="weapon-card" href="' + href + '">';
                html += '<div class="weapon-card-img"><img src="' + escapeHTML(imgSrc) + '" alt="" referrerpolicy="no-referrer"></div>';
                html += '<div class="weapon-card-body">';
                html += '<div class="weapon-card-name">' + escapeHTML(item.name) + '</div>';
                html += '<div class="weapon-card-name-en">' + escapeHTML(item.nameEn) + '</div>';
                html += '<div class="weapon-card-meta">';
                if (origin) html += '<span class="weapon-card-badge">' + escapeHTML(origin) + '</span>';
                if (period) html += '<span class="weapon-card-badge">' + escapeHTML(period) + '</span>';
                html += '</div>';
                html += '</div>';
                html += '</a>';
            });
            html += '</div>';
            html += '</section>';
        });

        if (!html) {
            html = '<div class="empty-state"><p>이 시대에 등록된 무기가 없습니다.</p></div>';
        }

        container.innerHTML = html;
    }

    // 에러 표시
    function showError() {
        var loading = document.getElementById('loading');
        loading.innerHTML = '<p style="color:var(--text-muted);">페이지를 불러올 수 없습니다. <a href="Weapons and Equipment.html" style="color:var(--accent);">목록으로 돌아가기</a></p>';
    }

    // 초기화
    document.addEventListener('DOMContentLoaded', function () {
        var era = getEraId();

        if (!era || !eraInfo[era]) {
            showError();
            return;
        }

        loadAllItems()
            .then(function (allItems) {
                var eraItems = filterByEra(allItems, era);
                renderPage(era, eraItems);
            })
            .catch(function () {
                showError();
            });
    });

})();
