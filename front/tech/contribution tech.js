// ── War Archive - Contribution Page JavaScript ──

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
    const scrollY = window.scrollY;
    if (scrollY > 80) {
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

  // ── JSON Template Download ──
  const templates = {
    'war-overview': {
      filename: 'war-overview-template.json',
      data: {
        id: "",
        name: "",
        era: "",
        region: "",
        period: "",
        summary: "",
        belligerents: "",
        location: "",
        result: "",
        resultType: "",
        tags: [],
        detail: {
          background: "",
          causes: [""],
          phases: [
            { title: "", period: "", description: "" }
          ],
          majorBattles: [
            { name: "", date: "", description: "", result: "" }
          ],
          keyFigures: [
            { name: "", side: "", role: "" }
          ],
          casualties: { side1: "", side2: "" },
          aftermath: "",
          significance: "",
          references: [
            { title: "", author: "", year: "", note: "" }
          ]
        }
      }
    },
    'biography': {
      filename: 'biography-template.json',
      data: {
        id: "",
        name: "",
        title: "",
        role: "",
        era: "",
        nationality: "",
        lifespan: "",
        summary: "",
        portrait: "",
        wars: [],
        tags: [],
        detail: {
          earlyLife: "",
          achievements: [
            { title: "", description: "" }
          ],
          warsBattles: [
            { name: "", date: "", role: "", result: "" }
          ],
          leadership: "",
          laterLife: "",
          legacy: "",
          evaluation: "",
          anecdotes: [
            { title: "", content: "" }
          ],
          references: [
            { title: "", author: "", year: "" }
          ]
        }
      }
    },
    'weapons': {
      filename: 'weapons-equipment-template.json',
      data: {
        name: "",
        nameEn: "",
        image: "",
        category: "",
        era: "",
        origin: "",
        period: "",
        operators: [],
        tags: [],
        overview: [""],
        specs: [
          { label: "", value: "" }
        ],
        history: [""],
        design: [""],
        operation: [""],
        combatRecord: [""],
        variants: [
          { name: "", description: "" }
        ],
        evaluation: [""],
        related: [
          { id: "", name: "", type: "" }
        ],
        references: [""]
      }
    },
    'strategy': {
      filename: 'strategy-tactics-template.json',
      data: {
        id: "",
        title: "",
        titleKr: "",
        era: "",
        category: "",
        origin: "",
        period: "",
        region: "",
        keyFigure: "",
        description: "",
        keywords: [],
        infoBox: {
          type: "",
          originNation: "",
          firstUsed: "",
          lastUsed: "",
          mainWeapon: "",
          idealTerrain: "",
          weakness: ""
        },
        sections: [
          { title: "", content: "" }
        ],
        images: [
          { url: "", caption: "", source: "" }
        ],
        relatedStrategies: []
      }
    },
    'historical-sources': {
      filename: 'historical-sources-template.json',
      data: {
        id: "",
        title: "",
        titleKr: "",
        coverImage: "",
        type: "",
        era: "",
        date: "",
        author: "",
        origin: "",
        description: "",
        keywords: [],
        detail: {
          background: "",
          originalText: "",
          significance: "",
          aftermath: "",
          relatedDocuments: [],
          physicalDescription: "",
          references: [""]
        }
      }
    },
    'battlefield-map': {
      filename: 'battlefield-map-template.json',
      data: {
        id: "",
        title: "",
        titleKr: "",
        era: "",
        theater: "",
        date: "",
        location: "",
        commanders: [],
        forces: [],
        casualties: [],
        result: "",
        description: "",
        keywords: [],
        terrain: "",
        strategicSignificance: "",
        infoBox: {
          type: "",
          theater: "",
          duration: "",
          terrain: "",
          keyWeapon: "",
          outcome: "",
          legacy: ""
        },
        sections: [
          { title: "", content: "" }
        ],
        images: [
          { url: "", caption: "", source: "" }
        ],
        relatedBattles: []
      }
    }
  };

  document.querySelectorAll('.template-download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.template;
      const template = templates[key];
      if (!template) return;

      const jsonStr = JSON.stringify(template.data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = template.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

});
