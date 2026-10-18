export const PUBLIC_API_PATHS = Object.freeze([
  '/api/v1/accounts',
  '/api/v1/account',
  '/api/v1/account/session',
  '/api/v1/account/shelf',
  '/api/v1/account/reset',
  '/api/v1/requests',
]);

export function gatewayBaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('NAS_PUBLIC_GATEWAY_URL이 필요합니다.');
  const url = new URL(value.trim());
  const prefix = url.pathname.replace(/\/$/, '');
  if (url.protocol !== 'https:' || url.username || url.password || !['', '/war-archive-api'].includes(prefix) || url.search || url.hash || url.port) throw new Error('NAS 공개 게이트웨이는 인증 정보·포트 없는 HTTPS 주소여야 합니다. 경로는 /war-archive-api prefix만 허용합니다.');
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || /^\d+(?:\.\d+){3}$/.test(url.hostname)) throw new Error('NAS 공개 게이트웨이는 공개 HTTPS 호스트 이름이어야 합니다.');
  return `${url.origin}${prefix}`;
}

export function gatewayRewrites(value) {
  const base = gatewayBaseUrl(value);
  return PUBLIC_API_PATHS.map(source => ({ source, destination: `${base}${source}` }));
}

export function verifyGatewayRewrites(rewrites) {
  if (!Array.isArray(rewrites)) throw new Error('Vercel rewrites 설정이 올바르지 않습니다.');
  const api = rewrites.filter(entry => typeof entry?.source === 'string' && /^\/api(?:\/|$)/.test(entry.source));
  if (api.length === 0) return undefined;
  if (api.length !== PUBLIC_API_PATHS.length) throw new Error('공개 API는 명시적으로 허용한 여섯 경로만 프록시해야 합니다.');
  let base;
  const found = new Set();
  for (const entry of api) {
    if (!PUBLIC_API_PATHS.includes(entry.source) || found.has(entry.source)) throw new Error('공개 API 프록시에 미허용 또는 중복 경로가 있습니다.');
    found.add(entry.source);
    const destination = new URL(entry.destination);
    if (!destination.pathname.endsWith(entry.source) || destination.search || destination.hash || destination.username || destination.password) throw new Error('공개 API 프록시의 목적지 경로가 일치하지 않습니다.');
    const target = gatewayBaseUrl(`${destination.origin}${destination.pathname.slice(0, -entry.source.length)}`);
    if (base && target !== base) throw new Error('공개 API 프록시는 하나의 검증된 NAS 게이트웨이를 사용해야 합니다.');
    base = target;
  }
  return base;
}
