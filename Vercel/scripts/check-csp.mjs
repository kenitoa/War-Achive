import fs from 'node:fs';
import { configuredOrigin } from './security.mjs';
const origin = configuredOrigin();
const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const policy = config.headers.find(entry => entry.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
const directive = policy.split(';').find(part => part.trim().startsWith('connect-src'))?.trim().split(/\s+/).slice(1) ?? [];
if (origin && !directive.includes(origin)) throw new Error('선택적 API의 CSP가 설정되지 않았습니다. 같은 환경 변수로 npm run configure:security를 실행한 뒤 배포를 시작하세요.');
if (directive.includes('https:') || directive.includes('*')) throw new Error('CSP connect-src는 명시적인 origin만 허용해야 합니다.');
console.log('공개 설정과 API 연결 CSP 검사 통과');
