import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const routes = new Map([
  ['/api/v1/accounts', ['POST']],
  ['/api/v1/account/session', ['GET', 'POST', 'DELETE']],
  ['/api/v1/account/shelf', ['GET', 'PUT']],
  ['/api/v1/account/reset', ['POST']],
  ['/api/v1/account', ['DELETE']],
  ['/api/v1/requests', ['POST']],
]);
const maxBodyBytes = 1024 * 1024;
const forwardedRequestHeaders = ['origin', 'x-csrf-token', 'content-type', 'accept', 'user-agent'];
const forwardedResponseHeaders = ['content-type', 'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-headers', 'vary', 'retry-after'];

export function loadConfig(environment = process.env) {
  const apiOrigin = environment.API_ORIGIN || 'http://api:4310';
  let upstream;
  try { upstream = new URL(apiOrigin); } catch { throw new Error('API_ORIGIN must be an internal HTTP origin.'); }
  if (upstream.protocol !== 'http:' || !['api', 'localhost', '127.0.0.1', '[::1]'].includes(upstream.hostname) || upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash || upstream.port === '0') throw new Error('API_ORIGIN must be an internal HTTP origin.');
  const publicPathPrefix = environment.PUBLIC_PATH_PREFIX ?? '/war-archive-api';
  if (!/^\/[a-z0-9][a-z0-9-]*$/.test(publicPathPrefix)) throw new Error('PUBLIC_PATH_PREFIX must be one explicit path segment.');
  const port = Number(environment.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return { apiOrigin: upstream.origin, publicPathPrefix, port };
}

function normalizedPath(raw, prefix) {
  // These APIs use no encoded path parameters or queries. Reject ambiguities before URL normalization.
  if (typeof raw !== 'string' || !raw.startsWith('/') || /[%\\?#\x00-\x20\x7f]/.test(raw) || raw.includes('//') || raw.split('/').some((part) => part === '.' || part === '..')) return undefined;
  return raw.startsWith(`${prefix}/`) ? raw.slice(prefix.length) : raw;
}

function memberCookie(value) {
  if (typeof value !== 'string' || value.length > 8192) return undefined;
  const cookies = value.split(';').map((part) => part.trim()).filter((part) => part.startsWith('wa_member='));
  return cookies.length === 1 && /^wa_member=[A-Za-z0-9._~%-]{1,1024}$/.test(cookies[0]) ? cookies[0] : undefined;
}

function errorResponse(response, status, code, message) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...(status === 413 ? { Connection: 'close' } : {}) });
  response.end(JSON.stringify({ data: null, error: { code, message } }));
}

function readBody(request) {
  return new Promise((fulfil, reject) => {
    const chunks = [];
    let length = 0;
    const cleanup = () => { request.off('data', onData); request.off('end', onEnd); request.off('error', onError); request.off('aborted', onAborted); };
    const fail = (code) => { cleanup(); request.resume(); reject(Object.assign(new Error(code), { code })); };
    const onData = (chunk) => { length += chunk.length; if (length > maxBodyBytes) fail('BODY_TOO_LARGE'); else chunks.push(chunk); };
    const onEnd = () => { cleanup(); fulfil(Buffer.concat(chunks)); };
    const onError = () => fail('REQUEST_INVALID');
    const onAborted = () => fail('REQUEST_INVALID');
    request.on('data', onData); request.on('end', onEnd); request.on('error', onError); request.on('aborted', onAborted);
  });
}

