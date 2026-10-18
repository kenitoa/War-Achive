import { chromium } from 'playwright';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

if (process.env.RUN_ACCOUNT_WRITE_TEST !== '1') throw new Error('실제 연결에 일회성 검증 계정을 생성합니다. 실행하려면 RUN_ACCOUNT_WRITE_TEST=1을 명시하세요.');
const base = new URL(process.env.BASE_URL ?? 'https://kenitoa-war-achive.vercel.app').origin;
const email = `archive-smoke-${randomUUID()}@example.invalid`;
const password = randomBytes(24).toString('base64url');
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'ko-KR' });
const page = await context.newPage();
page.setDefaultTimeout(30000);
page.setDefaultNavigationTimeout(60000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let created = false;
let deleted = false;
const checked = description => console.log(`PASS ${description}`);

async function loginThroughForm() {
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  await page.getByRole('button', { name: '로그인', exact: true }).last().click();
  await page.getByRole('heading', { name: '연결 검증님의 계정' }).waitFor();
}

try {
  await page.goto(`${base}/account/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '회원가입', exact: true }).click();
  await page.getByLabel('이메일', { exact: true }).fill(email);
  await page.getByLabel('표시 이름', { exact: true }).fill('연결 검증');
  await page.getByLabel('비밀번호', { exact: true }).fill(password);
  const registered = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/accounts' && response.request().method() === 'POST');
  await page.getByRole('button', { name: '계정 만들기', exact: true }).click();
  assert.equal((await registered).status(), 201);
  created = true;
  await page.getByText('계정을 만들었습니다. 이메일과 비밀번호로 로그인해 주세요.', { exact: true }).waitFor();
  checked('회원가입 실제 NAS 저장 및 별도 로그인 안내');
  await loginThroughForm();
  const sessionResponse = await context.request.get(`${base}/api/v1/account/session`);
  assert.equal(sessionResponse.status(), 200);
  assert.match(sessionResponse.headers()['cache-control'], /no-store/);
  const session = (await sessionResponse.json()).data;
  assert.equal(session.user.email, email);
  const memberCookie = (await context.cookies(base)).find(cookie => cookie.name === 'wa_member');
  assert.equal(memberCookie?.httpOnly, true);
  if (base.startsWith('https://')) assert.equal(memberCookie?.secure, true);
  checked('같은 출처 프록시의 HttpOnly 세션 쿠키와 비캐시 응답');

  await page.goto(`${base}/archive/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.record-card a[href^="/archive/"]').first().click();
  await page.getByRole('button', { name: '+ 내 서재에 저장', exact: true }).click();
  await page.getByRole('button', { name: '✓ 서재에 저장됨', exact: true }).waitFor();
  await page.goto(`${base}/shelf/`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('내 메모', { exact: true }).fill('실제 NAS 연결을 확인한 일회성 검증 메모');
  await page.getByRole('button', { name: '메모·모음 저장', exact: true }).click();
  await page.getByText('계정 서재 동기화 · 명시적으로 병합하고 저장', { exact: true }).click();
  await page.getByRole('button', { name: '서버 저장본 확인', exact: true }).click();
  await page.getByText(/서버 판 0/).waitFor();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '현재 서재를 서버에 업로드', exact: true }).click();
  await page.getByText('현재 브라우저 서재를 서버에 저장했습니다.', { exact: true }).waitFor();
  const storedResponse = await context.request.get(`${base}/api/v1/account/shelf`);
  assert.equal(storedResponse.status(), 200);
  const stored = (await storedResponse.json()).data;
  assert.equal(stored.revision, 1);
  assert.equal(stored.document.items.length, 1);
  assert.equal(stored.document.items[0].note, '실제 NAS 연결을 확인한 일회성 검증 메모');
  checked('브라우저 서재를 연결한 API 서버에 저장하고 재조회');

  const blocked = await context.request.put(`${base}/api/v1/account/shelf`, { headers: { Origin: base, 'X-CSRF-Token': 'invalid-test-value' }, data: { expectedRevision: 1, document: stored.document } });
  assert.equal(blocked.status(), 403);
  checked('잘못된 CSRF 토큰으로 서재 갱신 거부');
  const loggedOut = await context.request.delete(`${base}/api/v1/account/session`, { headers: { Origin: base, 'X-CSRF-Token': session.csrfToken } });
  assert.equal(loggedOut.status(), 200);
  assert.equal((await context.request.get(`${base}/api/v1/account/shelf`)).status(), 401);
  checked('로그아웃과 비인가 서버 서재 조회 거부');

  await page.goto(`${base}/account/`, { waitUntil: 'domcontentloaded' });
  await loginThroughForm();
  await page.getByText('계정과 서버 서재 삭제', { exact: true }).click();
  await page.getByLabel('현재 비밀번호', { exact: true }).fill(password);
  page.once('dialog', dialog => dialog.accept());
  const removed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/account' && response.request().method() === 'DELETE');
  await page.getByRole('button', { name: '현재 계정 삭제', exact: true }).click();
  assert.equal((await removed).status(), 200);
  deleted = true;
  await page.getByText('계정과 서버 서재를 삭제했습니다. 브라우저 서재는 유지됩니다.', { exact: true }).waitFor();
  assert.equal((await context.request.get(`${base}/api/v1/account/session`)).status(), 401);
  checked('검증 계정과 해당 서버 서재 삭제 및 세션 폐기');
  assert.deepEqual(errors, []);
  checked('브라우저 런타임 오류 없음');
} finally {
  try {
    if (created && !deleted) {
      const login = await context.request.post(`${base}/api/v1/account/session`, { headers: { Origin: base }, data: { email, password } });
      if (login.ok()) {
        const session = (await login.json()).data;
        const response = await context.request.delete(`${base}/api/v1/account`, { headers: { Origin: base, 'X-CSRF-Token': session.csrfToken }, data: { password } });
        if (!response.ok()) console.error('검증 계정 정리를 완료하지 못했습니다. 운영자 계정 목록에서 표시 이름 “연결 검증”을 확인하세요.');
      } else console.error('검증 계정 정리용 재로그인에 실패했습니다. 운영자 계정 목록에서 표시 이름 “연결 검증”을 확인하세요.');
    }
  } catch {
    console.error('검증 계정 정리 중 연결 오류가 발생했습니다. 운영자 계정 목록에서 표시 이름 “연결 검증”을 확인하세요.');
  } finally { await browser.close(); }
}
