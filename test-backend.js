/**
 * War Archive 백엔드 간단 진단 스크립트
 * 사용법: node test-backend.js
 */

const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const BACK_DIR = path.join(__dirname, 'back');
const PORT = 3999;

// ── 유틸 ──

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// ── 1. 의존성 설치 확인 ──

console.log('=== 1. 의존성 설치 확인 ===');
try {
  execSync('npm install', { cwd: BACK_DIR, stdio: 'inherit' });
  console.log('[OK] npm install 완료\n');
} catch (e) {
  console.error('[FAIL] npm install 실패:', e.message);
  process.exit(1);
}

// ── 2. 핵심 모듈 로드 테스트 ──

console.log('=== 2. 핵심 모듈 로드 테스트 ===');
const modules = ['express', 'bcryptjs', 'jsonwebtoken', 'express-validator', 'helmet', 'cors'];
for (const mod of modules) {
  try {
    require(path.join(BACK_DIR, 'node_modules', mod));
    console.log(`  [OK] ${mod}`);
  } catch (e) {
    console.error(`  [FAIL] ${mod} - ${e.message}`);
  }
}
console.log();

// ── 3. 서버 기동 & API 테스트 ──

console.log('=== 3. 서버 기동 & API 테스트 ===');

process.env.JWT_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.PORT = String(PORT);

try {
  require(path.join(BACK_DIR, 'server.js'));
  console.log('[OK] server.js 로드 성공');
} catch (e) {
  console.error('[FAIL] server.js 로드 실패:', e.message);
  process.exit(1);
}

console.log('API 테스트 대기 중 (3초)...\n');

setTimeout(async () => {
  try {
    const tests = [
      { label: 'Health Check',  method: 'GET',  path: '/health' },
      { label: '회원가입',       method: 'POST', path: '/api/auth/register', body: { username: 'testuser', password: 'testpass1234' }, expect: 201 },
      { label: '로그인',         method: 'POST', path: '/api/auth/login',    body: { username: 'testuser', password: 'testpass1234' }, expect: 200 },
    ];

    for (const t of tests) {
      console.log(`--- ${t.method} ${t.path} (${t.label}) ---`);
      const res = await request(t.method, t.path, t.body);
      const ok = !t.expect || res.status === t.expect;
      console.log(`  Status: ${res.status} ${ok ? '[OK]' : '[FAIL]'}`);
      console.log(`  Response: ${res.body}\n`);
    }
  } catch (e) {
    console.error(`[FAIL] 오류: ${e.message}`);
  } finally {
    console.log('=== 진단 완료 ===');
    process.exit(0);
  }
}, 3000);
