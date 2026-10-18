import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import type { Config } from '../config.js';
import type { ArchiveService } from '../application/archive-service.js';
import { SourceInputSchema, ArchiveError } from '../domain/models.js';
import { WarSchema, EntitySchema, CollectionSchema, PublicRecordSchema, ClaimSchema } from '../domain/contracts.js';
import { AdminSessions, RateLimiter, csrfToken, equalSecret, parseCookies, type AdminRole, type AdminIdentity } from '../security.js';
import { IdentityService, RegistrationSchema, MemberLoginSchema, ShelfWriteSchema, PasswordResetSchema } from '../identity/service.js';
import { ArchiveQueries } from '../queries/archive-queries.js';

const adminLoginSchema = z.object({ token: z.string().min(1).max(512), otp: z.string().max(6).optional() }).strict();
const idSchema = z.string().min(1).max(150).regex(/^[a-zA-Z0-9_.:-]+$/);
const requestSchema = z.object({ type: z.enum(['correction', 'contribution', 'privacy']).optional(), kind: z.enum(['correction', 'contribution', 'privacy']).optional(), recordId: idSchema.optional(), message: z.string().trim().min(10).max(10000), contact: z.email().max(254).optional(), sourceUrl: z.url().refine((url) => /^https?:\/\//.test(url)).optional() }).strict();
const updateSchema = z.object({ public: PublicRecordSchema.partial().optional(), expectedRevision: z.number().int().positive(), processing: z.object({ ocr: z.enum(['not-requested', 'unavailable', 'complete']).optional(), translation: z.enum(['not-requested', 'unavailable', 'complete']).optional() }).optional() }).strict();
const catalogKindSchema = z.enum(['war', 'entity', 'collection', 'claim']);
const mutations = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8' };

export function buildApi(service: ArchiveService, config: Config, options: { logger?: boolean; adminDir?: string } = {}) {
  const app = Fastify({ logger: options.logger === false ? false : { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'] }, disableRequestLogging: true, bodyLimit: 1024 * 1024, genReqId: () => randomUUID(), trustProxy: false });
  const sessions = new AdminSessions(config);
  const limiter = new RateLimiter();
  const identities = new IdentityService(service.db);
  const queries = new ArchiveQueries(service.db);
  const adminActors = new WeakMap<FastifyRequest, AdminIdentity>();
  const data = (reply: FastifyReply, value: unknown, meta: Record<string, unknown> = {}) => reply.send({ data: value ?? null, error: null, meta: { requestId: reply.request.id, ...meta } });
  const cookie = (name: string, value: string, maxAge: number) => `${name}=${encodeURIComponent(value)}; Path=/api/v1; HttpOnly; SameSite=${config.COOKIE_SAME_SITE === 'none' ? 'None' : 'Lax'}; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`;
  const actor = (request: FastifyRequest) => adminActors.get(request)?.id ?? 'anonymous';
  const requireRole = (request: FastifyRequest, ...roles: AdminRole[]) => {
    const identity = adminActors.get(request);
    if (!identity || (!roles.includes(identity.role) && identity.role !== 'admin')) throw new ArchiveError('FORBIDDEN', '이 작업을 수행할 권한이 없습니다.', 403);
  };
  const member = async (request: FastifyRequest) => {
    const raw = parseCookies(request.headers.cookie).wa_member;
    const user = await identities.session(raw);
    if (!user) throw new ArchiveError('UNAUTHORIZED', '로그인이 필요합니다.', 401);
    if (mutations.has(request.method) && (!raw || !equalSecret(String(request.headers['x-csrf-token'] ?? ''), csrfToken(raw, config.WAR_ARCHIVE_ADMIN_TOKEN)))) throw new ArchiveError('CSRF_INVALID', '세션 확인 정보가 올바르지 않습니다.', 403);
    return user;
  };
  const audit = async (operation: string, who: string, resourceId: string | null = null, detail: Record<string, unknown> = {}) => {
    await service.db.query('INSERT INTO audit_log(id,operation,actor,resource_id,detail) VALUES($1,$2,$3,$4,$5::jsonb)', [randomUUID(), operation, who, resourceId, JSON.stringify(detail)]);
  };

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer').header('X-Frame-Options', 'DENY').header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (config.cookieSecure) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const path = request.url.split('?')[0] ?? '';
    if (!path.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    const origin = request.headers.origin;
    if (origin) {
      if (!config.allowedOrigins.has(origin)) throw new ArchiveError('ORIGIN_FORBIDDEN', '허용되지 않은 요청 출처입니다.', 403);
      reply.header('Access-Control-Allow-Origin', origin).header('Access-Control-Allow-Credentials', 'true').header('Vary', 'Origin');
    }
    if (request.method === 'OPTIONS') return reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS').header('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token').code(204).send();
    if (!limiter.take(`all:${request.ip}`, 240)) throw new ArchiveError('RATE_LIMITED', '잠시 후 다시 시도하세요.', 429);
    const accountRoute = path === '/api/v1/accounts' || path === '/api/v1/account' || path.startsWith('/api/v1/account/');
    const publicRequest = path === '/api/v1/requests' && request.method === 'POST';
    if (accountRoute || publicRequest) {
      if (!config.publicAccountApiEnabled) throw new ArchiveError('FEATURE_UNAVAILABLE', '공개 계정·제보 API가 연결되지 않았습니다.', 503);
      return;
    }
    if (path === '/api/v1/session' && request.method === 'POST') return;
    const raw = parseCookies(request.headers.cookie).wa_admin;
    const identity = sessions.get(raw);
    if (!identity) throw new ArchiveError('UNAUTHORIZED', '관리자 로그인이 필요합니다.', 401);
    adminActors.set(request, identity);
    if (mutations.has(request.method) && (!raw || !equalSecret(String(request.headers['x-csrf-token'] ?? ''), csrfToken(raw, config.WAR_ARCHIVE_ADMIN_TOKEN)))) throw new ArchiveError('CSRF_INVALID', '세션 확인 정보가 올바르지 않습니다.', 403);
  });
  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ service: 'war-archive-api', operation: request.routeOptions.url ?? 'unmatched', method: request.method, requestId: request.id, status: reply.statusCode, durationMs: reply.elapsedTime }, 'request_completed');
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ data: null, error: { code: 'VALIDATION_ERROR', message: '입력값의 형식과 필수 항목을 확인하세요.' }, meta: { requestId: request.id } });
    if (error instanceof ArchiveError) return reply.code(error.statusCode).send({ data: null, error: { code: error.code, message: error.message }, meta: { requestId: request.id } });
    const candidateStatus = typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    const status = typeof candidateStatus === 'number' && candidateStatus >= 400 && candidateStatus < 500 ? candidateStatus : 500;
    request.log.error({ requestId: request.id, errorCode: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_INVALID' }, 'request_failed');
    return reply.code(status).send({ data: null, error: { code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_INVALID', message: status === 500 ? '요청을 처리하지 못했습니다. 요청 식별자로 운영자에게 문의하세요.' : '요청 형식을 확인하세요.' }, meta: { requestId: request.id } });
  });

  app.get('/healthz', async (_request, reply) => {
    try { await service.db.query('SELECT 1'); return reply.header('Cache-Control', 'no-store').send({ status: 'ok' }); }
    catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
  app.post('/api/v1/session', async (request, reply) => {
    if (!limiter.take(`admin-login:${request.ip}`, 5)) throw new ArchiveError('RATE_LIMITED', '잠시 후 다시 로그인하세요.', 429);
    const body = adminLoginSchema.parse(request.body);
    const result = sessions.login(body.token, body.otp);
    if (!result) { await audit('auth.admin.failed', 'anonymous'); throw new ArchiveError('UNAUTHORIZED', '로그인 정보를 확인하세요.', 401); }
    await audit('auth.admin.login', result.identity.id);
    reply.header('Set-Cookie', cookie('wa_admin', result.session, 8 * 3600));
    return data(reply, { authenticated: true, user: result.identity, role: result.identity.role, csrfToken: csrfToken(result.session, config.WAR_ARCHIVE_ADMIN_TOKEN) });
  });
  app.get('/api/v1/session', async (request, reply) => data(reply, { authenticated: true, user: adminActors.get(request), role: adminActors.get(request)?.role, csrfToken: csrfToken(parseCookies(request.headers.cookie).wa_admin ?? '', config.WAR_ARCHIVE_ADMIN_TOKEN) }));
  app.delete('/api/v1/session', async (request, reply) => { sessions.revoke(parseCookies(request.headers.cookie).wa_admin ?? ''); await audit('auth.admin.logout', actor(request)); reply.header('Set-Cookie', cookie('wa_admin', '', 0)); return data(reply, { loggedOut: true }); });

  app.get('/api/v1/overview', async (_request, reply) => data(reply, await service.overview()));
  app.get('/api/v1/sources', async (request, reply) => data(reply, await queries.list('sources', request.query)));
  app.post('/api/v1/sources', async (request, reply) => { requireRole(request, 'editor', 'publisher'); const body = SourceInputSchema.parse(request.body); if (body.policy.status === 'approved') requireRole(request, 'publisher'); return data(reply.code(201), await service.createSource(body, actor(request))); });
  app.patch('/api/v1/sources/:id', async (request, reply) => {
    requireRole(request, 'editor', 'publisher');
    const id = idSchema.parse((request.params as { id: string }).id);
    const body = SourceInputSchema.partial().parse(request.body);
    if (body.policy) requireRole(request, 'publisher');
    return data(reply, await service.updateSource(id, body, actor(request)));
  });
  app.post('/api/v1/sources/:id/collect', async (request, reply) => { requireRole(request, 'editor', 'publisher'); return data(reply.code(202), await service.collectSource(idSchema.parse((request.params as { id: string }).id))); });
  app.get('/api/v1/records', async (request, reply) => data(reply, await queries.list('records', request.query)));
  app.get('/api/v1/records/:id', async (request, reply) => { const value = await service.getRecord(idSchema.parse((request.params as { id: string }).id)); if (!value) throw new ArchiveError('RESOURCE_NOT_FOUND', '자료를 찾을 수 없습니다.', 404); return data(reply, value); });
  app.patch('/api/v1/records/:id', async (request, reply) => { requireRole(request, 'editor'); return data(reply, await service.updateRecord(idSchema.parse((request.params as { id: string }).id), updateSchema.parse(request.body), actor(request))); });
  app.get('/api/v1/records/:id/versions', async (request, reply) => data(reply, await service.recordVersions(idSchema.parse((request.params as { id: string }).id))));
  app.post('/api/v1/records/:id/review', async (request, reply) => { requireRole(request, 'reviewer'); const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().min(3).max(4000), expectedRevision: z.number().int().positive() }).strict().parse(request.body); return data(reply, await service.reviewRecord(idSchema.parse((request.params as { id: string }).id), body, actor(request))); });
  app.post('/api/v1/records/:id/withdraw', async (request, reply) => { requireRole(request, 'reviewer', 'publisher'); const body = z.object({ reason: z.string().trim().min(3).max(4000), expectedRevision: z.number().int().positive() }).strict().parse(request.body); return data(reply, await service.withdrawRecord(idSchema.parse((request.params as { id: string }).id), body.reason, actor(request), body.expectedRevision)); });
  app.get('/api/v1/jobs', async (request, reply) => data(reply, await queries.list('jobs', request.query)));
  app.post('/api/v1/jobs/:id/retry', async (request, reply) => { requireRole(request, 'editor', 'publisher'); return data(reply.code(202), await service.retryJob(idSchema.parse((request.params as { id: string }).id))); });
  app.get('/api/v1/publications', async (request, reply) => data(reply, await queries.list('publications', request.query)));
  app.post('/api/v1/publications', async (request, reply) => { requireRole(request, 'publisher'); const body = z.object({ target: z.enum(['local', 'github']).default('local') }).strict().parse(request.body ?? {}); return data(reply.code(201), await service.publish(body)); });
  app.get('/api/v1/audit', async (request, reply) => { requireRole(request, 'reviewer', 'publisher'); return data(reply, await queries.list('audit', request.query)); });
  app.get('/api/v1/requests', async (request, reply) => data(reply, await queries.list('requests', request.query)));
  app.post('/api/v1/requests', async (request, reply) => {
    if (!limiter.take(`requests:${request.ip}`, 5, 3600000)) throw new ArchiveError('RATE_LIMITED', '요청 접수 한도에 도달했습니다. 나중에 다시 시도하세요.', 429);
    const body = requestSchema.parse(request.body);
    if (!body.type && !body.kind) throw new ArchiveError('VALIDATION_ERROR', '요청 유형이 필요합니다.');
    return data(reply.code(201), await service.createRequest({ kind: body.type ?? body.kind ?? 'correction', recordId: body.recordId, message: body.sourceUrl ? `${body.message}\n근거: ${body.sourceUrl}` : body.message, contact: body.contact }));
  });
  app.patch('/api/v1/requests/:id', async (request, reply) => { requireRole(request, 'reviewer', 'editor'); const body = z.object({ status: z.enum(['open', 'reviewing', 'resolved', 'rejected']), resolution: z.string().max(10000).optional(), response: z.string().max(10000).optional() }).strict().parse(request.body); return data(reply, await service.updateRequest(idSchema.parse((request.params as { id: string }).id), { status: body.status, resolution: body.resolution ?? body.response ?? '' }, actor(request))); });
  app.get('/api/v1/settings', async (_request, reply) => data(reply, { environment: config.NODE_ENV, database: config.DATABASE_URL ? 'postgresql' : 'pglite-local', remotePublishEnabled: !!config.github, remoteRepository: config.github?.repository ?? null, remoteVerificationConfigured: !!config.PUBLIC_ARCHIVE_VERIFY_URL, objectStorageConfigured: !!config.objectStorage, publicAccountApiEnabled: config.publicAccountApiEnabled, mfaEnabled: !!config.ADMIN_TOTP_SECRET, collectionIntervalMs: config.COLLECTION_INTERVAL_MS, publicationIntervalMs: config.PUBLICATION_INTERVAL_MS, maxItemsPerSource: config.COLLECTION_MAX_ITEMS_PER_SOURCE, autoPublishEnabled: config.AUTO_PUBLISH_ENABLED === 'true', notifications: 'structured-logs', legacyQualityScoreIgnored: true }));
  app.get('/api/v1/records/:id/assets', async (request, reply) => data(reply, await service.listAssets(idSchema.parse((request.params as { id: string }).id))));
  app.post('/api/v1/records/:id/assets', { bodyLimit: 24 * 1024 * 1024 }, async (request, reply) => {
    requireRole(request, 'editor');
    const input = z.object({ data: z.string().min(1).max(23 * 1024 * 1024), mimeType: z.string().min(1).max(100), filename: z.string().min(1).max(200), rightsAttestation: z.string().trim().min(20).max(4000), publishDerivatives: z.boolean().default(false) }).strict().refine((value) => Buffer.from(value.data, 'base64').length <= 16 * 1024 * 1024, '파일은 16MiB 이하여야 합니다.').parse(request.body);
    if (input.publishDerivatives) requireRole(request, 'reviewer');
    return data(reply.code(201), await service.uploadOriginal(idSchema.parse((request.params as { id: string }).id), input, actor(request)));
  });
  app.post('/api/v1/records/:id/produce', async (request, reply) => { requireRole(request, 'editor'); return data(reply.code(202), await service.queueProduction(idSchema.parse((request.params as { id: string }).id))); });
  app.patch('/api/v1/records/:id/assets/:assetId/rights', async (request, reply) => {
    requireRole(request, 'reviewer');
    const parameters = z.object({ id: idSchema, assetId: idSchema }).parse(request.params);
    const input = z.object({ rightsAttestation: z.string().trim().min(20).max(4000), publishDerivatives: z.boolean() }).strict().parse(request.body);
    return data(reply, await service.reviewAsset(parameters.id, parameters.assetId, input, actor(request)));
  });
  app.get('/api/v1/records/:id/assets/:assetId/download', async (request, reply) => {
    const parameters = z.object({ id: idSchema, assetId: idSchema }).parse(request.params);
    const asset = (await service.listAssets(parameters.id)).find((value) => value.id === parameters.assetId);
    if (!asset) throw new ArchiveError('RESOURCE_NOT_FOUND', '원본 파일을 찾을 수 없습니다.', 404);
    const base = await realpath(config.dataDir), path = await realpath(asset.filePath);
    if (!path.startsWith(base + sep)) throw new ArchiveError('FORBIDDEN', '허용되지 않은 파일 경로입니다.', 403);
    await audit('original.download', actor(request), asset.id);
    return reply.type(asset.mimeType).header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`).header('Cache-Control', 'no-store').send(createReadStream(path));
  });
  app.get('/api/v1/backup/export', async (request, reply) => {
    requireRole(request);
    const tables = ['sources', 'records', 'record_versions', 'catalog', 'withdrawals', 'publications', 'media_assets', 'productions', 'audit_log'];
    const backup: Record<string, unknown> = {};
    for (const table of tables) backup[table] = (await service.db.query(`SELECT * FROM ${table}`)).rows;
    await audit('backup.metadata.export', actor(request));
    return reply.header('Content-Disposition', 'attachment; filename="war-archive-metadata.json"').send({ version: 1, exportedAt: new Date().toISOString(), scope: 'metadata-only-not-a-full-database-backup', tables: backup });
  });
  app.get('/api/v1/catalog/:kind', async (request, reply) => data(reply, await service.listCatalog(catalogKindSchema.parse((request.params as { kind: string }).kind))));
  app.post('/api/v1/catalog/:kind', async (request, reply) => {
    requireRole(request, 'reviewer');
    const kind = catalogKindSchema.parse((request.params as { kind: string }).kind);
    const schemas = { war: WarSchema, entity: EntitySchema, collection: CollectionSchema, claim: ClaimSchema };
    const body = schemas[kind].parse(request.body);
    if (kind === 'claim' && 'public' in body && body.public) requireRole(request, 'reviewer');
    return data(reply, await service.upsertCatalog(kind, body, actor(request)));
  });

  app.post('/api/v1/accounts', async (request, reply) => { if (!limiter.take(`register:${request.ip}`, 5, 3600000)) throw new ArchiveError('RATE_LIMITED', '잠시 후 다시 시도하세요.', 429); const user = await identities.register(RegistrationSchema.parse(request.body)); await audit('account.register', user.id); return data(reply.code(201), { user }); });
  app.post('/api/v1/account/session', async (request, reply) => {
    if (!limiter.take(`member-login:${request.ip}`, 10)) throw new ArchiveError('RATE_LIMITED', '잠시 후 다시 로그인하세요.', 429);
    const result = await identities.login(MemberLoginSchema.parse(request.body));
    reply.header('Set-Cookie', cookie('wa_member', result.session, 7 * 86400));
    await audit('account.login', result.user.id);
    return data(reply, { user: result.user, csrfToken: csrfToken(result.session, config.WAR_ARCHIVE_ADMIN_TOKEN) });
  });
  app.get('/api/v1/account/session', async (request, reply) => { const user = await member(request); return data(reply, { user, csrfToken: csrfToken(parseCookies(request.headers.cookie).wa_member ?? '', config.WAR_ARCHIVE_ADMIN_TOKEN) }); });
  app.delete('/api/v1/account/session', async (request, reply) => { const user = await member(request); await identities.logout(parseCookies(request.headers.cookie).wa_member ?? ''); reply.header('Set-Cookie', cookie('wa_member', '', 0)); await audit('account.logout', user.id); return data(reply, { loggedOut: true }); });
  app.get('/api/v1/account/shelf', async (request, reply) => data(reply, await identities.getShelf((await member(request)).id)));
  app.put('/api/v1/account/shelf', async (request, reply) => data(reply, await identities.saveShelf((await member(request)).id, ShelfWriteSchema.parse(request.body))));
  app.post('/api/v1/account/reset', async (request, reply) => { if (!limiter.take(`reset:${request.ip}`, 5)) throw new ArchiveError('RATE_LIMITED', '잠시 후 다시 시도하세요.', 429); await identities.reset(PasswordResetSchema.parse(request.body)); return data(reply, { reset: true, message: '비밀번호를 변경했습니다. 다시 로그인하세요.' }); });
  app.delete('/api/v1/account', async (request, reply) => { if (!config.publicAccountApiEnabled) throw new ArchiveError('FEATURE_UNAVAILABLE', '공개 계정 API가 연결되지 않았습니다.', 503); const user = await member(request); const body = z.object({ password: z.string().min(1).max(256) }).strict().parse(request.body); await identities.requirePassword(user.id, body.password); await identities.deleteAccount(user.id); reply.header('Set-Cookie', cookie('wa_member', '', 0)); await audit('account.delete', user.id); return data(reply, { deleted: true }); });
  app.get('/api/v1/members', async (request, reply) => { requireRole(request); return data(reply, await identities.listMembers()); });
  app.post('/api/v1/members/:id/reset', async (request, reply) => { requireRole(request); const id = idSchema.parse((request.params as { id: string }).id); const result = await identities.issueReset(id); await audit('account.reset.issued', actor(request), id); return data(reply, result); });

  app.get('/', async (_request, reply) => reply.redirect('/admin/'));
  app.get('/admin', async (_request, reply) => reply.redirect('/admin/'));
  app.get('/admin/*', async (request, reply) => {
    if (!options.adminDir) return reply.code(503).type('text/plain').send('관리자 웹을 먼저 빌드하세요: NAS/admin에서 npm run build');
    let suffix: string;
    try { suffix = decodeURIComponent(request.url.split('?')[0]?.slice('/admin/'.length) ?? ''); } catch { throw new ArchiveError('VALIDATION_ERROR', '잘못된 경로입니다.'); }
    if (suffix.includes('\\') || suffix.includes('\0') || suffix.split('/').includes('..') || /%2e|%2f|%5c/i.test(suffix)) throw new ArchiveError('FORBIDDEN', '허용되지 않은 경로입니다.', 403);
    const base = resolve(options.adminDir);
    let file = resolve(base, suffix || 'index.html');
    if (!file.startsWith(base + sep)) throw new ArchiveError('FORBIDDEN', '허용되지 않은 경로입니다.', 403);
    try { if (!(await stat(file)).isFile()) file = resolve(base, 'index.html'); }
    catch { if (extname(suffix)) return reply.code(404).send('파일을 찾을 수 없습니다.'); file = resolve(base, 'index.html'); }
    reply.header('Cache-Control', suffix.startsWith('assets/') ? 'public,max-age=31536000,immutable' : 'no-store');
    return reply.type(mime[extname(file)] ?? 'application/octet-stream').send(createReadStream(file));
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send({ data: null, error: { code: 'RESOURCE_NOT_FOUND', message: '요청한 리소스를 찾을 수 없습니다.' }, meta: { requestId: request.id } }));
  return app;
}
