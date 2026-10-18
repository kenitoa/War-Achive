import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { CollectionPage, RawItem, Source } from '../domain/models.js';
import { ArchiveError } from '../domain/models.js';

const allowedHosts = new Set(['www.loc.gov', 'commons.wikimedia.org', 'upload.wikimedia.org', 'api.github.com']);
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) { const n = address.split('.').map(Number); return !(n[0] === 0 || n[0] === 10 || n[0] === 127 || (n[0] === 169 && n[1] === 254) || (n[0] === 172 && n[1]! >= 16 && n[1]! <= 31) || (n[0] === 192 && n[1] === 168) || (n[0] === 100 && n[1]! >= 64 && n[1]! <= 127) || n[0]! >= 224); }
  if (isIP(address) === 6) return !(/^(::|fc|fd|fe[89ab]|ff)/i.test(address));
  return false;
}
export interface SafeFetchOptions { fetcher?: typeof fetch; skipDnsCheckForTests?: boolean; maxBytes?: number; token?: string }
export async function safeFetchJson(url: string, options: SafeFetchOptions = {}): Promise<unknown> {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname) || target.username || target.password || (target.port && target.port !== '443')) throw new ArchiveError('SOURCE_URL_BLOCKED', '수집 대상 주소가 허용되지 않았습니다.');
  if (!options.skipDnsCheckForTests) { const addresses = await lookup(target.hostname, { all: true }); if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new ArchiveError('SOURCE_URL_BLOCKED', '수집 대상 네트워크가 허용되지 않았습니다.'); }
  const response = await (options.fetcher ?? fetch)(target, { redirect: 'manual', signal: AbortSignal.timeout(25_000), headers: { 'User-Agent': 'WarArchive/1.0 (archival metadata collector)', Accept: 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) } });
  if (!response.ok) throw new ArchiveError(`SOURCE_HTTP_${response.status}`, `외부 서비스 응답 오류 (${response.status})`, 502);
  if (!response.body) throw new ArchiveError('EMPTY_RESPONSE', '외부 서비스가 빈 응답을 반환했습니다.', 502);
  const limit = options.maxBytes ?? 12_000_000;
  if (Number(response.headers.get('content-length') ?? 0) > limit) throw new ArchiveError('SOURCE_TOO_LARGE', '외부 응답이 크기 제한을 초과했습니다.', 502);
  const reader = response.body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength; if (length > limit) { await reader.cancel(); throw new ArchiveError('SOURCE_TOO_LARGE', '외부 응답이 크기 제한을 초과했습니다.', 502); } chunks.push(value); } } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { throw new ArchiveError('SOURCE_INVALID_JSON', '외부 서비스 JSON 형식이 올바르지 않습니다.', 502); }
}
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export function plainText(value: unknown, max = 6000): string { return (typeof value === 'string' ? value : '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, max); }
const strings = (value: unknown): string[] => array(value).filter((v): v is string => typeof v === 'string').map((v) => plainText(v, 200)).filter(Boolean);
const httpUrl = (value: unknown): string | undefined => { try { const u = new URL(String(value)); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; } };
export async function collectPage(source: Source, page: number, options: SafeFetchOptions = {},knownIdentifiers?:string[]): Promise<CollectionPage> {
  const pageSize=source.checkpoint.pageSize;
  if (source.provider === 'loc') {
    if(knownIdentifiers){const items:RawItem[]=[];for(const identifier of knownIdentifiers){const url=new URL(identifier);if(url.hostname!=='www.loc.gov'||!url.pathname.startsWith('/item/'))throw new ArchiveError('SOURCE_URL_BLOCKED','재확인할 원문 주소가 허용되지 않았습니다.');url.searchParams.set('fo','json');try{const raw=object(await safeFetchJson(url.href,options));const item=object(raw.item);if(!Object.keys(item).length)continue;const envelope={results:[{...item,id:identifier}],pagination:{current:1,total:1}};items.push(...parseLoc(envelope));}catch(error){if(!(error instanceof ArchiveError&&error.code==='SOURCE_HTTP_404'))throw error;}}return{items,hasMore:false,page};}
    const url = new URL('https://www.loc.gov/search/'); url.search = new URLSearchParams({ fo: 'json', q: source.query, c: String(pageSize), sp: String(page), at: 'results,pagination' }).toString();
    const raw = object(await safeFetchJson(url.href, options)); if (!Array.isArray(raw.results)) throw new ArchiveError('SOURCE_SCHEMA_CHANGED', '자료 목록 형식이 변경되었습니다.', 502);
    const items = parseLoc(raw);
    const pagination = object(raw.pagination); return { items, hasMore: Number(pagination.current ?? page) < Number(pagination.total ?? page), page };
  }
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: source.query, gsrnamespace: '6', gsrlimit: String(pageSize), gsroffset: String((page - 1) * pageSize), prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '640' }).toString();
  if(knownIdentifiers){if(knownIdentifiers.some(id=>!/^\d+$/.test(id)))throw new ArchiveError('SOURCE_ID_INVALID','재확인할 원문 식별자가 잘못되었습니다.');url.search=new URLSearchParams({action:'query',format:'json',pageids:knownIdentifiers.join('|'),prop:'imageinfo',iiprop:'url|extmetadata',iiurlwidth:'640'}).toString();}
  const raw = object(await safeFetchJson(url.href, options)); if (raw.error) throw new ArchiveError('SOURCE_API_ERROR', '외부 자료 검색이 실패했습니다.', 502);
  const query = object(raw.query); if (!query.pages && Object.keys(query).length) throw new ArchiveError('SOURCE_SCHEMA_CHANGED', '자료 목록 형식이 변경되었습니다.', 502);
  const items = Object.values(object(query.pages)).flatMap((value): RawItem[] => {
    const r = object(value), info = object(array(r.imageinfo)[0]), metadata = object(info.extmetadata);
    const field = (key: string): string => plainText(object(metadata[key]).value);
    const link = httpUrl(info.descriptionurl); if (!link || new URL(link).hostname !== 'commons.wikimedia.org') return [];
    const license = field('LicenseShortName'),licenseUrl=httpUrl(field('LicenseUrl'));
    const knownReusable = /^(CC0|Public domain|PD|CC BY(?:-SA)?(?: [\d.]+)?)$/i.test(license);
    const thumb = httpUrl(info.thumburl),creator=field('Artist'),credit=field('Credit');
    const latitude=field('GPSLatitude'),longitude=field('GPSLongitude');
    const lat=/^-?\d+(\.\d+)?$/.test(latitude)?Number(latitude):NaN,lon=/^-?\d+(\.\d+)?$/.test(longitude)?Number(longitude):NaN;
    const location=Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{name:'원 소장처 자료 지오태그',lat,lon,precision:'approximate' as const}:undefined;
    const attribution=knownReusable&&licenseUrl&&creator?{creator,credit,license,licenseUrl}:undefined;
    return [{ identifier: String(r.pageid ?? r.title), url: link, title: plainText(r.title, 1000).replace(/^File:/, '') || '제목 미상', description: field('ImageDescription').slice(0, 6000), date: field('DateTimeOriginal') || field('DateTime'), language: 'und', kind: /\.pdf$/i.test(String(r.title)) ? 'document' : /\.(webm|ogv)$/i.test(String(r.title)) ? 'video' : /\.(ogg|wav|mp3)$/i.test(String(r.title)) ? 'audio' : 'photograph', topics: field('Categories').split('|').map((s) => s.trim()).filter(Boolean).slice(0, 30), ...(attribution && thumb && new URL(thumb).hostname === 'upload.wikimedia.org' ? { thumbnailUrl: thumb,attribution } : {}),location, license, licenseUrl, sensitive: /(?:nudity|sexual violence|corpse|dead bodies|graphic violence)/i.test(field('Categories')), raw: value }];
  });
  return { items, hasMore: Boolean(raw.continue), page };
}
function parseLoc(raw:Record<string,unknown>):RawItem[]{return array(raw.results).flatMap((value):RawItem[]=>{const r=object(value),link=httpUrl(r.id??r.url);if(!link||new URL(link).hostname!=='www.loc.gov')return[];const format=strings(r.original_format).join(' ');return[{identifier:String(r.id??link),url:link,title:plainText(r.title,1000)||'제목 미상',description:strings(r.description).join(' ').slice(0,6000),date:plainText(r.date,100),language:strings(r.language).join(', ')||'und',kind:/photo|image/.test(format)?'photograph':/map/.test(format)?'map':/film|video/.test(format)?'video':/sound|audio/.test(format)?'audio':/newspaper/.test(format)?'newspaper':'document',topics:strings(r.subject).slice(0,30),raw:value}];});}
