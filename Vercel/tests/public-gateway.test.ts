import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PUBLIC_API_PATHS, gatewayBaseUrl, gatewayRewrites, verifyGatewayRewrites } from '../scripts/public-gateway.mjs';

test('public gateway exposes only explicit account, shelf and request routes', () => {
  const origin = 'https://nas-archive.example.org';
  const rewrites = gatewayRewrites(origin);
  assert.equal(verifyGatewayRewrites(rewrites), origin);
  assert.deepEqual(rewrites.map(entry => entry.source), PUBLIC_API_PATHS);
  for (const denied of ['/api/v1/session', '/api/v1/sources', '/api/v1/records', '/admin', '/api/v1/account/:path*']) {
    assert.equal(rewrites.some(entry => entry.source === denied), false);
  }
  for (const invalid of [
    [...rewrites, { source: '/api/v1/:path*', destination: `${origin}/api/v1/:path*` }],
    rewrites.slice(1),
    rewrites.map((entry, index) => index === 0 ? { ...entry, destination: `${origin}/admin` } : entry),
    rewrites.map((entry, index) => index === 0 ? { ...entry, destination: `https://other.example.org${entry.source}` } : entry),
  ]) assert.throws(() => verifyGatewayRewrites(invalid));
});

test('gateway origin rejects credentials, local IPs, insecure transport and URL suffixes', () => {
  for (const invalid of ['', 'http://nas.example.org', 'https://user:pass@nas.example.org', 'https://127.0.0.1', 'https://192.168.50.209', 'https://localhost', 'https://nas.example.org:9443', 'https://nas.example.org/api', 'https://nas.example.org?token=x', 'https://nas.example.org/#x', 'https://nas.example.org/war-archive-api/other']) assert.throws(() => gatewayBaseUrl(invalid));
  assert.equal(gatewayBaseUrl('https://nas.example.org/'), 'https://nas.example.org');
  assert.equal(gatewayBaseUrl('https://nas.example.org/war-archive-api/'), 'https://nas.example.org/war-archive-api');
  assert.equal(verifyGatewayRewrites(gatewayRewrites('https://nas.example.org/war-archive-api')), 'https://nas.example.org/war-archive-api');
});

test('gateway configuration preserves static routes and forbids cached account responses', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'war-archive-gateway-'));
  const configPath = path.join(directory, 'vercel.json');
  const environment = { ...process.env, NEXT_PUBLIC_API_ORIGIN: 'https://archive.example.org', NAS_PUBLIC_GATEWAY_URL: 'https://nas.example.org/war-archive-api' };
  fs.writeFileSync(configPath, JSON.stringify({
    framework: 'nextjs',
    rewrites: [{ source: '/legacy', destination: '/about/' }],
    headers: [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'; connect-src 'self'; frame-ancestors 'none'" }] }],
  }));
  try {
    execFileSync(process.execPath, [path.resolve('scripts/configure-gateway.mjs')], { cwd: directory, env: environment, stdio: 'pipe' });
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as {
      rewrites: { source: string; destination: string }[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    assert.equal(config.rewrites.find(entry => entry.source === '/legacy')?.destination, '/about/');
    assert.equal(verifyGatewayRewrites(config.rewrites), 'https://nas.example.org/war-archive-api');
    const csp = config.headers[0].headers[0].value;
    assert.match(csp, /connect-src 'self' https:\/\/archive\.example\.org;/);
    assert.doesNotMatch(csp, /connect-src[^;]*https:;/);
    execFileSync(process.execPath, [path.resolve('scripts/check-csp.mjs')], { cwd: directory, env: environment, stdio: 'pipe' });
    config.headers = config.headers.filter(entry => entry.source !== '/api/v1/(.*)');
    fs.writeFileSync(configPath, JSON.stringify(config));
    assert.throws(() => execFileSync(process.execPath, [path.resolve('scripts/check-csp.mjs')], { cwd: directory, env: environment, stdio: 'pipe' }));
  } finally {
    fs.unlinkSync(configPath);
    fs.rmdirSync(directory);
  }
});
