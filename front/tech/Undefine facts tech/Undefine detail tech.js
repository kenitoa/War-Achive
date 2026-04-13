// ── War Archive - Undefine Facts Detail Page JavaScript ──

document.addEventListener('DOMContentLoaded', async () => {

  // ── Mobile Menu Toggle ──
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      menuToggle.classList.toggle('active');
    });
  }

  // ── Parse URL params ──
  const params = new URLSearchParams(window.location.search);
  const shelfId = params.get('shelf');
  const itemId = params.get('id');

  if (!shelfId || !itemId) {
    showError('잘못된 접근입니다. 선반 또는 자료 정보가 없습니다.');
    return;
  }

  const newspaper = document.getElementById('newspaper');
  newspaper.classList.add('loading');

  // ── Shelf name mapping ──
  const shelfNames = {
    'Unidentified Documents': '출처 미상 문서',
    'Oral Traditions': '구전 사료',
    'Disputed Sources': '논쟁 중인 사료',
    'Legends and Myths': '전설 & 신화',
    'Incomplete Records': '미완성 기록',
    'Declassified Files': '기밀 해제 자료'
  };

  // ── Fetch data ──
  const DATA_BASE = '../../../back/data/Undefine facts data';
  let data;

  try {
    const res = await fetch(`${DATA_BASE}/${encodeURIComponent(shelfId)}/${encodeURIComponent(itemId)}.json`);
    if (!res.ok) throw new Error('파일을 찾을 수 없습니다.');
    data = await res.json();
  } catch (err) {
    newspaper.classList.remove('loading');
    showError('자료를 불러오는 데 실패했습니다: ' + err.message);
    return;
  }

  // ── Populate page ──
  newspaper.classList.remove('loading');

  // Title
  document.title = `WAR ARCHIVE GAZETTE — ${data.name}`;

  // Masthead
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  document.getElementById('pubDate').textContent = dateStr;

  const shelfBadge = document.getElementById('shelfBadge');
  shelfBadge.textContent = `${shelfId} · ${shelfNames[shelfId] || '미분류'}`;

  document.getElementById('statusBadge').textContent = data.status || '미검증';
  document.getElementById('eraBadge').textContent = data.era || '시대 미상';

  // Headline
  document.getElementById('headline').textContent = data.name;
  document.getElementById('headlineEn').textContent = data.nameEn || '';

  // Byline
  document.getElementById('originText').textContent = data.origin || '미상';
  document.getElementById('discoveredText').textContent = data.discoveredDate || '미상';

  // Credibility dots
  const credDots = document.getElementById('credDots');
  for (let i = 1; i <= 5; i++) {
    const dot = document.createElement('span');
    dot.className = 'cred-dot' + (i <= (data.credibility || 0) ? ' filled' : '');
    credDots.appendChild(dot);
  }

  // Content - first paragraph as lead
  const content = data.content || [];
  const leadText = document.getElementById('leadText');
  const articleBody = document.getElementById('articleBody');

  if (content.length > 0) {
    leadText.textContent = content[0];

    for (let i = 1; i < content.length; i++) {
      const p = document.createElement('p');
      p.textContent = content[i];
      articleBody.appendChild(p);
    }
  } else {
    leadText.textContent = data.summary || '상세 내용이 아직 입력되지 않았습니다.';
  }

  // Editor note
  const editorNote = document.getElementById('editorNote');
  const editorBox = document.getElementById('editorBox');
  if (data.editorNote) {
    editorNote.textContent = data.editorNote;
  } else {
    editorBox.style.display = 'none';
  }

  // Tags
  const tagsContainer = document.getElementById('tagsContainer');
  if (data.tags && data.tags.length > 0) {
    data.tags.forEach(tag => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tag;
      tagsContainer.appendChild(chip);
    });
  }

  // Significance
  const significanceText = document.getElementById('significanceText');
  if (data.significance) {
    significanceText.textContent = data.significance;
  } else {
    significanceText.parentElement.style.display = 'none';
  }

  // Controversy
  const controversyText = document.getElementById('controversyText');
  if (data.controversy) {
    controversyText.textContent = data.controversy;
  } else {
    controversyText.parentElement.style.display = 'none';
  }

  // Related items
  const relatedSection = document.getElementById('relatedSection');
  const relatedList = document.getElementById('relatedList');
  if (data.relatedItems && data.relatedItems.length > 0) {
    data.relatedItems.forEach(item => {
      const div = document.createElement('div');
      div.className = 'related-item';
      div.innerHTML = `
        <span class="related-bullet">&#9654;</span>
        <div class="related-info">
          <div class="related-name">${item.name}</div>
          <div class="related-shelf">${item.shelf}</div>
        </div>
      `;
      relatedList.appendChild(div);
    });
  } else {
    relatedSection.style.display = 'none';
  }

  // ── Reveal animations ──
  const revealTargets = [
    '.masthead',
    '.headline-section',
    '.main-article',
    '.sidebar',
    '.paper-footer'
  ];

  revealTargets.forEach((selector, i) => {
    const el = document.querySelector(selector);
    if (el) {
      el.classList.add('reveal-newspaper');
      setTimeout(() => {
        el.classList.add('visible');
      }, 150 * (i + 1));
    }
  });

  // ── Error display ──
  function showError(msg) {
    newspaper.innerHTML = `
      <div style="text-align: center; padding: 4rem 2rem;">
        <div style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.4;">&#128240;</div>
        <h2 style="font-family: 'Noto Serif KR', serif; font-size: 1.2rem; color: ${
          'var(--ink-muted)'
        }; margin-bottom: 1rem;">${msg}</h2>
        <a href="Undefine facts.html" style="color: var(--accent); font-size: 0.85rem;">
          &#8592; 미확인 자료집으로 돌아가기
        </a>
      </div>
    `;
  }

});
