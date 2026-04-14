const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// ── 일반 폴더: 폴더 내 .json 파일 목록으로 index.json 생성 ──
const flatTargets = [
  '../../back/data/war-overview',
  '../../back/data/battlefield-map',
  '../../back/data/biography-of-people',
  '../../back/data/historical-sources',
  '../../back/data/strategy-and-tactics'
];

function generateFlatIndex() {
  flatTargets.forEach(dir => {
    const fullDir = path.join(root, dir);
    if (!fs.existsSync(fullDir)) {
      console.warn(`[SKIP] 폴더 없음: ${dir}`);
      return;
    }

    const files = fs.readdirSync(fullDir)
      .filter(f => f.endsWith('.json') && f !== 'index.json')
      .map(f => f.replace('.json', ''))
      .sort();

    const indexPath = path.join(fullDir, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(files, null, 2) + '\n', 'utf-8');
    console.log(`[OK] ${dir}/index.json — ${files.length}건`);
  });
}

// ── 무기 & 장비: 하위 카테고리 폴더별로 수집 후 단일 index.json 생성 ──
const weaponsDir = path.join(root, '../../back/data/weapons-and-equipment');

function generateWeaponsIndex() {
  if (!fs.existsSync(weaponsDir)) {
    console.warn('[SKIP] 폴더 없음: back/data/weapons-and-equipment');
    return;
  }

  const index = {};
  const subDirs = fs.readdirSync(weaponsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  subDirs.forEach(sub => {
    const subPath = path.join(weaponsDir, sub);
    const files = fs.readdirSync(subPath)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();
    index[sub] = files;
  });

  const indexPath = path.join(weaponsDir, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf-8');
  const total = Object.values(index).reduce((s, arr) => s + arr.length, 0);
  console.log(`[OK] back/data/weapons-and-equipment/index.json — ${total}건 (${subDirs.length} 카테고리)`);
}

// ── 전체 인덱스 생성 ──
function generateAll() {
  console.log(`\n[${new Date().toLocaleTimeString()}] 인덱스 생성 시작...`);
  generateFlatIndex();
  generateWeaponsIndex();
  console.log('[DONE] 모든 index.json 갱신 완료\n');
}

// ── 초기 실행 ──
generateAll();

// ── Watch 모드: --watch 플래그로 실행 시 파일 변경 자동 감지 ──
if (process.argv.includes('--watch')) {
  console.log('[WATCH] 파일 변경 감지 모드 시작...');
  console.log('[WATCH] JSON 파일이 추가/삭제되면 자동으로 index.json을 갱신합니다.');
  console.log('[WATCH] 종료하려면 Ctrl+C를 누르세요.\n');

  let debounceTimer = null;

  function onFileChange(dir, eventType, filename) {
    if (!filename || !filename.endsWith('.json') || filename === 'index.json') return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[WATCH] 변경 감지: ${dir}/${filename} (${eventType})`);
      generateAll();
    }, 300);
  }

  // 일반 폴더 감시
  flatTargets.forEach(dir => {
    const fullDir = path.join(root, dir);
    if (fs.existsSync(fullDir)) {
      fs.watch(fullDir, (eventType, filename) => onFileChange(dir, eventType, filename));
      console.log(`[WATCH] 감시 중: ${dir}/`);
    }
  });

  // 무기 & 장비 하위 폴더 감시
  if (fs.existsSync(weaponsDir)) {
    const subDirs = fs.readdirSync(weaponsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    subDirs.forEach(sub => {
      const subPath = path.join(weaponsDir, sub);
      fs.watch(subPath, (eventType, filename) =>
        onFileChange(`weapons-and-equipment/${sub}`, eventType, filename)
      );
      console.log(`[WATCH] 감시 중: weapons-and-equipment/${sub}/`);
    });
  }
}
