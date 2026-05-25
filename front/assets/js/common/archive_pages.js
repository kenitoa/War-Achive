(function () {
  const THEME_KEY = "war-archive-theme";

  function qs(selector, root = document) {
    return root.querySelector(selector);
  }

  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function applySavedTheme() {
    try {
      document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "";
    } catch {
      document.documentElement.dataset.theme = "";
    }
  }

  function normalizeHeader() {
    const header = qs(".site-header");
    if (!header) return;
    const inner = qs(".header-inner", header) || header;
    const logo = qs(".logo", header);
    const nav = qs(".nav-links", header);

    if (logo) {
      logo.classList.add("archive-channel-logo");
      logo.setAttribute("aria-label", "War Archive 홈");
      logo.innerHTML = [
        '<span class="logo-mark" aria-hidden="true"><span></span></span>',
        '<span class="logo-copy">',
        '<span class="logo-text">Archive Channel</span>',
        '<span class="logo-sub">War Archive</span>',
        "</span>",
      ].join("");
    }

    if (nav) {
      nav.setAttribute("aria-label", "주요 메뉴");
      nav.innerHTML = [
        '<a href="../../index.html#search">Home</a>',
        '<a href="../../index.html#featured">Episodes</a>',
        '<a href="../../index.html#timeline">Timeline</a>',
        '<a href="../../index.html#categories">Collections</a>',
        '<a href="../../index.html#project">About</a>',
      ].join("");
    }

    let actions = qs(".header-actions", header);
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "header-actions";
      inner.appendChild(actions);
    }

    if (!qs(".header-search", actions)) {
      actions.insertAdjacentHTML("afterbegin", '<a class="header-search" href="../../index.html#search" aria-label="검색으로 이동"></a>');
    }

    if (!qs("#themeToggle", actions)) {
      const search = qs(".header-search", actions);
      search.insertAdjacentHTML("afterend", '<button class="theme-toggle" type="button" id="themeToggle" aria-label="다크 모드 켜기" aria-pressed="false"><span class="theme-toggle-icon" aria-hidden="true"></span></button>');
    }

    if (!qs(".lang-pill", actions)) {
      const theme = qs("#themeToggle", actions);
      theme.insertAdjacentHTML("afterend", '<button class="lang-pill" type="button">KOR</button>');
    }

    let menu = qs(".menu-toggle", header);
    if (!menu) {
      menu = document.createElement("button");
      menu.className = "menu-toggle";
      menu.type = "button";
      menu.setAttribute("aria-label", "메뉴 열기");
      menu.innerHTML = "<span></span><span></span><span></span>";
    }
    if (menu.parentElement !== actions) actions.appendChild(menu);
  }

  function initTheme() {
    const toggle = qs("#themeToggle");
    if (!toggle) return;

    const current = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    const render = () => {
      const isDark = current() === "dark";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute("aria-label", isDark ? "라이트 모드 켜기" : "다크 모드 켜기");
      toggle.title = isDark ? "라이트 모드" : "다크 모드";
    };

    render();
    toggle.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next === "dark" ? "dark" : "";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* Storage can be blocked in private or embedded contexts. */
      }
      render();
    });
  }

  function initMenu() {
    const toggle = qs(".menu-toggle");
    const nav = qs(".nav-links");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => nav.classList.toggle("open"));
    qsa(".nav-links a").forEach((link) => link.addEventListener("click", () => nav.classList.remove("open")));
  }

  applySavedTheme();
  document.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("archive-page");
    normalizeHeader();
    initTheme();
    initMenu();
  });
})();
