import fs from 'node:fs';
import { configuredOrigin } from './security.mjs';

const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const csp = config.headers.find(entry => entry.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy');
const origin = configuredOrigin();
csp.value = csp.value.replace(/connect-src[^;]*/, `connect-src 'self'${origin ? ` ${origin}` : ''}`);
fs.writeFileSync('vercel.json', `${JSON.stringify(config, null, 2)}\n`);
console.log(origin ? '선택적 API의 정확한 origin을 CSP에 반영했습니다. 이 설정을 포함해 배포하세요.' : 'CSP를 동일 출처만 연결하는 기본값으로 설정했습니다.');
