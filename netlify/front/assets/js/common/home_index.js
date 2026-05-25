document.addEventListener("DOMContentLoaded", () => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const TYPE_LABELS = {
    war: "전쟁 개요",
    bio: "인물",
    battle: "전투",
    weapons: "무기",
    docs: "사료",
    tactics: "전략·전술",
    undefine: "미확인",
  };
  const ERA_LABELS = {
    ancient: "고대",
    medieval: "중세",
    earlymodern: "근세",
    modern: "근대",
    worldwar: "세계대전",
    contemporary: "현대",
  };
  const REGION_LABELS = {
    eastasia: "동아시아",
    europe: "유럽",
    middleeast: "중동",
    americas: "아메리카",
    africa: "아프리카",
    oceania: "오세아니아",
    global: "전지구·기타",
  };
  const CRED_LABELS = {
    verified: "검증됨",
    disputed: "논쟁 있음",
    unverified: "미확인",
    oral: "구전 자료",
  };
  const ERA_RANK = { ancient: 1, medieval: 2, earlymodern: 3, modern: 4, worldwar: 5, contemporary: 6 };
  const CRED_RANK = { verified: 1, disputed: 2, unverified: 3, oral: 4 };
  const TYPE_ORDER = { war: 1, bio: 2, battle: 3, weapons: 4, docs: 5, tactics: 6, undefine: 7 };

  const REGION_MAP = {
    일본: "eastasia",
    조선: "eastasia",
    한국: "eastasia",
    몽골: "eastasia",
    베트남: "eastasia",
    중국: "eastasia",
    "유럽 / 중국": "eastasia",
    독일: "europe",
    "나치 독일": "europe",
    프랑스: "europe",
    영국: "europe",
    "잉글랜드 / 웨일스": "europe",
    잉글랜드: "europe",
    스파르타: "europe",
    마케도니아: "europe",
    로마: "europe",
    "로마 공화국": "europe",
    카르타고: "europe",
    소련: "europe",
    유럽: "europe",
    "쿠르드 / 아이유브 왕조": "middleeast",
    "아이유브 왕조": "middleeast",
    오스만: "middleeast",
    페르시아: "middleeast",
    미국: "americas",
    이집트: "africa",
    에티오피아: "africa",
  };

  const SOURCES = [
    {
      type: "war",
      category: "전쟁개요",
      url: "data/search/war overview search.json",
      map: (d) => ({
        name: d.name,
        desc: d.summary || d.period,
        era: normEra(d.era),
        region: normRegion(d.region),
        credibility: "verified",
        year: extractYear(d.period),
        searchText: [d.name, d.era, d.region, d.period, d.summary, d.belligerents, join(d.tags)],
        image: getRecordImage(d),
        url: d.url,
      }),
    },
    {
      type: "bio",
      category: "인물",
      url: "data/search/biography of people search.json",
      map: (d) => ({
        name: d.name,
        desc: d.title || d.summary,
        era: normEra(d.era),
        region: normRegion(d.nationality),
        credibility: "verified",
        year: extractYear(d.birth) || extractYear(d.period),
        searchText: [d.name, d.title, d.role, d.nationality, d.summary, join(d.tags), join(d.wars)],
        image: getRecordImage(d),
        url: d.url,
      }),
    },
    {
      type: "battle",
      category: "전장지도",
      url: "data/search/Battlefield Map search.json",
      map: (d) => ({
        name: d.titleKr || d.title,
        desc: d.description,
        era: normEra(d.era),
        region: normRegion(d.theater),
        credibility: "verified",
        year: extractYear(d.date),
        searchText: [d.title, d.titleKr, d.era, d.theater, d.description, join(d.commanders), join(d.keywords)],
        image: getRecordImage(d),
        url: d.url,
      }),
    },
    {
      type: "weapons",
      category: "무기장비",
      url: "data/search/weapons and equipment search.json",
      map: (d) => ({
        name: d.name,
        desc: d.nameEn || d.category || d.overview,
        era: normEra(d.era),
        region: normRegion(d.origin),
        credibility: "verified",
        searchText: [d.name, d.nameEn, d.category, d.era, d.origin, join(d.tags), d.overview],
        image: getRecordImage(d),
        url: d.url,
      }),
    },
    {
      type: "docs",
      category: "사료",
      url: "data/search/Historical Sources & Documents search.json",
      map: (d) => ({
        name: d.titleKr || d.title,
        desc: d.description,
        era: normEra(d.era),
        region: normRegion(d.region || d.author),
        credibility: "verified",
        year: extractYear(d.date) || extractYear(d.year),
        searchText: [d.title, d.titleKr, d.type, d.era, d.author, d.description, join(d.keywords)],
        image: getRecordImage(d),
        url: d.url,
      }),
    },
    {
      type: "tactics",
      category: "전략전술",
      url: "data/search/strategy and tactics search.json",
      map: (d) => ({
        name: d.titleKr || d.title,
        desc: d.description,
        era: normEra(d.era),
        region: normRegion(d.region),
        credibility: "verified",
        searchText: [d.title, d.titleKr, d.era, d.category, d.description, d.keyFigure, join(d.keywords)],
        image: getRecordImage(d),
        url: d.url,
      }),
    },
    {
      type: "undefine",
      category: "미확인",
      url: "data/search/Undefine facts search.json",
      map: (d) => ({
        name: d.name,
        desc: d.nameEn || d.summary,
        era: normEra(d.era),
        region: normRegion(d.origin),
        credibility: credibilityFromShelf(d.shelf),
        searchText: [d.name, d.nameEn, d.shelf, d.era, d.origin, d.summary, join(d.tags)],
        image: getRecordImage(d),
        url: d.url,
      }),
    },
  ];

  let indexPromise;
  let allItems = [];
  let searchMatches = [];
  let currentQuery = "";
  const sectionPagers = [];

  initTheme();
  initMenu();
  initFade();
  initSmoothAnchors();
  loadIndex().then((items) => {
    allItems = items;
    renderStats(items);
    renderCategoryCards(items);
    renderFeatured(items);
    initSectionPagers();
    initSearch();
    initBrowse();
    updateActiveNav();
  });
  initActiveNav();

  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = Promise.all(
      SOURCES.map((source) =>
        fetch(source.url)
          .then((response) => (response.ok ? response.json() : []))
          .then((rows) =>
            (Array.isArray(rows) ? rows : [])
              .map(source.map)
              .filter((item) => item && item.name)
              .map((item) => ({
                ...item,
                type: source.type,
                category: source.category,
                searchText: item.searchText.filter(Boolean).join(" "),
                credibility: item.credibility || "verified",
              }))
          )
          .catch(() => [])
      )
    ).then((groups) => groups.flat());
    return indexPromise;
  }

  function initMenu() {
    const toggle = $(".menu-toggle");
    const nav = $(".nav-links");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
    $$(".nav-links a").forEach((link) => link.addEventListener("click", () => nav.classList.remove("open")));
  }

  function initTheme() {
    const toggle = $("#themeToggle");
    if (!toggle) return;

    const storageKey = "war-archive-theme";
    const getTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    const applyTheme = (theme) => {
      const isDark = theme === "dark";
      document.documentElement.dataset.theme = isDark ? "dark" : "";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute("aria-label", isDark ? "라이트 모드 켜기" : "다크 모드 켜기");
      toggle.title = isDark ? "라이트 모드" : "다크 모드";
    };

    applyTheme(getTheme());
    toggle.addEventListener("click", () => {
      const nextTheme = getTheme() === "dark" ? "light" : "dark";
      applyTheme(nextTheme);
      try {
        localStorage.setItem(storageKey, nextTheme);
      } catch {
        /* Theme persistence is optional when storage is blocked. */
      }
    });
  }

  function initFade() {
    const items = $$(".fade-in");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -50px 0px", threshold: 0.12 }
    );
    items.forEach((item) => observer.observe(item));
  }

  function initSmoothAnchors() {
    $$('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (event) => {
        const target = $(anchor.getAttribute("href"));
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function initSectionPagers() {
    sectionPagers.length = 0;
    setupSectionPager("#featuredGrid", ".featured-card", "추천 기록", () => responsiveCount(4, 2, 1));
    setupSectionPager(".timeline-track", ".timeline-node", "역사 연표", () => responsiveCount(5, 3, 1));
    setupSectionPager(".categories-grid", ".category-card", "컬렉션", () => responsiveCount(5, 3, 1));
    setupSectionPager(".project-grid", ".project-card", "이용 안내", () => responsiveCount(3, 2, 1));
    refreshSectionPagers();
    window.addEventListener("resize", debounce(refreshSectionPagers, 160), { passive: true });
  }

  function setupSectionPager(containerSelector, itemSelector, label, perPage) {
    const container = $(containerSelector);
    if (!container) return;
    const items = Array.from(container.children).filter((child) => child.matches(itemSelector));
    if (!items.length) return;

    const pagerId = container.id || `pager-${sectionPagers.length + 1}`;
    container.dataset.page = container.dataset.page || "1";
    container.classList.add("paged-grid");

    let controls = container.parentElement.querySelector(`.section-pager-controls[data-for="${pagerId}"]`);
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "section-pager-controls";
      controls.dataset.for = pagerId;
      controls.setAttribute("aria-label", `${label} 페이지 이동`);
      container.insertAdjacentElement("afterend", controls);
    }

    const pager = { container, controls, itemSelector, label, perPage };
    sectionPagers.push(pager);

    if (!controls.dataset.bound) {
      controls.dataset.bound = "true";
      controls.addEventListener("click", (event) => {
        const button = event.target.closest("[data-pager-action], [data-pager-page]");
        if (!button) return;
        const current = Number(container.dataset.page || "1");
        if (button.dataset.pagerAction === "prev") container.dataset.page = String(current - 1);
        if (button.dataset.pagerAction === "next") container.dataset.page = String(current + 1);
        if (button.dataset.pagerPage) container.dataset.page = button.dataset.pagerPage;
        refreshSectionPager(pager);
      });
    }
  }

  function refreshSectionPagers() {
    sectionPagers.forEach(refreshSectionPager);
  }

  function refreshSectionPager(pager) {
    const items = Array.from(pager.container.children).filter((child) => child.matches(pager.itemSelector));
    const perPage = Math.max(1, Number(pager.perPage()) || 1);
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const page = Math.min(Math.max(1, Number(pager.container.dataset.page || "1")), totalPages);
    const start = (page - 1) * perPage;
    const end = start + perPage;

    pager.container.dataset.page = String(page);
    pager.container.style.setProperty("--paged-columns", String(Math.min(perPage, items.length || perPage)));
    items.forEach((item, index) => {
      const visible = index >= start && index < end;
      item.hidden = !visible;
      item.classList.toggle("is-pager-hidden", !visible);
    });

    pager.controls.hidden = totalPages <= 1;
    pager.controls.innerHTML = totalPages <= 1
      ? ""
      : `<button type="button" class="section-pager-btn" data-pager-action="prev" ${page === 1 ? "disabled" : ""} aria-label="${escapeHtml(pager.label)} 이전 페이지">←</button>
        <span class="section-pager-status">${page} / ${totalPages}</span>
        <div class="section-pager-dots" aria-hidden="true">${Array.from({ length: totalPages }, (_, index) => `<button type="button" class="section-pager-dot ${index + 1 === page ? "active" : ""}" data-pager-page="${index + 1}" tabindex="-1"></button>`).join("")}</div>
        <button type="button" class="section-pager-btn" data-pager-action="next" ${page === totalPages ? "disabled" : ""} aria-label="${escapeHtml(pager.label)} 다음 페이지">→</button>`;
  }

  function responsiveCount(desktop, tablet, mobile) {
    if (window.innerWidth <= 720) return mobile;
    if (window.innerWidth <= 1240) return tablet;
    return desktop;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), delay);
    };
  }

  function initActiveNav() {
    window.addEventListener("scroll", updateActiveNav, { passive: true });
  }

  function updateActiveNav() {
    const sections = $$("main section[id]");
    const navLinks = $$(".nav-links a[href^='#']");
    let current = sections[0]?.id || "";
    sections.forEach((section) => {
      if (window.scrollY >= section.offsetTop - 120) current = section.id;
    });
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${current}`));
  }

  function renderStats(items) {
    const counts = countByType(items);
    setCount("statWarCount", counts.war || 0, "건");
    setCount("statDocCount", (counts.war || 0) + (counts.bio || 0) + (counts.weapons || 0) + (counts.tactics || 0) + (counts.docs || 0) + (counts.battle || 0), "건");
    setCount("statPeopleCount", counts.bio || 0, "명");
    setCount("statBattleCount", counts.battle || 0, "건");

    const time = $("#statsUpdated");
    if (time) {
      const iso = new Date().toISOString().slice(0, 10);
      time.dateTime = iso;
      time.textContent = iso;
    }
  }

  function setCount(id, value, suffix) {
    const element = $(`#${id}`);
    if (!element) return;
    element.dataset.count = value;
    element.dataset.suffix = suffix;
    element.textContent = `${value.toLocaleString()}${suffix}`;
  }

  function renderCategoryCards(items) {
    const config = {
      war: ["warOverviewCount", "warOverviewMeta", "건의 기록", "region"],
      bio: ["biographyCount", "biographyMeta", "명 수록", "region"],
      battle: ["battlefieldMapCount", "battlefieldMapMeta", "건의 기록", "region"],
      weapons: ["weaponsCount", "weaponsMeta", "건의 기록", "region"],
      docs: ["historicalSourcesCount", "historicalSourcesMeta", "건의 기록", "region"],
      tactics: ["strategyTacticsCount", "strategyTacticsMeta", "건의 기록", "region"],
      undefine: ["undefineCount", "undefineMeta", "건의 자료", "region"],
    };
    Object.entries(config).forEach(([type, [countId, metaId, suffix, regionKey]]) => {
      const group = items.filter((item) => item.type === type);
      const count = $(`#${countId}`);
      if (count) count.textContent = `${group.length.toLocaleString()}${suffix}`;
      const imageItem = group.find((item) => item.image);
      const card = count?.closest(".category-card");
      if (card) applyCardImage(card, imageItem?.image || "");
      setMeta(metaId, {
        era: summarize(group.map((item) => item.era), ERA_LABELS, ERA_RANK),
        [regionKey]: summarize(group.map((item) => item.region), REGION_LABELS),
      });
    });
  }

  function setMeta(id, fields) {
    const box = $(`#${id}`);
    if (!box) return;
    Object.entries(fields).forEach(([key, value]) => {
      const target = $(`[data-meta="${key}"]`, box);
      if (target) target.textContent = value || "-";
    });
  }

  function initSearch() {
    const input = $(".search-box input");
    const button = $(".search-box button");
    const results = $("#searchResults");
    const close = $("#searchResultsClose");
    if (!input || !button || !results) return;

    button.addEventListener("click", () => performSearch(input.value.trim()));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") performSearch(input.value.trim());
    });
    $$(".search-tag").forEach((tag) => {
      tag.addEventListener("click", () => {
        input.value = tag.textContent.trim();
        performSearch(input.value);
      });
    });
    close?.addEventListener("click", () => results.classList.remove("active"));
    $("#searchSort")?.addEventListener("change", renderSearchResults);
  }

  function performSearch(query) {
    if (!query) return;
    currentQuery = query;
    const lowerKeywords = query.toLowerCase().split(/\s+/).filter(Boolean);
    searchMatches = allItems.filter((item) => {
      const text = item.searchText.toLowerCase();
      return lowerKeywords.every((keyword) => text.includes(keyword));
    });
    $("#searchResults")?.classList.add("active");
    renderSearchRefine();
    renderSearchResults();
  }

  function renderSearchRefine() {
    const refine = $("#searchResultsRefine");
    if (!refine) return;
    const counts = countByType(searchMatches);
    const types = Object.keys(counts);
    if (types.length <= 1) {
      refine.hidden = true;
      refine.innerHTML = "";
      return;
    }
    refine.hidden = false;
    refine.innerHTML = `<span class="refine-label">유형</span><button type="button" class="refine-chip active" data-type="">전체 ${searchMatches.length}</button>` +
      types
        .sort((a, b) => (TYPE_ORDER[a] || 99) - (TYPE_ORDER[b] || 99))
        .map((type) => `<button type="button" class="refine-chip" data-type="${escapeHtml(type)}">${escapeHtml(TYPE_LABELS[type] || type)} ${counts[type]}</button>`)
        .join("");
    $$(".refine-chip", refine).forEach((button) => {
      button.addEventListener("click", () => {
        $$(".refine-chip", refine).forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        renderSearchResults();
      });
    });
  }

  function renderSearchResults() {
    const count = $("#searchResultsCount");
    const list = $("#searchResultsList");
    const sort = $("#searchSort")?.value || "relevance";
    const activeType = $(".refine-chip.active", $("#searchResultsRefine") || document)?.dataset?.type || "";
    if (!count || !list) return;

    let rows = activeType ? searchMatches.filter((item) => item.type === activeType) : searchMatches.slice();
    if (sort !== "relevance") rows.sort((a, b) => compareItems(a, b, sort));

    if (!rows.length) {
      count.textContent = "검색 결과 없음";
      const suggestions = ["이순신", "나폴레옹", "노르만디", "제2차 세계대전", "한니발", "참호전"];
      list.innerHTML = `<div class="search-no-result"><p class="sug-title">검색 결과 없음 · ${escapeHtml(currentQuery)}</p><p class="sug-hint">다른 키워드 · 탐색 필터</p><div class="sug-list">${suggestions.map((s) => `<button type="button" class="sug-chip">${s}</button>`).join("")}</div><p class="sug-link"><a href="#browse">필터 탐색</a></p></div>`;
      $$(".sug-chip", list).forEach((button) => button.addEventListener("click", () => {
        $(".search-box input").value = button.textContent;
        performSearch(button.textContent);
      }));
      return;
    }

    count.textContent = `${rows.length.toLocaleString()}건의 결과`;
    list.innerHTML = rows.map((item) => renderResultItem(item)).join("");
  }

  function renderResultItem(item) {
    const credClass = `cred-${item.credibility}`;
    return `<a class="search-result-item" href="${escapeHtml(item.url)}">
      <span class="search-result-category">${escapeHtml(TYPE_LABELS[item.type] || item.category)}</span>
      <div class="search-result-info">
        <div class="search-result-name">${highlight(item.name, currentQuery)}</div>
        <div class="search-result-desc">${highlight(truncate(item.desc, 90), currentQuery)}</div>
        <div class="search-result-meta">${renderMetaPills(item, credClass)}</div>
      </div>
      <span class="search-result-arrow" aria-hidden="true">›</span>
    </a>`;
  }

  function initBrowse() {
    const browse = $("#browse");
    if (!browse) return;
    const state = { era: "", region: "", type: "", credibility: "", keyword: "", sort: "name", page: 1, perPage: getBrowsePerPage() };

    $$(".browse-filter-group", browse).forEach((group) => {
      const key = group.dataset.filter;
      $$(".browse-chip", group).forEach((chip) => {
        chip.addEventListener("click", () => {
          $$(".browse-chip", group).forEach((item) => item.classList.remove("active"));
          chip.classList.add("active");
          state[key] = chip.dataset.value || "";
          state.page = 1;
          renderBrowse(state);
        });
      });
    });

    $("#browseSort")?.addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderBrowse(state);
    });

    let keywordTimer;
    $("#browseKeyword")?.addEventListener("input", (event) => {
      clearTimeout(keywordTimer);
      keywordTimer = setTimeout(() => {
        state.keyword = event.target.value.trim().toLowerCase();
        state.page = 1;
        renderBrowse(state);
      }, 160);
    });

    $("#browseReset")?.addEventListener("click", () => {
      Object.assign(state, { era: "", region: "", type: "", credibility: "", keyword: "", page: 1 });
      if ($("#browseKeyword")) $("#browseKeyword").value = "";
      $$(".browse-filter-group", browse).forEach((group) => {
        $$(".browse-chip", group).forEach((chip, index) => chip.classList.toggle("active", index === 0));
      });
      renderBrowse(state);
    });

    window.addEventListener("resize", debounce(() => {
      const nextPerPage = getBrowsePerPage();
      if (nextPerPage === state.perPage) return;
      state.perPage = nextPerPage;
      state.page = 1;
      renderBrowse(state);
    }, 160), { passive: true });

    renderBrowse(state);
  }

  function renderBrowse(state) {
    const grid = $("#browseGrid");
    const count = $("#browseCount");
    const empty = $("#browseEmpty");
    const pagination = $("#browsePagination");
    if (!grid) return;
    state.perPage = getBrowsePerPage();

    const filtered = allItems
      .filter((item) => !state.era || item.era === state.era)
      .filter((item) => !state.region || item.region === state.region)
      .filter((item) => !state.type || item.type === state.type)
      .filter((item) => !state.credibility || item.credibility === state.credibility)
      .filter((item) => !state.keyword || item.searchText.toLowerCase().includes(state.keyword))
      .sort((a, b) => compareItems(a, b, state.sort));

    renderActiveFilters(state);
    if (count) count.textContent = `${filtered.length.toLocaleString()}건의 자료 (전체 ${allItems.length.toLocaleString()}건 중)`;

    if (!filtered.length) {
      grid.innerHTML = "";
      if (empty) empty.hidden = false;
      if (pagination) pagination.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;

    const totalPages = Math.max(1, Math.ceil(filtered.length / state.perPage));
    state.page = Math.min(state.page, totalPages);
    const pageItems = filtered.slice((state.page - 1) * state.perPage, state.page * state.perPage);
    grid.innerHTML = pageItems.map(renderBrowseCard).join("");

    if (!pagination) return;
    pagination.hidden = totalPages <= 1;
    pagination.innerHTML = totalPages <= 1
      ? ""
      : `<button type="button" class="page-btn" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""}>이전</button><span class="page-info">${state.page} / ${totalPages}</span><button type="button" class="page-btn" data-page="${state.page + 1}" ${state.page === totalPages ? "disabled" : ""}>다음</button>`;
    $$(".page-btn", pagination).forEach((button) => button.addEventListener("click", () => {
      state.page = Number(button.dataset.page);
      renderBrowse(state);
    }));
  }

  function getBrowsePerPage() {
    if (window.innerWidth <= 720) return 2;
    if (window.innerWidth <= 1240) return 4;
    return 6;
  }

  function renderActiveFilters(state) {
    const box = $("#browseActiveFilters");
    if (!box) return;
    const rows = [
      state.era && ["era", `시대: ${ERA_LABELS[state.era] || state.era}`],
      state.region && ["region", `지역: ${REGION_LABELS[state.region] || state.region}`],
      state.type && ["type", `유형: ${TYPE_LABELS[state.type] || state.type}`],
      state.credibility && ["credibility", `신뢰도: ${CRED_LABELS[state.credibility] || state.credibility}`],
      state.keyword && ["keyword", `"${state.keyword}"`],
    ].filter(Boolean);
    box.innerHTML = rows.map(([key, label]) => `<button type="button" class="active-filter" data-key="${key}">${escapeHtml(label)} <span class="active-filter-x">×</span></button>`).join("");
    $$(".active-filter", box).forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.key;
        if (key === "keyword") {
          state.keyword = "";
          if ($("#browseKeyword")) $("#browseKeyword").value = "";
        } else {
          state[key] = "";
          const group = $(`.browse-filter-group[data-filter="${key}"]`);
          if (group) $$(".browse-chip", group).forEach((chip, index) => chip.classList.toggle("active", index === 0));
        }
        state.page = 1;
        renderBrowse(state);
      });
    });
  }

  function renderBrowseCard(item) {
    const credClass = `cred-${item.credibility}`;
    return `<a class="browse-card ${credClass}" href="${escapeHtml(item.url)}">
      <div class="browse-card-top">
        <span class="browse-card-type">${escapeHtml(TYPE_LABELS[item.type] || item.category)}</span>
        <span class="browse-card-cred ${credClass}">${escapeHtml(CRED_LABELS[item.credibility] || "검증됨")}</span>
      </div>
      <h3 class="browse-card-name">${escapeHtml(item.name)}</h3>
      <p class="browse-card-desc">${escapeHtml(truncate(item.desc, 110))}</p>
      <div class="browse-card-meta">${renderMetaPills(item, credClass, false)}</div>
    </a>`;
  }

  function renderFeatured(items) {
    const grid = $("#featuredGrid");
    if (!grid) return;
    const grouped = items.reduce((acc, item) => {
      (acc[item.type] ||= []).push(item);
      return acc;
    }, {});
    const picks = Object.keys(grouped)
      .map((type) => grouped[type][Math.floor(Math.random() * grouped[type].length)])
      .filter(Boolean)
      .sort((a, b) => (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99));

    grid.innerHTML = picks.length
      ? picks.map(renderFeaturedCard).join("")
      : '<div class="featured-empty">표시 자료 없음</div>';
    applyRenderedCardImages(grid);
    grid.removeAttribute("aria-busy");
  }

  function renderFeaturedCard(item) {
    const cred = {
      verified: ["is-verified", "검증"],
      disputed: ["is-disputed", "논쟁"],
      unverified: ["is-pending", "미확인"],
      oral: ["is-oral", "구전"],
    }[item.credibility] || ["is-verified", "검증"];
    return `<a class="featured-card" href="${escapeHtml(item.url)}" data-card-image="${escapeHtml(item.image || "")}">
      <div class="featured-card-head">
        <span class="featured-cat">${escapeHtml(TYPE_LABELS[item.type] || item.category)}</span>
        <span class="trust-badge ${cred[0]}">${cred[1]}</span>
      </div>
      <h3 class="featured-title">${escapeHtml(item.name)}</h3>
      <p class="featured-desc">${escapeHtml(truncate(item.desc, 110))}</p>
      <dl class="featured-meta">${renderDefinition("시대", ERA_LABELS[item.era])}${renderDefinition("지역", REGION_LABELS[item.region])}${renderDefinition("연도", item.year)}</dl>
      <span class="featured-go" aria-hidden="true">자료 열기 →</span>
    </a>`;
  }

  function renderMetaPills(item, credClass, includeCred = true) {
    return [
      item.era && `<span class="meta-pill">${escapeHtml(ERA_LABELS[item.era] || item.era)}</span>`,
      item.region && `<span class="meta-pill">${escapeHtml(REGION_LABELS[item.region] || item.region)}</span>`,
      includeCred && `<span class="meta-pill ${credClass}">${escapeHtml(CRED_LABELS[item.credibility] || "검증됨")}</span>`,
    ].filter(Boolean).join("");
  }

  function renderDefinition(label, value) {
    return value == null || value === "" ? "" : `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
  }

  function countByType(items) {
    return items.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {});
  }

  function compareItems(a, b, key) {
    if (key === "year") return rank(a.year) - rank(b.year) || byName(a, b);
    if (key === "era") return (ERA_RANK[a.era] || 99) - (ERA_RANK[b.era] || 99) || byName(a, b);
    if (key === "credibility") return (CRED_RANK[a.credibility] || 99) - (CRED_RANK[b.credibility] || 99) || byName(a, b);
    if (key === "type") return (TYPE_ORDER[a.type] || 99) - (TYPE_ORDER[b.type] || 99) || byName(a, b);
    return byName(a, b);
  }

  function byName(a, b) {
    return (a.name || "").localeCompare(b.name || "", "ko");
  }

  function rank(value) {
    return value == null ? Number.POSITIVE_INFINITY : value;
  }

  function summarize(values, labels, rankMap) {
    const unique = Array.from(new Set(values.filter(Boolean)));
    if (!unique.length) return "-";
    const sorted = unique.sort((a, b) => (rankMap ? (rankMap[a] || 99) - (rankMap[b] || 99) : String(a).localeCompare(String(b), "ko")));
    const labeled = sorted.map((value) => labels[value] || value);
    if (labeled.length === 1) return labeled[0];
    if (rankMap) return `${labeled[0]} - ${labeled[labeled.length - 1]}`;
    return labeled.length <= 3 ? labeled.join(" · ") : `${labeled.slice(0, 3).join(" · ")} 외 ${labeled.length - 3}`;
  }

  function normEra(value) {
    if (!value) return "";
    const s = String(value).toLowerCase().replace(/[\s_-]/g, "");
    if (s === "earlymodern") return "earlymodern";
    if (["worldwar", "worldwars", "ww1", "ww2"].includes(s)) return "worldwar";
    if (s === "coldwar") return "contemporary";
    return s;
  }

  function normRegion(value) {
    if (!value) return "";
    const raw = String(value).trim();
    const lower = raw.toLowerCase();
    if (lower === "asia") return "eastasia";
    if (lower === "middle_east" || lower === "middleeast") return "middleeast";
    if (["europe", "americas", "africa", "oceania", "global", "eastasia"].includes(lower)) return lower;
    return REGION_MAP[raw] || "global";
  }

  function credibilityFromShelf(shelf) {
    if (shelf === "Disputed Sources") return "disputed";
    if (shelf === "Oral Traditions" || shelf === "Legends and Myths") return "oral";
    return "unverified";
  }

  function extractYear(value) {
    if (!value) return null;
    const text = String(value);
    const bc = text.match(/BC\s*(\d+)/i) || text.match(/\bB\.?C\.?\s*(\d+)/i) || text.match(/기원전\s*(\d+)/);
    if (bc) return -Number(bc[1]);
    const year = text.match(/(\d{3,4})/);
    return year ? Number(year[1]) : null;
  }

  function join(value) {
    return Array.isArray(value) ? value.join(" ") : value || "";
  }

  function getRecordImage(record) {
    if (!record || typeof record !== "object") return "";
    if (typeof record.image === "string") return record.image;
    if (typeof record.coverImage === "string") return record.coverImage;
    if (typeof record.portrait === "string") return record.portrait;
    if (Array.isArray(record.images)) {
      const first = record.images.find((image) => image && typeof image.url === "string");
      return first ? first.url : "";
    }
    return "";
  }

  function applyCardImage(element, imageUrl) {
    if (!element || !imageUrl) return;
    element.style.setProperty("--card-image", cssImageValue(imageUrl));
  }

  function applyRenderedCardImages(root) {
    $$("[data-card-image]", root).forEach((element) => {
      applyCardImage(element, element.dataset.cardImage || "");
    });
  }

  function cssImageValue(imageUrl) {
    return `url("${String(imageUrl).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}")`;
  }

  function truncate(value, limit) {
    const text = value == null ? "" : String(value);
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
  }

  function highlight(value, query) {
    const safe = escapeHtml(value);
    const tokens = String(query || "").trim().split(/\s+/).filter(Boolean).map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return tokens.length ? safe.replace(new RegExp(`(${tokens.join("|")})`, "gi"), '<mark class="search-hl">$1</mark>') : safe;
  }
});
