// ── War Archive - Information Page JavaScript ──

document.addEventListener('DOMContentLoaded', () => {

  // ── Mobile Menu Toggle ──
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        menuToggle.classList.remove('active');
      });
    });
  }

  // ── Header scroll effect ──
  const header = document.querySelector('.site-header');
  let lastScroll = 0;

  function onScroll() {
    const scrollY = window.scrollY;
    if (scrollY > 80) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = scrollY;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── Reveal on scroll ──
  const revealElements = document.querySelectorAll('.reveal');

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '0px 0px -80px 0px',
    threshold: 0.12
  });

  revealElements.forEach(el => revealObserver.observe(el));

  // ── Stat Counter Animation ──
  const statNums = document.querySelectorAll('.stat-num');

  function animateCount(el) {
    const target = parseInt(el.dataset.count, 10);
    if (isNaN(target) || target === 0) return;

    const duration = 2000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      el.textContent = Math.floor(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  const countObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCount(entry.target);
        countObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  statNums.forEach(el => countObserver.observe(el));

  // ── Load stats from search.json ──
  function fetchSearchCount(url) {
    return fetch(url).then(r => r.json()).then(arr => arr.length).catch(() => 0);
  }

<<<<<<<< HEAD:front/js/pages/information.js
  function fetchWeaponsIndex(url) {
    return fetch(url).then(r => r.json()).then(obj => {
      return Object.values(obj).reduce((s, arr) => s + arr.length, 0);
    }).catch(() => 0);
  }

  const indexUrls = {
    war:     '/data/war-overview/index.json',
    bio:     '/data/biography-of-people/index.json',
    weapons: '/data/weapons-and-equipment/index.json',
    tactics: '/data/strategy-and-tactics/index.json',
    docs:    '/data/historical-sources/index.json',
    battle:  '/data/battlefield-map/index.json'
========
  const searchUrls = {
    war:     '../../data/search/war overview search.json',
    bio:     '../../data/search/biography of people search.json',
    weapons: '../../data/search/weapons and equipment search.json',
    tactics: '../../data/search/strategy and tactics search.json',
    docs:    '../../data/search/Historical Sources & Documents search.json',
    battle:  '../../data/search/Battlefield Map search.json'
>>>>>>>> 9061e3c1c611e3269eb678c6ba6cf7cc2ec959f8:front/assets/js/info/information tech.js
  };

  Promise.all([
    fetchSearchCount(searchUrls.war),
    fetchSearchCount(searchUrls.bio),
    fetchSearchCount(searchUrls.weapons),
    fetchSearchCount(searchUrls.tactics),
    fetchSearchCount(searchUrls.docs),
    fetchSearchCount(searchUrls.battle)
  ]).then(counts => {
    const [warCount, bioCount, weaponsCount, tacticsCount, docsCount, battleCount] = counts;

    const statBlocks = document.querySelectorAll('.stat-block');
    const values = [warCount, bioCount, battleCount, docsCount, weaponsCount, tacticsCount];

    statBlocks.forEach((block, i) => {
      const numEl = block.querySelector('.stat-num');
      if (numEl && values[i] !== undefined) {
        numEl.dataset.count = values[i];
        numEl.textContent = '0';
      }
    });
  });

  // ── Subtle parallax on opening panel ──
  const openingContent = document.querySelector('.panel-opening .panel-content');
  if (openingContent) {
    window.addEventListener('scroll', () => {
      const scrollY = window.scrollY;
      const speed = 0.3;
      const opacity = Math.max(1 - scrollY / 600, 0);
      openingContent.style.transform = `translateY(${scrollY * speed}px)`;
      openingContent.style.opacity = opacity;
    }, { passive: true });
  }

});
