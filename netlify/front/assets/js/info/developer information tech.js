// ── War Archive - Developer Information Page JavaScript ──

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

  function onScroll() {
    if (window.scrollY > 80) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
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

  // ── Hero Particles ──
  const particlesContainer = document.getElementById('particles');
  if (particlesContainer) {
    for (let i = 0; i < 30; i++) {
      const particle = document.createElement('div');
      particle.classList.add('hero-particle');
      particle.style.left = Math.random() * 100 + '%';
      particle.style.top = (50 + Math.random() * 50) + '%';
      particle.style.animationDelay = (Math.random() * 6) + 's';
      particle.style.animationDuration = (4 + Math.random() * 4) + 's';
      particlesContainer.appendChild(particle);
    }
  }

  // ── Tech Bar Animation ──
  const techBars = document.querySelectorAll('.tech-bar-fill');

  const barObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const width = entry.target.dataset.width;
        entry.target.style.width = width + '%';
        barObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });

  techBars.forEach(bar => barObserver.observe(bar));

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

  // ── Load stats from search.json files ──
  function fetchSearchCount(url) {
    return fetch(url).then(r => r.json()).then(arr => arr.length).catch(() => 0);
  }

  const basePath = '../../data/';

  Promise.all([
    fetchSearchCount(basePath + 'search/war overview search.json'),
    fetchSearchCount(basePath + 'search/biography of people search.json'),
    fetchSearchCount(basePath + 'search/weapons and equipment search.json'),
    fetchSearchCount(basePath + 'search/strategy and tactics search.json'),
    fetchSearchCount(basePath + 'search/Historical Sources & Documents search.json'),
    fetchSearchCount(basePath + 'search/Battlefield Map search.json')
  ]).then(([wars, people, weapons, strategy, docs, battles]) => {
    const total = wars + people + weapons + strategy + docs + battles;

    const totalDocsEl = document.getElementById('statTotalDocs');
    if (totalDocsEl) {
      totalDocsEl.dataset.count = total;
      animateCount(totalDocsEl);
    }

    // Count pages (each category has at least 1 page + this dev page + main + info + contribution)
    const pages = 4 + 6 + total;
    const totalPagesEl = document.getElementById('statTotalPages');
    if (totalPagesEl) {
      totalPagesEl.dataset.count = pages;
      animateCount(totalPagesEl);
    }
  });

});
