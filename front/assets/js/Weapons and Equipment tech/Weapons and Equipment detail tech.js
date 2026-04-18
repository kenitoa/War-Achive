// Weapons & Equipment Detail — 카테고리 목록 스크립트

(function () {
    'use strict';

    var ITEMS_PER_PAGE = 16; // 4 × 4 그리드

    // 카테고리 정보
    var categoryInfo = {
        melee: {
            title: '근접 무기',
            desc: '검, 창, 도끼, 둔기 등 냉병기 시대의 주력 무기',
            icon: '../../assets/images/weapons/melee.svg',
            files: ['gladius', 'katana', 'longsword', 'pilum']
        },
        ranged: {
            title: '원거리 무기',
            desc: '활, 석궁, 투석기 등 물리적 투사체를 활용한 무기',
            icon: '../../assets/images/weapons/ranged.svg',
            files: ['english longbow', 'crossbow', 'yumi']
        },
        firearms: {
            title: '화기',
            desc: '소총, 권총, 기관총, 저격총 등 화약을 이용한 개인 화기',
            icon: '../../assets/images/weapons/firearms.svg',
            files: ['ak-47', 'm16', 'stg44', 'bar m1918']
        },
        artillery: {
            title: '포병 / 폭발물',
            desc: '대포, 박격포, 로켓, 미사일, 폭탄 등 중화기 및 폭발 무기',
            icon: '../../assets/images/weapons/artillery.svg',
            files: ['katyusha', 'm101 howitzer', 'v-2 rocket']
        },
        armor: {
            title: '기갑 / 차량',
            desc: '전차, 장갑차, 자주포, 군용 차량 등 지상 기갑 전력',
            icon: '../../assets/images/weapons/armor.svg',
            files: ['m4 sherman', 'tiger i', 't-34']
        },
        aircraft: {
            title: '항공기',
            desc: '전투기, 폭격기, 정찰기, 수송기, 헬리콥터 등 항공 전력',
            icon: '../../assets/images/weapons/aircraft.svg',
            files: ['p-51 mustang', 'spitfire', 'bf109']
        },
        naval: {
            title: '함선',
            desc: '갤리선, 전열함, 전함, 항공모함, 잠수함 등 해상 전력',
            icon: '../../assets/images/weapons/naval.svg',
            files: ['geobukseon', 'hms dreadnought', 'type vii u-boat']
        },
        defense: {
            title: '방어 장비',
            desc: '갑옷, 방패, 헬멧, 방탄복, 요새 등 방어용 장비와 구조물',
            icon: '../../assets/images/weapons/defense.svg',
            files: ['plate armor', 'roman scutum', 'samurai armor']
        }
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

    // XSS 방지
    function escapeHTML(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // URL 파라미터에서 카테고리 추출
    function getCategoryId() {
        var params = new URLSearchParams(window.location.search);
        return params.get('category');
    }

    // 카테고리의 모든 JSON 로드
    function loadCategoryItems(category) {
        var info = categoryInfo[category];
        if (!info) return Promise.reject(new Error('Unknown category'));

        var promises = info.files.map(function (file) {
            var path = '/data/weapons-and-equipment/' + category + '/' + file + '.json';
            return fetch(path)
                .then(function (res) {
                    if (!res.ok) throw new Error('Not found: ' + file);
                    return res.json();
                })
                .then(function (data) {
                    data._fileId = category + '/' + file;
                    return data;
                })
                .catch(function () {
                    return null;
                });
        });

        return Promise.all(promises).then(function (results) {
            return results.filter(Boolean);
        });
    }

    // 페이지 렌더
    function renderPage(category, items) {
        var info = categoryInfo[category];

        // 브레드크럼
        document.getElementById('breadcrumbCategory').textContent = info.title;
        document.title = info.title + ' — War Archive';

        // 카테고리 헤더
        var iconWrap = document.getElementById('categoryIcon');
        iconWrap.innerHTML = '<img src="' + escapeHTML(info.icon) + '" alt="' + escapeHTML(info.title) + '" referrerpolicy="no-referrer">';

        document.getElementById('categoryTitle').textContent = info.title;
        document.getElementById('categoryDesc').textContent = info.desc;
        document.getElementById('itemCount').textContent = '총 ' + items.length + '건';

        // 페이지네이션 상태
        var totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
        var currentPage = 1;

        // URL에서 페이지 번호 추출
        var params = new URLSearchParams(window.location.search);
        var pageParam = parseInt(params.get('page'), 10);
        if (pageParam && pageParam >= 1 && pageParam <= totalPages) {
            currentPage = pageParam;
        }

        renderGrid(items, currentPage, category);
        renderPagination(totalPages, currentPage, category);
    }

    // 그리드 렌더링
    function renderGrid(items, page, category) {
        var grid = document.getElementById('itemsGrid');
        var start = (page - 1) * ITEMS_PER_PAGE;
        var end = Math.min(start + ITEMS_PER_PAGE, items.length);
        var pageItems = items.slice(start, end);
        var info = categoryInfo[category];

        if (pageItems.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1; text-align:center; padding:3rem;">등록된 항목이 없습니다.</p>';
            return;
        }

        grid.innerHTML = pageItems.map(function (item) {
            var href = 'Weapons and Equipment item.html?id=' + encodeURIComponent(item._fileId);
            var eraText = eraLabels[item.era] || item.era || '';
            var originText = item.origin || '';

            var imgSrc = item.image || info.icon;

            return '<a class="item-card" href="' + href + '">' +
                '<div class="item-card-icon"><img src="' + escapeHTML(imgSrc) + '" alt="" referrerpolicy="no-referrer"></div>' +
                '<div class="item-card-name">' + escapeHTML(item.name) + '</div>' +
                '<div class="item-card-name-en">' + escapeHTML(item.nameEn) + '</div>' +
                '<div class="item-card-meta">' +
                (eraText ? '<span class="item-card-badge">' + escapeHTML(eraText) + '</span>' : '') +
                (originText ? '<span class="item-card-badge">' + escapeHTML(originText) + '</span>' : '') +
                '</div>' +
                '</a>';
        }).join('');
    }

    // 페이지네이션 렌더링
    function renderPagination(totalPages, currentPage, category) {
        var pagination = document.getElementById('pagination');

        if (totalPages <= 1) {
            pagination.innerHTML = '';
            return;
        }

        var html = '';

        // 이전 버튼
        if (currentPage > 1) {
            html += '<a class="page-btn arrow" href="?category=' + encodeURIComponent(category) + '&page=' + (currentPage - 1) + '">‹</a>';
        } else {
            html += '<span class="page-btn arrow disabled">‹</span>';
        }

        // 페이지 번호
        for (var i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                html += '<span class="page-btn active">' + i + '</span>';
            } else {
                html += '<a class="page-btn" href="?category=' + encodeURIComponent(category) + '&page=' + i + '">' + i + '</a>';
            }
        }

        // 다음 버튼
        if (currentPage < totalPages) {
            html += '<a class="page-btn arrow" href="?category=' + encodeURIComponent(category) + '&page=' + (currentPage + 1) + '">›</a>';
        } else {
            html += '<span class="page-btn arrow disabled">›</span>';
        }

        pagination.innerHTML = html;
    }

    // 초기화
    document.addEventListener('DOMContentLoaded', function () {
        var category = getCategoryId();

        if (!category || !categoryInfo[category]) {
            // 잘못된 카테고리 → 목록 페이지로 리다이렉트
            window.location.href = 'Weapons and Equipment.html';
            return;
        }

        loadCategoryItems(category)
            .then(function (items) {
                renderPage(category, items);
            })
            .catch(function () {
                window.location.href = 'Weapons and Equipment.html';
            });
    });

})();
