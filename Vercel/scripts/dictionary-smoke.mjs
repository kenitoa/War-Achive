import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const base = process.env.PUBLIC_PREVIEW_URL ?? 'http://127.0.0.1:3100';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await fs.mkdir('artifacts', { recursive: true });
try {
  await page.goto(`${base}/entities/`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.dictionary-row').count(), 5);
  assert.equal(await page.locator('.entity-card').count(), 0);
  await page.screenshot({ path: 'artifacts/dictionary-desktop.png', fullPage: true });
  const paths = await page.locator('.dictionary-name a').evaluateAll(links => links.map(link => link.getAttribute('href')));
  for (const path of paths) {
    assert.equal((await page.goto(`${base}${path}`)).status(), 200);
    assert.ok(await page.locator('.dictionary-facts>li').count() >= 2);
    assert.ok(await page.locator('.dictionary-sources>li').count() >= 1);
    assert.ok((await page.locator('.dictionary-review').innerText()).includes('미실시'));
    assert.ok((await page.locator('#linked-records').innerText()).includes('직접 연결된 원자료 0건'));
    const references = await page.locator('.dictionary-facts a').evaluateAll(links => links.map(link => link.hash));
    for (const hash of references) assert.equal(await page.locator(hash).count(), 1);
    assert.equal(await page.locator('.dictionary-context .record-card').count(), 0);
  }
  console.log('PASS 사전 5개 경로·내용별 출처·전문가 검토 미실시·직접 연결 0건');
  await page.goto(`${base}/entities/?q=DMZ`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.dictionary-row').count(), 1);
  assert.ok((await page.locator('.dictionary-name h2').innerText()).includes('비무장지대'));
  await page.goto(`${base}/entities/?type=person`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.dictionary-row').count(), 0);
  assert.equal(await page.locator('.dictionary-empty').count(), 1);
  await page.goto(`${base}/entities/?scope=pending`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.dictionary-row').count(), 0);
  console.log('PASS 별칭 검색·유형 필터·미등록 근거 필터');
  await page.goto(`${base}/entities/wikidata-q16520/`);
  assert.equal(await page.locator('.dictionary-imported').getAttribute('open'), null);
  await page.locator('.dictionary-imported summary').click();
  assert.ok((await page.locator('.dictionary-imported').innerText()).includes('35.18'));
  await page.goto(`${base}/entities/korean-armistice-1953/`);
  await page.screenshot({ path: 'artifacts/dictionary-entry-desktop.png', fullPage: true });
  assert.ok((await page.locator('.dictionary-facts').innerText()).includes('평화조약'));
  await page.locator('.dictionary-correction a').click();
  await page.waitForURL(url => url.searchParams.get('entity') === 'korean-armistice-1953');
  const message = page.locator('textarea[name=message]');
  if (await message.count()) await page.waitForFunction(() => document.querySelector('textarea[name=message]')?.value.includes('korean-armistice-1953'));
  console.log('PASS 기존 좌표의 분리·정전 개념 구분·정정 요청 대상 전달');
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/entities/', ...paths]) {
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px: ${path}`);
      if (width === 390 && path === '/entities/') await page.screenshot({ path: 'artifacts/dictionary-mobile.png', fullPage: true });
    }
  }
  console.log('PASS 모바일·태블릿 목록과 상세 6개 경로 가로 넘침 없음');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
