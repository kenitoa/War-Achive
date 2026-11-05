import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.PUBLIC_PREVIEW_URL ?? 'http://127.0.0.1:3100';
const data = JSON.parse(await fs.readFile('content/archive.json', 'utf8'));
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const checks = [];
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
await fs.mkdir('artifacts', { recursive: true });
try {
  await page.goto(`${base}/wars/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.finder-war').count(), data.wars.length);
  assert.equal(await page.locator('.finder-events li').count(), 18);
  assert.equal(await page.locator('.finder-topics a').count(), 9);
  await page.screenshot({ path: 'artifacts/reading-wars-desktop.png', fullPage: true });
  for (const war of data.wars) {
    await page.goto(`${base}/wars/${war.id}/`);
    assert.ok(await page.locator('.reading-chapter').count() >= 4);
    assert.ok(await page.locator('.context-timeline>li').count() >= 5);
    assert.ok(await page.locator('.editorial-sources a').count() >= 2);
    assert.equal(await page.locator('h1').innerText(), war.name);
  }
  pass('전쟁 3개 상세의 해설·연표·출처');
  await page.goto(`${base}/collections/`);
  const guideLinks = await page.locator('.guide-card').evaluateAll(links => links.map(link => link.getAttribute('href')));
  assert.equal(guideLinks.length, 9);
  await page.screenshot({ path: 'artifacts/reading-collections-desktop.png', fullPage: true });
  for (const path of guideLinks) {
    const response = await page.goto(`${base}${path}`);
    assert.equal(response.status(), 200);
    assert.equal(await page.locator('.reading-chapter').count(), 3);
    assert.ok(await page.locator('#guide-records .record-card').count() > 0);
    assert.ok(await page.locator('#guide-records .record-card').count() <= 12);
  }
  pass('주제 9개 정적 경로·읽기 안내·실제 연결 자료');
  await page.goto(`${base}/collections/reading-photographs/`);
  const photoCount = data.records.filter(record => record.kind === 'photograph').length;
  assert.match(await page.locator('.result-total').innerText(), new RegExp(String(photoCount)));
  const firstTitle = await page.locator('#guide-records .record-card h3').first().innerText();
  await page.getByRole('link', { name: '다음 →', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('page') === '2');
  await page.locator('#guide-records .section-heading').filter({ hasText: '2 /' }).waitFor();
  assert.notEqual(await page.locator('#guide-records .record-card h3').first().innerText(), firstTitle);
  await page.reload();
  assert.equal(new URL(page.url()).searchParams.get('page'), '2');
  await page.locator('#guide-records .section-heading').filter({ hasText: '2 /' }).waitFor();
  await page.getByRole('combobox', { name: '전쟁·분쟁', exact: true }).selectOption(data.wars[0].id);
  await page.getByRole('button', { name: '조건 적용', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('war') === data.wars[0].id && !url.searchParams.has('page'));
  const filteredCount = data.records.filter(record => record.kind === 'photograph' && record.warIds.includes(data.wars[0].id)).length;
  await page.locator('.result-total').filter({ hasText: `${filteredCount}건` }).waitFor();
  pass('모음 페이지 이동·새로고침·전쟁 필터 및 페이지 초기화');
  for (const collection of data.collections) {
    await page.goto(`${base}/collections/${collection.id}/`);
    assert.equal(await page.locator('#guide-records .record-card').count(), Math.min(12, collection.recordIds.length));
    assert.equal(await page.locator('.reading-chapter').count(), 0);
  }
  pass('기존 발행 모음의 원래 연결과 빈 상태 보존');
  await page.goto(`${base}/explore/?war=korean-war`);
  await page.locator('.history-launcher').filter({ hasText: '한국전쟁' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.history-launcher').length === 1);
  assert.equal(await page.locator('.history-launcher').count(), 1);
  await page.locator('.history-launcher').click();
  await page.getByRole('dialog').getByRole('link', { name: '1950년 자료 →' }).click();
  await page.waitForURL(url => url.searchParams.get('from') === '1950' && url.searchParams.get('war') === 'korean-war');
  await page.waitForFunction(() => document.querySelector('input[name="from"]')?.value === '1950');
  await page.goto(`${base}/explore/`);
  assert.equal(await page.locator('.history-launcher').count(), 3);
  await page.screenshot({ path: 'artifacts/reading-explore-desktop.png', fullPage: true });
  pass('역사 연표와 자료 연표의 구분 및 기간 탐색 연결');
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/wars/', '/wars/korean-war/', '/wars/world-war-i/', '/wars/world-war-ii/', '/explore/', '/collections/', ...guideLinks]) {
      await page.goto(`${base}${path}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px 가로 넘침: ${path}`);
      if (width === 390 && ['/wars/', '/explore/', '/collections/'].includes(path)) await page.screenshot({ path: `artifacts/reading-${path.split('/')[1]}-mobile.png`, fullPage: true });
    }
  }
  pass('390px·768px 목록과 상세 15개 경로 가로 넘침 없음');
  assert.deepEqual(errors, []);
} finally {
  await fs.writeFile('artifacts/reading-room-results.json', JSON.stringify({ at: new Date().toISOString(), base, checks, errors, scope: '격리된 Edge 브라우저와 로컬 정적 빌드. 운영·실물 기기 검증 아님.' }, null, 2));
  await browser.close();
}
