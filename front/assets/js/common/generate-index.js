const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');

function readJson(p) {
  let t = fs.readFileSync(p, 'utf8');
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1);
  return JSON.parse(t);
}

function getRecordImage(d) {
  if (!d || typeof d !== 'object') return '';
  if (typeof d.image === 'string') return d.image;
  if (typeof d.coverImage === 'string') return d.coverImage;
  if (typeof d.portrait === 'string') return d.portrait;
  if (Array.isArray(d.images)) {
    const first = d.images.find(img => img && typeof img.url === 'string');
    return first ? first.url : '';
  }
  return '';
}

const warOverviewImages = {
  'greco-persian': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Battle_of_Thermopylae_and_movements_to_Salamis%2C_480_BC.gif/960px-Battle_of_Thermopylae_and_movements_to_Salamis%2C_480_BC.gif',
  'peloponnesian': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Map_Peloponnesian_War_431_BC-en.svg/960px-Map_Peloponnesian_War_431_BC-en.svg.png',
  'punic': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Map_of_Rome_and_Carthage_at_the_start_of_the_Second_Punic_War.svg/960px-Map_of_Rome_and_Carthage_at_the_start_of_the_Second_Punic_War.svg.png',
  'crusades': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Counquest_of_Jeusalem_%281099%29.jpg/960px-Counquest_of_Jeusalem_%281099%29.jpg',
  'hundred-years': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Bataille_d%27Azincourt.jpg/960px-Bataille_d%27Azincourt.jpg',
  'mongol-conquest': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/MongolEmpireDivisions1300.png/960px-MongolEmpireDivisions1300.png',
  'imjin': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Battle_of_Hansando.JPG/960px-Battle_of_Hansando.JPG',
  'thirty-years': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Sebastiaen_Vrancx_-_The_Battle_of_White_Mountain.jpg/960px-Sebastiaen_Vrancx_-_The_Battle_of_White_Mountain.jpg',
  'napoleonic': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Napoleon_at_the_Battle_of_Austerlitz%2C_by_Fran%C3%A7ois_G%C3%A9rard.jpg/960px-Napoleon_at_the_Battle_of_Austerlitz%2C_by_Fran%C3%A7ois_G%C3%A9rard.jpg',
  'american-civil': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Thure_de_Thulstrup_-_L._Prang_and_Co._-_Battle_of_Gettysburg_-_Restoration_by_Adam_Cuerden.jpg/960px-Thure_de_Thulstrup_-_L._Prang_and_Co._-_Battle_of_Gettysburg_-_Restoration_by_Adam_Cuerden.jpg',
  'russo-japanese': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Battle_of_Tsushima_Russian.jpg/960px-Battle_of_Tsushima_Russian.jpg',
  'crimean': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Battle_of_balaklava.jpg/960px-Battle_of_balaklava.jpg',
  'ww1': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Cheshire_Regiment_trench_Somme_1916.jpg/960px-Cheshire_Regiment_trench_Somme_1916.jpg',
  'ww2': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Into_the_Jaws_of_Death_23-0455M_edit.jpg/960px-Into_the_Jaws_of_Death_23-0455M_edit.jpg',
  'korean': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/B-26_Marauders_in_action_during_the_Korean_war.jpg/960px-B-26_Marauders_in_action_during_the_Korean_war.jpg',
  'vietnam': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/UH-1D_helicopters_in_Vietnam_1966.jpg/960px-UH-1D_helicopters_in_Vietnam_1966.jpg',
  'gulf': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/DesertStormMap_v2.svg/960px-DesertStormMap_v2.svg.png'
};

