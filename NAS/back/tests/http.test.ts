import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';
import { createArchiveService, type ArchiveService } from '../src/application/archive-service.js';
import { buildApi } from '../src/presentation/api.js';
import { loadConfig } from '../src/config.js';
import { totp, verifyTotp } from '../src/security.js';

const adminToken = 'test-admin-token-01234567890123456789';
const editorToken = 'test-editor-token-01234567890123456789';
const config = () => loadConfig({ NODE_ENV: 'test', WAR_ARCHIVE_ADMIN_TOKEN: adminToken, ADMIN_EDITOR_TOKEN: editorToken, ADMIN_TOTP_SECRET: '', DATABASE_URL: '', REMOTE_PUBLISH_ENABLED: 'false', PUBLIC_ACCOUNT_API_ENABLED: 'true', ALLOWED_ORIGINS: '', ADMIN_PORT: '4310' });
const SessionSchema = z.object({ data: z.object({ csrfToken: z.string(), user: z.object({ id: z.string() }) }) });
const errorCode = (body: string) => z.object({ error: z.object({ code: z.string() }) }).parse(JSON.parse(body) as unknown).error.code;

describe('HTTP authorization and persistent accounts', () => {
  let directory: string;
  let service: ArchiveService;
  let app: ReturnType<typeof buildApi>;
  let adminCookie: string;
  let adminCsrf: string;
  beforeAll(async () => {
    directory = await mkdtemp(resolve(tmpdir(), 'war-archive-http-'));
    service = await createArchiveService({ pglitePath: 'memory://', dataDir: resolve(directory, 'data'), exportDir: resolve(directory, 'exports'), autoPublish: false });
    app = buildApi(service, { ...config(), dataDir: resolve(directory, 'data') }, { logger: false });
    const login = await app.inject({ method: 'POST', url: '/api/v1/session', payload: { token: adminToken } });
    expect(login.statusCode).toBe(200);
    adminCsrf = SessionSchema.parse(login.json()).data.csrfToken;
    adminCookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
  }, 30000);
  afterAll(async () => { await app.close(); await service.close(); await rm(directory, { recursive: true, force: true }); });

  it('requires authentication and never caches private responses', async () => {
    const result = await app.inject('/api/v1/overview');
    expect(result.statusCode).toBe(401);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(errorCode(result.body)).toBe('UNAUTHORIZED');
    expect((await app.inject('/healthz')).statusCode).toBe(200);
  });
  it('protects writes from CSRF and unapproved origins', async () => {
    const denied = await app.inject({ method: 'POST', url: '/api/v1/publications', headers: { cookie: adminCookie }, payload: { target: 'local' } });
    expect(denied.statusCode).toBe(403);
    expect(errorCode(denied.body)).toBe('CSRF_INVALID');
    const foreign = await app.inject({ method: 'POST', url: '/api/v1/session', headers: { origin: 'https://attacker.example' }, payload: { token: adminToken } });
    expect(foreign.statusCode).toBe(403);
    expect(errorCode(foreign.body)).toBe('ORIGIN_FORBIDDEN');
  });
  it('applies server-side editor restrictions to publication', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/v1/session', payload: { token: editorToken } });
    const token = SessionSchema.parse(login.json()).data.csrfToken;
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const result = await app.inject({ method: 'POST', url: '/api/v1/publications', headers: { cookie, 'x-csrf-token': token }, payload: { target: 'local' } });
    expect(result.statusCode).toBe(403);
    expect(errorCode(result.body)).toBe('FORBIDDEN');
  });
  it('validates list bounds and source changes through real persistence', async () => {
    const headers = { cookie: adminCookie, 'x-csrf-token': adminCsrf };
    expect((await app.inject({ url: '/api/v1/sources?pageSize=999', headers })).statusCode).toBe(400);
    const created = await app.inject({ method: 'POST', url: '/api/v1/sources', headers, payload: { name: '검증용 출처', provider: 'commons', query: 'Korean War', enabled: false } });
    expect(created.statusCode).toBe(201);
    const source = z.object({ data: z.object({ id: z.string() }) }).parse(created.json()).data;
    const patched = await app.inject({ method: 'PATCH', url: `/api/v1/sources/${source.id}`, headers, payload: { name: '수정된 출처' } });
    expect(patched.statusCode).toBe(200);
    expect(JSON.stringify(patched.json())).toContain('수정된 출처');
  });
  it('returns safe error envelopes without internal details', async () => {
    const spy = vi.spyOn(service.db, 'query').mockRejectedValueOnce(new Error('password=never-expose-database-secret'));
    const result = await app.inject({ url: '/api/v1/sources', headers: { cookie: adminCookie } });
    spy.mockRestore();
    expect(result.statusCode).toBe(500);
    expect(result.body).not.toContain('never-expose');
    expect(errorCode(result.body)).toBe('INTERNAL_ERROR');
  });
  it('creates accounts, prevents unauthorized shelf access, and detects revision conflicts', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/v1/accounts', payload: { email: 'reader@example.test', displayName: '기록 독자', password: 'a-long-unique-passphrase' } });
    expect(created.statusCode).toBe(201);
    expect(created.body).not.toContain('password_hash');
    const login = await app.inject({ method: 'POST', url: '/api/v1/account/session', payload: { email: 'reader@example.test', password: 'a-long-unique-passphrase' } });
    expect(login.statusCode).toBe(200);
    const csrf = SessionSchema.parse(login.json()).data.csrfToken;
    const cookie = String(login.headers['set-cookie']).split(';')[0] ?? '';
    expect((await app.inject('/api/v1/account/shelf')).statusCode).toBe(401);
    const headers = { cookie, 'x-csrf-token': csrf };
    const saved = await app.inject({ method: 'PUT', url: '/api/v1/account/shelf', headers, payload: { expectedRevision: 0, document: { version: 1, savedIds: ['rec-a'] } } });
    expect(saved.statusCode).toBe(200);
    const conflict = await app.inject({ method: 'PUT', url: '/api/v1/account/shelf', headers, payload: { expectedRevision: 0, document: {} } });
    expect(conflict.statusCode).toBe(409);
    expect(errorCode(conflict.body)).toBe('SHELF_CONFLICT');
    const memberId = SessionSchema.parse(login.json()).data.user.id;
    const issued = await app.inject({ method: 'POST', url: `/api/v1/members/${memberId}/reset`, headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf } });
    const resetToken = z.object({ data: z.object({ token: z.string() }) }).parse(issued.json()).data.token;
    expect((await app.inject({ method: 'POST', url: '/api/v1/account/reset', payload: { token: resetToken, password: 'another-secure-passphrase' } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/account/shelf', headers: { cookie } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/account/reset', payload: { token: resetToken, password: 'third-secure-passphrase' } })).statusCode).toBe(400);
    const relogin = await app.inject({ method: 'POST', url: '/api/v1/account/session', payload: { email: 'reader@example.test', password: 'another-secure-passphrase' } });
    const replacementCsrf = SessionSchema.parse(relogin.json()).data.csrfToken;
    const replacementCookie = String(relogin.headers['set-cookie']).split(';')[0] ?? '';
    const replacementHeaders = { cookie: replacementCookie, 'x-csrf-token': replacementCsrf };
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/account', headers: replacementHeaders, payload: { password: 'incorrect-password' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/account', headers: replacementHeaders, payload: { password: 'another-secure-passphrase' } })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/account/session', headers: { cookie: replacementCookie } })).statusCode).toBe(401);
  });
  it('records public submissions without exposing their contact details', async () => {
    const result = await app.inject({ method: 'POST', url: '/api/v1/requests', payload: { type: 'correction', message: '원 소장처의 새 설명을 확인해 주세요.', contact: 'private@example.test', sourceUrl: 'https://www.loc.gov/' } });
    expect(result.statusCode).toBe(201);
    expect(result.body).not.toContain('private@example.test');
    expect((await app.inject('/api/v1/requests')).statusCode).toBe(401);
  });
  it('allows 100 independent registration and submission attempts per peer each hour and rejects header spoofing', async () => {
    const limitedApp = buildApi(service, config(), { logger: false });
    const remoteAddress = '198.51.100.100';
    let now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const post = (url: string, payload: Record<string, unknown>, forwarded: string, peer = remoteAddress) => limitedApp.inject({ method: 'POST', url, payload, remoteAddress: peer, headers: { 'x-forwarded-for': forwarded, forwarded: `for=${forwarded}` } });
    try {
      for (let attempt = 1; attempt < 100; attempt += 1) {
        expect((await post('/api/v1/accounts', {}, `203.0.113.${attempt}`)).statusCode).toBe(400);
        expect((await post('/api/v1/requests', {}, `203.0.113.${attempt}`)).statusCode).toBe(400);
      }
      const registration = await post('/api/v1/accounts', { email: 'rate-boundary@example.test', displayName: '한도 검증 독자', password: 'a-rate-boundary-passphrase' }, '203.0.113.100');
      expect(registration.statusCode).toBe(201);
      const submission = await post('/api/v1/requests', { type: 'contribution', message: '시간당 백 번째 자료 접수도 정상 처리됩니다.' }, '203.0.113.100');
      expect(submission.statusCode).toBe(201);
      for (const url of ['/api/v1/accounts', '/api/v1/requests']) {
        const blocked = await post(url, {}, '203.0.113.101');
        expect(blocked.statusCode).toBe(429);
        expect(errorCode(blocked.body)).toBe('RATE_LIMITED');
        expect(blocked.headers['cache-control']).toBe('no-store');
        expect((await post(url, {}, remoteAddress, '198.51.100.101')).statusCode).toBe(400);
      }
      now += 59 * 60000;
      for (const url of ['/api/v1/accounts', '/api/v1/requests']) expect((await post(url, {}, '203.0.113.102')).statusCode).toBe(429);
      now += 60000;
      for (const url of ['/api/v1/accounts', '/api/v1/requests']) expect((await post(url, {}, '203.0.113.103')).statusCode).toBe(400);
    } finally {
      clock.mockRestore();
      await limitedApp.close();
    }
  });
  it('paginates the database beyond the previous in-memory job limit', async () => {
    await service.db.query("INSERT INTO jobs(id,kind,payload,dedupe_key) SELECT 'page-test-'||n::text,'collect','{}'::jsonb,'page-test-'||n::text FROM generate_series(1,601) AS n");
    const result = await app.inject({ url: '/api/v1/jobs?page=4&pageSize=200', headers: { cookie: adminCookie } });
    expect(result.statusCode).toBe(200);
    const body = z.object({ data: z.object({ total: z.number(), items: z.array(z.unknown()) }) }).parse(result.json());
    expect(body.data.total).toBe(601);
    expect(body.data.items).toHaveLength(1);
  });
});

describe('TOTP and deployment configuration', () => {
  it('matches the RFC TOTP SHA1 vector at 59 seconds and permits only adjacent windows', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(totp(secret, 59000)).toBe('287082');
    expect(verifyTotp(secret, '287082', 59000)).toBe(true);
    expect(verifyTotp(secret, '287082', 150000)).toBe(false);
  });
  it('fails closed on weak authentication or missing production storage', () => {
    expect(() => loadConfig({ NODE_ENV: 'test', WAR_ARCHIVE_ADMIN_TOKEN: 'short' })).toThrow('WAR_ARCHIVE_ADMIN_TOKEN');
    expect(() => loadConfig({ NODE_ENV: 'production', DATABASE_URL: '', WAR_ARCHIVE_ADMIN_TOKEN: adminToken })).toThrow('DATABASE_URL');
  });
});
