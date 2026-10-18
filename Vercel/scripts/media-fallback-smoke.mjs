import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const base = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const artifacts = process.env.BROWSER_ARTIFACT_DIR ?? 'artifacts/media-fallback';
const archive = JSON.parse(await fs.readFile('content/archive.json', 'utf8'));
const record = archive.records.find(item => item.media.displayAllowed && item.media.thumbnailUrl && item.media.attribution);
if (!record) throw new Error('허용된 실제 미리보기 자료가 필요합니다.');
await fs.mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'ko-KR' });
let blocked = 0; const errors = []; const checks = [];
await context.route('https://upload.wikimedia.org/**', async route => { blocked++; await route.fulfill({ status: 429, contentType: 'text/plain', body: 'Simulated provider rate limit. No source media downloaded.' }); });
const page = await context.newPage(); page.setDefaultTimeout(30000);
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(`${base}/archive/?q=${encodeURIComponent(record.title)}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: record.title, exact: true }).scrollIntoViewIfNeeded();
  await page.locator('.record-card .preview-unavailable').first().waitFor();
  assert.ok(await page.locator('.record-card .card-attribution').count() > 0);
  await page.screenshot({ path: path.join(artifacts, 'card-rate-limit-desktop.png'), fullPage: true });
  checks.push('카드의 429 오류 안내와 귀속 정보 유지');

  await page.goto(`${base}/archive/${record.id}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: '외부 자료를 불러오지 못했습니다', exact: true }).waitFor();
  assert.equal(await page.locator('.record-media img').count(), 0);
  const source = page.getByRole('link', { name: '소장처에서 자료 확인', exact: false });
  assert.equal(await source.getAttribute('href'), new URL(record.source.url).href);
  assert.ok((await page.locator('.media-attribution').innerText()).includes(record.media.attribution.creator));
  assert.ok((await page.locator('.media-attribution').innerText()).includes(record.media.attribution.license));
  checks.push('상세의 깨진 이미지 제거·소장처 링크·제작자·라이선스 유지');
  const before = blocked;
  await page.getByRole('button', { name: '다시 불러오기', exact: true }).click();
  await page.getByRole('heading', { name: '외부 자료를 불러오지 못했습니다', exact: true }).waitFor();
  assert.ok(blocked > before);
  checks.push('명시적 재시도 후 반복 429도 오류 안내 유지');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: path.join(artifacts, 'detail-rate-limit-mobile.png'), fullPage: true });
  checks.push('390px 오류 화면 가로 넘침 없음');
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks.length} provider-failure checks; no source media downloaded.`);
} finally {
  await fs.writeFile(path.join(artifacts, 'media-results.json'), JSON.stringify({ at: new Date().toISOString(), base, releaseId: archive.releaseId, recordId: record.id, simulatedStatus: 429, blocked, checks, errors, scope: '공급자 429를 브라우저에서 모의 응답. 외부 파일은 내려받거나 복제하지 않음. 서버·계정 쓰기 없음.' }, null, 2));
  await browser.close();
}
