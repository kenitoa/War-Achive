import fs from 'node:fs';
import { configuredOrigin } from './security.mjs';
import { gatewayRewrites, verifyGatewayRewrites } from './public-gateway.mjs';

const origin = configuredOrigin();
if (!origin || !origin.startsWith('https://')) throw new Error('NEXT_PUBLIC_API_ORIGIN을 공개 Vercel 사이트의 HTTPS origin으로 지정하세요.');
const rewrites = gatewayRewrites(process.env.NAS_PUBLIC_GATEWAY_URL);
if (new URL(rewrites[0].destination).origin === origin) throw new Error('NAS 게이트웨이와 공개 사이트는 서로 다른 origin이어야 합니다.');
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
config.rewrites = [...(config.rewrites ?? []).filter(entry => !/^\/api(?:\/|$)/.test(entry.source)), ...rewrites];
verifyGatewayRewrites(config.rewrites);
const general = config.headers.find(entry => entry.source === '/(.*)');
const csp = general?.headers.find(entry => entry.key === 'Content-Security-Policy');
if (!csp) throw new Error('기존 CSP 설정을 찾을 수 없습니다.');
csp.value = csp.value.replace(/connect-src[^;]*/, `connect-src 'self' ${origin}`);
const cacheSource = '/api/v1/(.*)';
config.headers = config.headers.filter(entry => entry.source !== cacheSource);
config.headers.push({ source: cacheSource, headers: [
  { key: 'Cache-Control', value: 'private, no-store' },
  { key: 'CDN-Cache-Control', value: 'no-store' },
  { key: 'Vercel-CDN-Cache-Control', value: 'no-store' },
] });
fs.writeFileSync('vercel.json', `${JSON.stringify(config, null, 2)}\n`);
console.log('공개 계정·서재·접수의 여섯 경로만 NAS 게이트웨이로 연결했습니다. 같은 NEXT_PUBLIC_API_ORIGIN으로 빌드·배포하세요.');
