export function externalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return undefined;
    return parsed.href;
  } catch { return undefined; }
}

export function routeId(id: string): string {
  return encodeURIComponent(id);
}

export function citationFragment(url: string, page?: string, timecode?: string): string | undefined {
  const safe = externalUrl(url);
  if (!safe) return undefined;
  const parsed = new URL(safe);
  if (page && /^\d+$/.test(page)) parsed.hash = `page=${page}`;
  if (timecode && /^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(timecode)) {
    const seconds = timecode.split(':').reduce((n, part) => n * 60 + Number(part), 0);
    parsed.hash = `t=${seconds}`;
  }
  return parsed.href;
}
