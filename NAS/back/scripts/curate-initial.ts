import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { loadConfig, nasRoot } from '../src/config.js';
import { ArchiveRecordSchema } from '../src/domain/models.js';
import { PublicArchiveSchema, EntitySchema } from '../src/domain/contracts.js';
import { atomicJson } from '../src/infrastructure/files.js';

if (!process.argv.includes('--apply')) throw new Error('Use --apply to register actual source-linked collections, place references and supplied geotags. The NAS API must be running.');
const config = loadConfig(), base = `http://127.0.0.1:${config.ADMIN_PORT}/api/v1`;
const envelope = z.object({ data: z.unknown(), error: z.object({ code: z.string(), message: z.string() }).nullable() });
const login = await fetch(`${base}/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: config.WAR_ARCHIVE_ADMIN_TOKEN }), signal: AbortSignal.timeout(30000) });
const session = z.object({ data: z.object({ csrfToken: z.string() }) }).parse(await login.json());
const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
async function api(path: string, body?: unknown) {
  const response = await fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': session.data.csrfToken, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
  const result = envelope.parse(await response.json());
  if (!response.ok || result.error) throw new Error(`API ${path}: ${result.error?.code ?? response.status}`);
  return result.data;
}
const records = z.object({ items: z.array(ArchiveRecordSchema) }).parse(await api('/records?pageSize=200')).items;
let previews = 0;
for (const record of records.filter((r) => r.status === 'published' && r.public.media.thumbnailUrl && r.public.media.attribution && !r.public.media.displayAllowed)) {
  const attribution = record.public.media.attribution;
  if (!attribution || !/^(CC0|Public domain|PD|CC BY(?:-SA)?(?: [\d.]+)?)$/i.test(attribution.license) || new URL(record.public.media.thumbnailUrl!).hostname !== 'upload.wikimedia.org') continue;
  const response = await fetch(`${base}/records/${record.id}`, { method: 'PATCH', headers: { Cookie: cookie, 'X-CSRF-Token': session.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: record.public.revision, public: { media: { ...record.public.media, displayAllowed: true } } }), signal: AbortSignal.timeout(30000) });
  const edited = z.object({ data: ArchiveRecordSchema }).parse(await response.json()).data;
  await api(`/records/${record.id}/review`, { decision: 'approve', expectedRevision: edited.public.revision, note: '원 소장처에 명시된 CC/퍼블릭 도메인 표시, 제작자, 이용 조건 링크가 있는 미리보기만 표시합니다. 원본 다운로드나 재배포 권한을 확대하지 않았습니다.' });
  record.public = edited.public;
  previews++;
}
const originals = new Map<string, string>();
async function walk(directory: string) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await walk(path);
    else if (/^[a-f0-9]{64}\.json$/.test(item.name)) originals.set(item.name.slice(0, 64), path);
  }
}
await walk(resolve(config.dataDir, 'originals'));
const rawSchema = z.object({ imageinfo: z.array(z.object({ extmetadata: z.record(z.string(), z.object({ value: z.unknown() }).passthrough()) }).passthrough()).optional() }).passthrough();
let geotags = 0;
for (const record of records.filter((r) => r.status === 'published' && !r.public.location)) {
  const file = originals.get(record.rawHash); if (!file) continue;
  const raw = rawSchema.safeParse(JSON.parse(await readFile(file, 'utf8')) as unknown);
  if (!raw.success) continue;
  const metadata = raw.data.imageinfo?.[0]?.extmetadata;
  const latitude = Number(metadata?.GPSLatitude?.value), longitude = Number(metadata?.GPSLongitude?.value);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
  const response = await fetch(`${base}/records/${record.id}`, { method: 'PATCH', headers: { Cookie: cookie, 'X-CSRF-Token': session.data.csrfToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: record.public.revision, public: { location: { name: '원 소장처 제공 지오태그', lat: latitude, lon: longitude, precision: 'approximate' } } }), signal: AbortSignal.timeout(30000) });
  const edited = z.object({ data: ArchiveRecordSchema }).parse(await response.json()).data;
  await api(`/records/${record.id}/review`, { decision: 'approve', expectedRevision: edited.public.revision, note: '원 소장처의 구조화된 GPS 메타데이터를 관련 위치로 연결했습니다. 지오태그의 전사·좌표 범위만 확인했으며 역사적 전장이나 촬영 위치를 독립 현장 검증한 것은 아닙니다.' });
  geotags++;
}
for (const warId of ['korean-war', 'world-war-i', 'world-war-ii']) {
  const members = records.filter((r) => r.status === 'published' && r.public.warIds.includes(warId));
  if (!members.length) continue;
  const name = { 'korean-war': '한국전쟁', 'world-war-i': '제1차 세계대전', 'world-war-ii': '제2차 세계대전' }[warId];
  await api('/catalog/collection', { id: `${warId}-source-records`, title: `${name} · 원 소장처 기록`, summary: '수집 검색어와 원 소장처의 설명을 기준으로 연결한 공개 메타데이터 모음입니다. 당시 자료와 후대의 추모·재현 기록이 함께 포함될 수 있으며, 자료별 생산 시기와 맥락을 확인하세요.', recordIds: members.map((r) => r.id), topics: ['원 소장처 기록', '출처 확인', '기억과 기록'] });
}
let places = 0;
const entityDataSchema = z.object({ entities: z.record(z.string(), z.object({ labels: z.record(z.string(), z.object({ value: z.string() })), descriptions: z.record(z.string(), z.object({ value: z.string() })).optional(), claims: z.record(z.string(), z.array(z.object({ mainsnak: z.object({ datavalue: z.object({ value: z.unknown() }).optional() }).passthrough() }).passthrough())) }).passthrough()) });
for (const id of ['Q8684', 'Q16520']) {
  const response = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`, { headers: { 'User-Agent': 'WarArchive/1.0 (source-linked place metadata)' }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Wikidata ${id} HTTP ${response.status}`);
  const entity = entityDataSchema.parse(await response.json()).entities[id];
  if (!entity) continue;
  const coordinate = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).parse(entity.claims.P625?.[0]?.mainsnak.datavalue?.value);
  const name = entity.labels.ko?.value ?? entity.labels.en?.value ?? id;
  const data = EntitySchema.parse({ id: `wikidata-${id.toLowerCase()}`, name, type: 'place', summary: `${entity.descriptions?.ko?.value ?? entity.descriptions?.en?.value ?? name}. Wikidata의 장소 설명과 기준 좌표입니다. 이 좌표는 특정 전투나 개별 사진의 위치를 뜻하지 않습니다.`, warIds: [], sourceUrl: `https://www.wikidata.org/wiki/${id}`, location: { name, lat: coordinate.latitude, lon: coordinate.longitude, precision: 'region' } });
  await api('/catalog/entity', data); places++;
}
await api('/publications', { target: 'local' });
const snapshot = PublicArchiveSchema.parse(JSON.parse(await readFile(resolve(config.exportDir, 'archive.json'), 'utf8')) as unknown);
if (process.argv.includes('--export-web')) await atomicJson(resolve(nasRoot, '../Vercel/content/archive.json'), snapshot);
console.log(JSON.stringify({ operation: 'source-linked-curation', previews, geotags, collections: snapshot.collections.length, places, records: snapshot.records.length, releaseId: snapshot.releaseId }));
