import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createGateway, loadConfig } from '../src/server.mjs';

let upstream, gateway, origin, received;
beforeEach(async () => {
  received = [];
  upstream = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({ method: request.method, path: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
    if (request.headers['user-agent'] === 'fixture-failure') { response.writeHead(500); response.end('postgres://secret-password@private-db:5432/private contact@example.test'); return; }
    if (request.url === '/healthz') { response.writeHead(200, { 'Set-Cookie': 'wa_admin=private; Path=/api/v1' }); response.end('{"status":"ok","database":"private-db","password":"private"}'); return; }
    response.writeHead(request.method === 'OPTIONS' ? 204 : 200, { 'Content-Type': 'application/json', 'Set-Cookie': ['wa_member=member-only; Path=/api/v1; HttpOnly; Secure; SameSite=None', 'wa_admin=never-public; Path=/api/v1; HttpOnly'], 'Access-Control-Allow-Origin': request.headers.origin ?? 'https://archive.example.test', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token', 'X-Private-Database': 'never-public', 'Cache-Control': 'public,max-age=86400' });
    response.end(JSON.stringify({ data: { accepted: true }, error: null }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const port = upstream.address().port;
  gateway = createGateway(loadConfig({ API_ORIGIN: `http://127.0.0.1:${port}` }));
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  origin = `http://127.0.0.1:${gateway.address().port}`;
});
afterEach(async () => {
  for (const server of [gateway, upstream]) { if (!server) continue; server.closeAllConnections(); await new Promise((fulfil) => server.close(fulfil)); }
});

function raw(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((fulfil, reject) => {
    const request = httpRequest(`${origin}${path}`, { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => fulfil({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

test('forwards every explicit public route and strips only its exact ingress prefix', async () => {
  for (const [path, methods] of [['/accounts', ['POST']], ['/account/session', ['GET', 'POST', 'DELETE']], ['/account/shelf', ['GET', 'PUT']], ['/account/reset', ['POST']], ['/account', ['DELETE']], ['/requests', ['POST']]]) {
    for (const method of methods) {
      const result = await raw(`/war-archive-api/api/v1${path}`, { method });
      assert.equal(result.status, 200);
      assert.equal(received.at(-1).path, `/api/v1${path}`);
      assert.equal(received.at(-1).method, method);
    }
  }
  assert.equal((await raw('/api/v1/account/session')).status, 200);
});

test('rejects admin/private APIs, unsupported methods and ambiguous paths without reaching upstream', async () => {
  for (const path of ['/admin/', '/api/v1/session', '/api/v1/sources', '/api/v1/settings', '/api/v1/account/reset-token', '/api/v1/requests', '/war-archive-api-admin/api/v1/account/session', '/war-archive-api/api/v1/account/%2e%2e/session', '/war-archive-api%2fapi/v1/account/session', '/api/v1/account%2fsession', '/api/v1/account%5csession', '/api/v1/account/../session', '/api//v1/account/session', '/api/v1/account/session?admin=true', '/api/v1/account/session/']) {
    assert.equal((await raw(path)).status, 404, path);
  }
  for (const method of ['HEAD', 'PATCH', 'TRACE']) assert.equal((await raw('/api/v1/account/session', { method })).status, 404);
  assert.equal((await raw('/api/v1/accounts', { method: 'DELETE' })).status, 404);
  assert.equal(received.length, 0);
});

test('forwards only member cookies and required headers; preserves same-origin cookie Path and no-store', async () => {
  const result = await raw('/war-archive-api/api/v1/account/session', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://archive.example.test', 'X-CSRF-Token': 'csrf-proof', Accept: 'application/json', 'User-Agent': 'fixture-client', Cookie: 'wa_admin=admin-secret; wa_member=member-proof; unrelated=private', Authorization: 'Bearer private-token', 'X-Forwarded-Host': 'evil.example.test', 'X-Forwarded-For': '127.0.0.1', 'X-Private-Header': 'private' }, body: '{"password":"not-logged"}' });
  assert.equal(result.status, 200);
  const request = received.at(-1);
  assert.equal(request.headers.cookie, 'wa_member=member-proof');
  assert.equal(request.headers.origin, 'https://archive.example.test');
  assert.equal(request.headers['x-csrf-token'], 'csrf-proof');
  for (const name of ['authorization', 'x-forwarded-host', 'x-forwarded-for', 'x-private-header']) assert.equal(request.headers[name], undefined);
  assert.equal(request.body, '{"password":"not-logged"}');
  assert.deepEqual(result.headers['set-cookie'], ['wa_member=member-only; Path=/api/v1; HttpOnly; Secure; SameSite=None']);
  assert.equal(result.headers['cache-control'], 'no-store');
  assert.equal(result.headers['x-private-database'], undefined);
  assert.equal(result.headers['access-control-allow-origin'], 'https://archive.example.test');
  await raw('/api/v1/account/session', { headers: { Cookie: 'wa_member=first; wa_member=second; wa_admin=private' } });
  assert.equal(received.at(-1).headers.cookie, undefined);
});

test('enforces a 1 MiB limit for announced and streamed bodies and rejects non-JSON bodies', async () => {
  const body = 'x'.repeat(1024 * 1024 + 1);
  assert.equal((await raw('/api/v1/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) }, body })).status, 413);
  assert.equal((await raw('/api/v1/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' }, body })).status, 413);
  assert.equal((await raw('/api/v1/accounts', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'private' })).status, 415);
  assert.equal((await raw('/api/v1/accounts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' }, body: '{}' })).status, 415);
  assert.equal(received.length, 0);
});

test('returns a minimal health result and masks private upstream failures', async () => {
  const health = await raw('/war-archive-api/healthz');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.body), { status: 'ok' });
  assert.equal(health.headers['set-cookie'], undefined);
  assert.equal(health.headers['cache-control'], 'no-store');
  const failure = await raw('/api/v1/account/session', { headers: { 'User-Agent': 'fixture-failure' } });
  assert.equal(failure.status, 502);
  assert.equal(JSON.parse(failure.body).error.code, 'PUBLIC_API_UNAVAILABLE');
  assert.doesNotMatch(failure.body, /password|postgres|private-db|contact@example/);
  upstream.closeAllConnections(); await new Promise((fulfil) => upstream.close(fulfil)); upstream = undefined;
  const unavailable = await raw('/api/v1/account/session');
  assert.equal(unavailable.status, 502);
  assert.doesNotMatch(unavailable.body, /ECONNREFUSED|127\.0\.0\.1|stack/);
});

test('permits preflight only for a public route and an allowed method', async () => {
  const headers = { Origin: 'https://archive.example.test', 'Access-Control-Request-Method': 'PUT' };
  const valid = await raw('/api/v1/account/shelf', { method: 'OPTIONS', headers });
  assert.equal(valid.status, 204);
  assert.equal(valid.headers['access-control-allow-methods'], 'GET,PUT,OPTIONS');
  assert.equal((await raw('/api/v1/sources', { method: 'OPTIONS', headers })).status, 404);
  assert.equal((await raw('/api/v1/account/shelf', { method: 'OPTIONS', headers: { ...headers, 'Access-Control-Request-Method': 'PATCH' } })).status, 404);
  assert.equal(received.length, 1);
});

test('accepts only fixed internal upstream origins and an explicit prefix', () => {
  for (const API_ORIGIN of ['https://api:4310', 'http://api.example.test:4310', 'http://169.254.169.254', 'http://api:4310/private', 'http://user:password@api:4310', 'http://api:4310?url=evil', 'http://api:0']) assert.throws(() => loadConfig({ API_ORIGIN }));
  for (const PUBLIC_PATH_PREFIX of ['/', '//war-archive-api', '/war-archive-api/other', '/..', '/war-archive-api?admin']) assert.throws(() => loadConfig({ PUBLIC_PATH_PREFIX }));
  assert.equal(loadConfig({}).apiOrigin, 'http://api:4310');
});