// ── 카테고리별 search.json 메타데이터 추출 설정 ──
const categoryConfigs = {
  'data/biography of people data': (d, f) => ({
    id: d.id, name: d.name, title: d.title, role: d.role, era: d.era,
    nationality: d.nationality, summary: (d.summary || '').substring(0, 120),
    wars: d.wars || [], tags: d.tags || [], image: getRecordImage(d),
    url: 'pages/biography of people/biography of people detail.html?id=' + encodeURIComponent(d.id)
  }),
  'data/Battlefield Map data': (d, f) => ({
    id: d.id, title: d.title, titleKr: d.titleKr, era: d.era, theater: d.theater,
    date: d.date, location: d.location, commanders: d.commanders || [],
    description: (d.description || '').substring(0, 120), keywords: d.keywords || [], image: getRecordImage(d),
    url: 'pages/Battlefield Map/Battlefield Map detail.html?id=' + encodeURIComponent(d.id)
  }),
  'data/war overview data': (d, f) => ({
    id: d.id, name: d.name, era: d.era, region: d.region, period: d.period,
    summary: (d.summary || '').substring(0, 120), belligerents: d.belligerents || '',
    location: d.location || '', tags: d.tags || [], image: getRecordImage(d) || warOverviewImages[d.id] || '',
    url: 'pages/war overview/war overview detail.html?id=' + encodeURIComponent(d.id)
  }),
  'data/Historical Sources & Documents data': (d, f) => ({
    id: d.id, title: d.title, titleKr: d.titleKr, type: d.type, era: d.era,
    date: d.date, author: d.author || '',
    description: (d.description || '').substring(0, 120), keywords: d.keywords || [], image: getRecordImage(d),
    url: 'pages/Historical Sources & Documents/Historical Sources & Documents detail.html?id=' + encodeURIComponent(d.id)
  }),
  'data/strategy and tactics data': (d, f) => ({
    id: d.id, title: d.title, titleKr: d.titleKr, era: d.era, category: d.category,
    origin: d.origin || '', period: d.period || '', region: d.region || '',
    keyFigure: d.keyFigure || '',
    description: (d.description || '').substring(0, 120), keywords: d.keywords || [], image: getRecordImage(d),
    url: 'pages/strategy and tactics/strategy and tactics detail.html?id=' + encodeURIComponent(d.id)
  })
};

function generateFlatSearch() {
  Object.keys(categoryConfigs).forEach(dir => {
    const fullDir = path.join(root, dir);
    if (!fs.existsSync(fullDir)) {
      console.warn(`[SKIP] 폴더 없음: ${dir}`);
      return;
    }

    const files = fs.readdirSync(fullDir)
      .filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'search.json')
      .map(f => f.replace('.json', ''))
      .sort();

    const searchData = [];
    files.forEach(f => {
      try {
        const d = readJson(path.join(fullDir, f + '.json'));
        searchData.push(categoryConfigs[dir](d, f));
      } catch (e) {
        console.warn(`[WARN] ${dir}/${f}.json 읽기 실패: ${e.message}`);
      }
    });

    const catName = dir.replace('data/', '').replace(' data', '');
    const searchDir = path.join(root, 'data/search');
    if (!fs.existsSync(searchDir)) fs.mkdirSync(searchDir, { recursive: true });
    const searchPath = path.join(searchDir, catName + ' search.json');
    fs.writeFileSync(searchPath, JSON.stringify(searchData, null, 2), 'utf-8');
    console.log(`[OK] data/search/${catName} search.json — ${searchData.length}건`);
  });
}

// ── 무기 & 장비: 하위 카테고리 폴더별로 수집 후 단일 search.json 생성 ──
const weaponsDir = path.join(root, 'data/weapons and equipment data');

function generateWeaponsSearch() {
  if (!fs.existsSync(weaponsDir)) {
    console.warn('[SKIP] 폴더 없음: data/weapons and equipment data');
    return;
  }

  const searchData = [];
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

    files.forEach(f => {
      try {
        const d = readJson(path.join(subPath, f + '.json'));
        searchData.push({
          name: d.name, nameEn: d.nameEn, category: d.category || sub,
          era: d.era, origin: d.origin || '', tags: d.tags || [],
          overview: (Array.isArray(d.overview) ? d.overview : [d.overview || '']).join(' ').substring(0, 120),
          image: getRecordImage(d),
          url: 'pages/Weapons and Equipment/Weapons and Equipment item.html?id=' + encodeURIComponent(sub + '/' + f)
        });
      } catch (e) {
        console.warn(`[WARN] weapons/${sub}/${f}.json 읽기 실패: ${e.message}`);
      }
    });
  });

  const searchDir = path.join(root, 'data/search');
  if (!fs.existsSync(searchDir)) fs.mkdirSync(searchDir, { recursive: true });
  const searchPath = path.join(searchDir, 'weapons and equipment search.json');
  fs.writeFileSync(searchPath, JSON.stringify(searchData, null, 2), 'utf-8');
  console.log(`[OK] data/search/weapons and equipment search.json — ${searchData.length}건 (${subDirs.length} 카테고리)`);
}