async function boundedResponse(response) {
  const chunks = [];
  let length = 0;
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2 * maxBodyBytes) { await reader.cancel(); throw new Error('UPSTREAM_TOO_LARGE'); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

export function createGateway(config = loadConfig()) {
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    const path = normalizedPath(request.url, config.publicPathPrefix);
    const allowed = path && routes.get(path);
    const health = path === '/healthz' && request.method === 'GET';
    const preflightMethod = request.headers['access-control-request-method'];
    const preflight = request.method === 'OPTIONS' && typeof preflightMethod === 'string' && allowed?.includes(preflightMethod) && typeof request.headers.origin === 'string';
    if (!health && (!allowed || (!allowed.includes(request.method ?? '') && !preflight))) { request.resume(); return errorResponse(response, 404, 'PUBLIC_ROUTE_NOT_FOUND', 'The requested public API route is unavailable.'); }
    if (request.headers['content-encoding'] && request.headers['content-encoding'] !== 'identity') { request.resume(); return errorResponse(response, 415, 'CONTENT_ENCODING_UNSUPPORTED', 'Compressed request bodies are unavailable.'); }
    const announcedLength = Number(request.headers['content-length'] ?? 0);
    if (!Number.isSafeInteger(announcedLength) || announcedLength < 0 || announcedLength > maxBodyBytes) { request.resume(); return errorResponse(response, 413, 'BODY_TOO_LARGE', 'The request body exceeds 1 MiB.'); }
    try {
      const body = await readBody(request);
      if ((health || request.method === 'GET' || preflight) && body.length) return errorResponse(response, 400, 'REQUEST_INVALID', 'This request must not contain a body.');
      if (body.length && !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(String(request.headers['content-type'] ?? ''))) return errorResponse(response, 415, 'CONTENT_TYPE_UNSUPPORTED', 'Use application/json for request bodies.');
      const headers = new Headers();
      if (!health) {
        for (const name of forwardedRequestHeaders) { const value = request.headers[name]; if (typeof value === 'string') headers.set(name, value); }
        const cookie = memberCookie(request.headers.cookie);
        if (cookie) headers.set('cookie', cookie);
        if (preflight) headers.set('access-control-request-method', preflightMethod);
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      timer.unref();
      const stop = () => { if (!response.writableFinished) controller.abort(); };
      response.once('close', stop);
      try {
        const upstream = await fetch(`${config.apiOrigin}${path}`, { method: request.method, headers, redirect: 'error', signal: controller.signal, ...(body.length ? { body } : {}) });
        if (health) {
          const status = upstream.ok ? 200 : 503;
          await upstream.body?.cancel();
          response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          response.end(JSON.stringify({ status: status === 200 ? 'ok' : 'unavailable' }));
          return;
        }
        if (upstream.status >= 500 || upstream.status < 200 || upstream.status >= 300 && upstream.status < 400) { await upstream.body?.cancel(); return errorResponse(response, 502, 'PUBLIC_API_UNAVAILABLE', 'The public API is temporarily unavailable.'); }
        const content = await boundedResponse(upstream);
        for (const name of forwardedResponseHeaders) { const value = upstream.headers.get(name); if (value) response.setHeader(name, value); }
        if (preflight) response.setHeader('Access-Control-Allow-Methods', [...allowed, 'OPTIONS'].join(','));
        // Same-origin Vercel rewrites expose /api/v1 to browsers. Preserve backend cookie Path=/api/v1.
        const cookies = upstream.headers.getSetCookie().filter((cookie) => /^wa_member=/.test(cookie));
        if (cookies.length) response.setHeader('Set-Cookie', cookies);
        response.writeHead(upstream.status);
        response.end(content);
      } finally { clearTimeout(timer); response.off('close', stop); }
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      if (error?.code === 'BODY_TOO_LARGE') return errorResponse(response, 413, 'BODY_TOO_LARGE', 'The request body exceeds 1 MiB.');
      errorResponse(response, 502, 'PUBLIC_API_UNAVAILABLE', 'The public API is temporarily unavailable.');
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 64;
  server.maxRequestsPerSocket = 100;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  const server = createGateway(config);
  server.listen(config.port, '0.0.0.0', () => console.log(JSON.stringify({ service: 'war-archive-public-gateway', operation: 'listening', port: config.port })));
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => server.closeAllConnections(), 5_000).unref(); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
