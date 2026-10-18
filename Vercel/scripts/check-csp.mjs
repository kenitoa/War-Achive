import fs from 'node:fs';
import { configuredOrigin } from './security.mjs';
import { verifyGatewayRewrites } from './public-gateway.mjs';
const origin = configuredOrigin();
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const policy = config.headers.find(entry => entry.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
const directive = policy.split(';').find(part => part.trim().startsWith('connect-src'))?.trim().split(/\s+/).slice(1) ?? [];
if (origin && !directive.includes(origin)) throw new Error('선택적 API의 CSP가 설정되지 않았습니다. 같은 환경 변수로 npm run configure:security를 실행한 뒤 배포를 시작하세요.');
if (directive.includes('https:') || directive.includes('*')) throw new Error('CSP connect-src는 명시적인 origin만 허용해야 합니다.');
const gateway = verifyGatewayRewrites(config.rewrites ?? []);
if (gateway) {
  if (!origin || !origin.startsWith('https://') || origin === new URL(gateway).origin) throw new Error('NAS 프록시에는 공개 사이트의 HTTPS NEXT_PUBLIC_API_ORIGIN이 필요합니다.');
  const apiHeaders = config.headers.find(entry => entry.source === '/api/v1/(.*)')?.headers ?? [];
  for (const key of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) {
    if (!apiHeaders.some(header => header.key.toLowerCase() === key.toLowerCase() && header.value.includes('no-store'))) throw new Error('계정·접수 응답은 브라우저와 CDN에 캐시하면 안 됩니다.');
  }
}
console.log('공개 설정과 API 연결 CSP 검사 통과');
