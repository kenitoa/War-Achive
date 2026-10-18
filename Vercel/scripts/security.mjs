export function configuredOrigin() {
  const raw = process.env.NEXT_PUBLIC_API_ORIGIN?.trim();
  if (!raw) return undefined;
  const url = new URL(raw);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('NEXT_PUBLIC_API_ORIGIN은 HTTPS origin이어야 합니다. 개발 환경의 localhost HTTP만 예외입니다.');
  return url.origin;
}
