import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL ?? process.env.PUBLIC_PREVIEW_URL ?? 'http://127.0.0.1:3100';
const artifacts = process.env.BROWSER_ARTIFACT_DIR ?? 'artifacts';
const data = JSON.parse(await fs.readFile('content/archive.json', 'utf8'));
if (data.records.length < 2) throw new Error('실제 공개 자료 2건 이상으로 실행해야 합니다.');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
const page = await context.newPage();
page.setDefaultNavigationTimeout(60000);
page.setDefaultTimeout(30000);
const errors = []; const failedRequests = []; const checks = [];
page.on('pageerror', error => errors.push(page.url() + ': ' + error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
page.on('requestfailed', request => failedRequests.push({ url: request.url(), reason: request.failure()?.errorText }));
const checked = description => { checks.push(description); console.log(`PASS ${description}`); };

try {
  const manifestResponse = await page.request.get(`${base}/release.json`);
  assert.equal(manifestResponse.status(), 200);
  const manifest = await manifestResponse.json();
  const expectedManifest = JSON.parse(await fs.readFile('out/release.json', 'utf8'));
  assert.equal(manifest.releaseId, data.releaseId);
  assert.equal(manifest.sha256, expectedManifest.sha256);
  checked('대상 공개본 릴리스 ID와 SHA256 일치');
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  assert.match(await page.locator('h1').innerText(), /전쟁의 기록/);
  await page.screenshot({ path: path.join(artifacts, 'home-desktop.png'), fullPage: true });
  checked('실제 공개본 홈과 데스크톱 렌더');

  await page.goto(`${base}/archive/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('전쟁·분쟁', { exact: true }).selectOption(data.wars[0].id);
  await page.getByRole('button', { name: /조건 적용/ }).click();
  await page.waitForURL(url => url.searchParams.get('war') === data.wars[0].id);
  assert.equal(await page.locator('.record-card').count(), Math.min(12, data.records.filter(record => record.warIds.includes(data.wars[0].id)).length));
  await page.screenshot({ path: path.join(artifacts, 'search-desktop.png'), fullPage: true });
  checked('전쟁 필터 URL과 실제 검색 결과');
  await page.getByLabel('자료 유형', { exact: true }).selectOption('document');
  await page.getByRole('button', { name: /조건 적용/ }).click();
  await page.waitForURL(url => url.searchParams.get('type') === 'document');
  assert.equal(await page.locator('.record-card').count(), Math.min(12, data.records.filter(record => record.warIds.includes(data.wars[0].id) && record.kind === 'document').length));
  checked('복합 필터와 결과 없음 처리');

  const first = data.records[0];
  await page.goto(`${base}/archive/${first.id}/`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('h1').innerText(), first.title);
  assert.equal(await page.getByRole('link', { name: new RegExp(first.source.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).count() > 0, true);
  await page.getByRole('button', { name: '+ 내 서재에 저장', exact: true }).click();
  await page.getByRole('button', { name: '✓ 서재에 저장됨', exact: true }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'detail-desktop.png'), fullPage: true });
  checked('자료 상세·출처·서재 저장');

  await page.goto(`${base}/shelf/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('새 모음 이름', { exact: true }).fill('검증용 자료 모음');
  await page.getByRole('button', { name: '+ 모음 만들기', exact: true }).click();
  await page.getByLabel('내 메모', { exact: true }).fill('출처 확인과 인용 구간을 기록한 브라우저 검증용 메모');
  await page.getByLabel('검증용 자료 모음', { exact: true }).check();
  await page.getByRole('button', { name: '메모·모음 저장', exact: true }).click();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('war-archive.shelf.v1')));
  assert.equal(saved.items[0].collectionIds.length, 1); assert.match(saved.items[0].note, /출처 확인/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.match(await page.getByLabel('내 메모', { exact: true }).inputValue(), /출처 확인/);
  checked('서재 모음·메모 저장과 새로고침 복원');

  await page.getByRole('button', { name: '비교에 추가', exact: true }).click();
  await page.waitForURL(url => (url.searchParams.get('compare') ?? '').includes(first.id));
  await page.getByLabel('비교할 자료 추가', { exact: true }).selectOption(data.records[1].id);
  await page.waitForURL(url => (url.searchParams.get('compare') ?? '').includes(data.records[1].id));
  assert.equal(await page.locator('.comparison table tr').first().locator('td').count(), 2);
  checked('두 실제 자료 비교와 공유 URL');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '서재 내보내기 ↓', exact: true }).click();
  const download = await downloadPromise; const backupPath = path.join(artifacts, 'shelf-export.json'); await download.saveAs(backupPath);
  const backup = JSON.parse(await fs.readFile(backupPath, 'utf8')); assert.equal(backup.items[0].recordId, first.id);
  const imported = { ...backup, items: [...backup.items, { recordId: data.records[1].id, savedAt: new Date().toISOString(), note: '가져온 메모', collectionIds: [] }] };
  await page.locator('input[type=file]').setInputFiles({ name: 'import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await page.getByRole('button', { name: '현재 서재와 병합', exact: true }).click();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('war-archive.shelf.v1')));
  assert.equal(saved.items.length, 2); assert.match(saved.items[0].note, /출처 확인/);
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.getByRole('status').filter({ hasText: '올바른 서재 파일이 아닙니다' }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('war-archive.shelf.v1')).items.length), 2);
  checked('서재 내보내기·병합 가져오기·손상 입력 거부');

  await page.evaluate(() => localStorage.setItem('war-archive.shelf.v1', '{corrupt'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '서재 데이터가 손상되었습니다', exact: true }).waitFor();
  await page.getByRole('button', { name: '이전 저장본 복구', exact: true }).click();
  await page.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('war-archive.shelf.v1')).version === 1; } catch { return false; } });
  assert.equal(await page.evaluate(() => localStorage.getItem('war-archive.shelf.backup.v1.damaged')), '{corrupt');
  await page.screenshot({ path: path.join(artifacts, 'shelf-desktop.png'), fullPage: true });
  checked('손상된 서재 자동 덮어쓰기 방지와 이전본 복구');

  await page.goto(`${base}/explore/`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.locator('.timeline li').count(), data.records.length);
  if (data.records.some(record => record.location)) {
    await page.locator('.map-point').first().click();
    await page.locator('.map-selection h2').waitFor();
  }
  checked('실제 좌표만 사용하는 지도와 전체 기록 연표');
  await page.goto(`${base}/account/`, { waitUntil: 'domcontentloaded' });
  if (process.env.NEXT_PUBLIC_API_ORIGIN) {
    await page.getByLabel('이메일', { exact: true }).waitFor();
    await page.getByRole('button', { name: '로그인', exact: true }).last().waitFor();
    checked('연결된 서버의 계정 로그인 화면');
  } else {
    await page.getByRole('heading', { name: '현재는 공개 열람과 브라우저 서재를 제공합니다' }).waitFor();
    checked('서버 미연결 계정의 명확한 안내');
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/archive/', `/archive/${first.id}/`, '/shelf/', '/explore/', '/about/', '/wars/', '/collections/', '/contribute/']) {
    await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `모바일 가로 넘침: ${route}`);
    if (route === '/') await page.screenshot({ path: path.join(artifacts, 'home-mobile.png'), fullPage: true });
    if (route === '/archive/') await page.screenshot({ path: path.join(artifacts, 'search-mobile.png'), fullPage: true });
  }
  await page.getByRole('button', { name: '메뉴 ☰', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '닫기 ×', exact: true }).getAttribute('aria-expanded'), 'true');
  checked('390px 주요 9개 경로 넘침 없음·모바일 메뉴');
  assert.deepEqual(errors, [], '브라우저 런타임 오류');
} finally {
  await fs.writeFile(path.join(artifacts, 'browser-results.json'), JSON.stringify({ at: new Date().toISOString(), base, releaseId: data.releaseId, checks, errors, failedRequests, scope: "설치된 msedge (Microsoft Edge)로 대상 주소의 공개 동작을 자동 검증. 실물 모바일·운영 NAS 검증 아님. 서재 작업은 격리된 브라우저 저장소만 사용." }, null, 2));
  await browser.close();
}