// ── 미분류 사실: 선반별 아이템 수집 후 search.json 생성 ──
const undefineDir = path.join(root, 'data/Undefine facts data');

function generateUndefineSearch() {
  if (!fs.existsSync(undefineDir)) {
    console.warn('[SKIP] 폴더 없음: data/Undefine facts data');
    return;
  }

  const searchData = [];
  const shelfDirs = fs.readdirSync(undefineDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  shelfDirs.forEach(shelf => {
    const shelfPath = path.join(undefineDir, shelf);
    const files = fs.readdirSync(shelfPath)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();

    files.forEach(f => {
      try {
        const d = readJson(path.join(shelfPath, f + '.json'));
        searchData.push({
          id: d.id || f, name: d.name, nameEn: d.nameEn || '',
          shelf: d.shelf || shelf, era: d.era || '', origin: d.origin || '',
          summary: (d.summary || '').substring(0, 120), tags: d.tags || [], image: getRecordImage(d),
          url: 'pages/Undefine facts/Undefine detail.html?shelf=' + encodeURIComponent(d.shelf || shelf) + '&id=' + encodeURIComponent(d.id || f)
        });
      } catch (e) {
        console.warn(`[WARN] Undefine facts/${shelf}/${f}.json 읽기 실패: ${e.message}`);
      }
    });
  });

  const searchDir = path.join(root, 'data/search');
  if (!fs.existsSync(searchDir)) fs.mkdirSync(searchDir, { recursive: true });
  const searchPath = path.join(searchDir, 'Undefine facts search.json');
  fs.writeFileSync(searchPath, JSON.stringify(searchData, null, 2), 'utf-8');
  console.log(`[OK] data/search/Undefine facts search.json — ${searchData.length}건 (${shelfDirs.length} 선반)`);
}

// ── 전체 인덱스 생성 ──
function generateAll() {
  console.log(`\n[${new Date().toLocaleTimeString()}] search.json 생성 시작...`);
  generateFlatSearch();
  generateWeaponsSearch();
  generateUndefineSearch();
  console.log('[DONE] 모든 search.json 갱신 완료\n');
}

// ── 초기 실행 ──
generateAll();

// ── Watch 모드: --watch 플래그로 실행 시 파일 변경 자동 감지 ──
if (process.argv.includes('--watch')) {
  console.log('[WATCH] 파일 변경 감지 모드 시작...');
  console.log('[WATCH] JSON 파일이 추가/삭제되면 자동으로 search.json을 갱신합니다.');
  console.log('[WATCH] 종료하려면 Ctrl+C를 누르세요.\n');

  let debounceTimer = null;

  function onFileChange(dir, eventType, filename) {
    if (!filename || !filename.endsWith('.json') || filename === 'index.json' || filename === 'search.json') return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      console.log(`[WATCH] 변경 감지: ${dir}/${filename} (${eventType})`);
      generateAll();
    }, 300);
  }

  // 일반 폴더 감시
  Object.keys(categoryConfigs).forEach(dir => {
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
        onFileChange(`weapons and equipment data/${sub}`, eventType, filename)
      );
      console.log(`[WATCH] 감시 중: weapons and equipment data/${sub}/`);
    });
  }

  // 미분류 사실 하위 폴더 감시
  if (fs.existsSync(undefineDir)) {
    const shelfDirs = fs.readdirSync(undefineDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    shelfDirs.forEach(shelf => {
      const shelfPath = path.join(undefineDir, shelf);
      fs.watch(shelfPath, (eventType, filename) =>
        onFileChange(`Undefine facts data/${shelf}`, eventType, filename)
      );
      console.log(`[WATCH] 감시 중: Undefine facts data/${shelf}/`);
    });
  }
}
