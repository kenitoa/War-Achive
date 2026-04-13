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

  // ── Load stats from index.json files ──
  function fetchFlatIndex(url) {
    return fetch(url).then(r => r.json()).then(arr => arr.length).catch(() => 0);
  }

  function fetchWeaponsIndex(url) {
    return fetch(url).then(r => r.json()).then(obj => {
      return Object.values(obj).reduce((s, arr) => s + arr.length, 0);
    }).catch(() => 0);
  }

  const basePath = '../../back/data/';

  Promise.all([
    fetchFlatIndex(basePath + 'war overview data/index.json'),
    fetchFlatIndex(basePath + 'biography of people data/index.json'),
    fetchWeaponsIndex(basePath + 'weapons and equipment data/index.json'),
    fetchFlatIndex(basePath + 'strategy and tactics data/index.json'),
    fetchFlatIndex(basePath + 'Historical Sources & Documents data/index.json'),
    fetchFlatIndex(basePath + 'Battlefield Map data/index.json')
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

  // ── 피드백 팝업 ──
  const feedbackCard = document.getElementById('feedbackCard');
  const feedbackOverlay = document.getElementById('feedbackOverlay');
  const feedbackClose = document.getElementById('feedbackClose');
  const feedbackCancel = document.getElementById('feedbackCancel');
  const feedbackForm = document.getElementById('feedbackForm');
  const feedbackSuccess = document.getElementById('feedbackSuccess');
  const feedbackDone = document.getElementById('feedbackDone');

  function openFeedback() {
    if (feedbackOverlay) feedbackOverlay.classList.add('active');
  }

  function closeFeedback() {
    if (feedbackOverlay) feedbackOverlay.classList.remove('active');
    // 리셋
    setTimeout(() => {
      if (feedbackForm) { feedbackForm.reset(); feedbackForm.style.display = ''; }
      if (feedbackSuccess) feedbackSuccess.style.display = 'none';
    }, 300);
  }

  if (feedbackCard) feedbackCard.addEventListener('click', openFeedback);
  if (feedbackClose) feedbackClose.addEventListener('click', closeFeedback);
  if (feedbackCancel) feedbackCancel.addEventListener('click', closeFeedback);
  if (feedbackDone) feedbackDone.addEventListener('click', closeFeedback);

  if (feedbackOverlay) {
    feedbackOverlay.addEventListener('click', (e) => {
      if (e.target === feedbackOverlay) closeFeedback();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && feedbackOverlay && feedbackOverlay.classList.contains('active')) {
      closeFeedback();
    }
  });

  if (feedbackForm) {
    feedbackForm.addEventListener('submit', (e) => {
      e.preventDefault();
      feedbackForm.style.display = 'none';
      feedbackSuccess.style.display = '';
    });
  }

});
