import { chromium } from 'playwright';
import { readFile, mkdir, access } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const nas = resolve(here, '../..');
let localEnv = {};
try { localEnv = parseEnv(await readFile(resolve(nas, '.env'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const base = process.env.ADMIN_BASE_URL ?? `http://127.0.0.1:${localEnv.ADMIN_PORT ?? '4310'}`;
const token = process.env.WAR_ARCHIVE_ADMIN_TOKEN ?? localEnv.WAR_ARCHIVE_ADMIN_TOKEN;
assert.ok(token, 'WAR_ARCHIVE_ADMIN_TOKEN is required in the process environment or NAS/.env.');
const executablePath = process.env.BROWSER_EXECUTABLE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
await access(executablePath);
const output = resolve(nas, 'artifacts/admin');
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
let recordDetail = 'not-run-empty';
let candidateUi = 'not-run-empty';
let screenshots = 4;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.setDefaultTimeout(90_000);
  context.setDefaultNavigationTimeout(90_000);
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.name));
  await page.goto(`${base}/admin/`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: '기록 관리실 로그인' }).waitFor();
  await page.screenshot({ path: resolve(output, 'login-desktop.png'), fullPage: true });
  await page.getByLabel('관리자 토큰', { exact: true }).fill(token);
  if (process.env.ADMIN_OTP) await page.getByLabel('일회용 인증번호', { exact: false }).fill(process.env.ADMIN_OTP);
  await page.getByRole('button', { name: '관리실 들어가기 →', exact: true }).click();
  await page.getByRole('heading', { name: '운영 현황', exact: true }).waitFor();
  const ready = async () => {
    await page.waitForFunction(() => document.querySelector('[aria-busy]')?.getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('.notice-error').count(), 0, (await page.locator('.notice-error').allTextContents()).join(' | ') || 'An API error was displayed.');
  };
  await ready();
  await page.screenshot({ path: resolve(output, 'overview-desktop.png'), fullPage: true });

  for (const tab of ['수집 출처', '자료 검토', '전쟁·관계 사전', '작업 이력', '공개 발행', '정정·제안', '감사 기록', '환경·백업', '계정 복구']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.getByRole('heading', { name: tab, exact: true, level: 1 }).waitFor();
    await ready();
    if (tab === '수집 출처') {
      await page.getByLabel('출처 이름', { exact: true }).fill('브라우저 입력 검증 · 저장하지 않음');
      await page.getByLabel('검색어', { exact: true }).fill('Korean War');
      assert.equal(await page.getByLabel('개별 자료 검사를 통과하면 자동으로 공개합니다.').isDisabled(), true);
      await page.screenshot({ path: resolve(output, 'sources-desktop.png'), fullPage: true });
    }
    if (tab === '자료 검토') {
      await page.getByLabel('자료 상태 필터', { exact: true }).selectOption('');
      await ready();
      if (await page.locator('.record-list-item').count() > 0) {
        await page.locator('.record-list-item').first().click();
        await page.locator('.record-heading').waitFor();
        await page.locator('.asset-section summary').click();
        await page.getByText('보존 파일을 확인하고 있습니다…', { exact: true }).waitFor({ state: 'hidden' });
        assert.equal(await page.locator('.notice-error').count(), 0, 'Record detail or media API error.');
        await page.getByLabel('보존할 파일 · 최대 16MiB', { exact: true }).setInputFiles({ name: 'unsaved-ui-input.txt', mimeType: 'text/plain', buffer: Buffer.from('Local UI form verification. This content is never uploaded.') });
        await page.getByLabel('보존·처리·공개 권한의 근거', { exact: true }).fill('이 파일은 UI 입력 검증용이며 서버 보존 등록이나 공개를 요청하지 않습니다.');
        assert.equal(await page.getByRole('button', { name: '선택한 파일 보존 등록', exact: true }).isEnabled(), true);
        await page.locator('.versions-section > summary').click();
        await page.getByRole('button', { name: '이전 개정 불러오기', exact: true }).click();
        await page.locator('.version-item').first().waitFor();
        assert.equal(await page.locator('.notice-error').count(), 0, 'Record version API error.');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        await page.screenshot({ path: resolve(output, 'record-desktop.png'), fullPage: true });
        recordDetail = 'passed-real-versions-and-unsaved-media-form'; screenshots += 1;

        // Isolated UI branch only. No source candidate is written to the API or screenshots.
        const firstPage = await (await context.request.get(`${base}/api/v1/records?page=1&pageSize=1`)).json();
        const saved = firstPage.data.items[0];
        const path = `/api/v1/records/${encodeURIComponent(saved.id)}`;
        const candidate = { ...saved.public, title: `[UI 검증 · 미저장] ${saved.public.title}`, summary: '브라우저의 후보 표시 동작을 확인하는 미저장 입력입니다. 실제 수집·저장·공개 자료로 사용하지 않습니다.' };
        const match = (url) => url.pathname === path;
        await page.route(match, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { ...saved, sourceCandidate: candidate }, error: null, meta: {} }) }));
        await page.getByRole('button', { name: '새로고침', exact: false }).click();
        await ready();
        await page.getByRole('button', { name: '후보 내용을 편집칸에 반영', exact: true }).click();
        assert.equal(await page.getByLabel('제목', { exact: true }).inputValue(), candidate.title);
        assert.equal(await page.getByLabel('자료 설명과 판독 내용을 검수했습니다.', { exact: true }).isChecked(), false);
        await page.unroute(match);
        const unchanged = await (await context.request.get(`${base}${path}`)).json();
        assert.equal(unchanged.data.public.revision, saved.public.revision);
        assert.equal(unchanged.data.public.title, saved.public.title);
        candidateUi = 'passed-browser-only-injected-candidate-no-save-or-publish';
      }
    }
    if (tab === '전쟁·관계 사전') {
      for (const kind of ['entity', 'collection', 'claim', 'war']) {
        await page.getByLabel('사전 종류', { exact: true }).selectOption(kind);
        await ready();
      }
    }
  }

  await page.getByRole('button', { name: '운영 현황', exact: true }).click();
  await ready();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(output, 'overview-mobile.png'), fullPage: true });
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, page: document.documentElement.scrollWidth }));
  assert.ok(dimensions.page <= dimensions.viewport + 1, 'Mobile viewport has horizontal overflow.');
  for (const tab of ['수집 출처', '자료 검토', '전쟁·관계 사전', '작업 이력', '공개 발행', '환경·백업']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await ready();
    const size = await page.evaluate(() => ({ viewport: window.innerWidth, page: document.documentElement.scrollWidth }));
    assert.ok(size.page <= size.viewport + 1, `Mobile ${tab} has horizontal overflow.`);
  }
  assert.deepEqual(failures, [], 'Browser runtime errors were detected.');
  assert.equal(await page.evaluate(() => localStorage.length), 0, 'Admin auth must not use local storage.');
  await page.getByRole('button', { name: '로그아웃 ↗', exact: true }).click();
  await page.getByRole('heading', { name: '기록 관리실 로그인' }).waitFor();
  console.log(JSON.stringify({ result: 'passed', scope: 'local Edge desktop/mobile, session auth, read-only navigation and unsaved form checks', desktopTabs: 10, mobileTabs: 7, recordDetail, candidateUi, screenshots, mutations: 'session login/logout only' }));
} finally {
  await browser.close();
}
