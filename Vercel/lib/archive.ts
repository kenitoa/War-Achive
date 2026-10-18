import fs from 'node:fs';
import path from 'node:path';
import { PublicArchiveSchema, type PublicArchive } from './generated-contract';

let cached: PublicArchive | undefined;

export function publicParams(records: { id: string }[]): { id: string }[] {
  // Next.js static export requires a path even for an empty published collection.
  // This sentinel always returns notFound; it is never a fabricated archive record.
  return records.length ? records.map(record => ({ id: record.id })) : [{ id: 'unpublished' }];
}

export function archive(): PublicArchive {
  if (cached) return cached;
  const filename = path.join(process.cwd(), 'content', 'archive.json');
  if (!fs.existsSync(filename)) {
    return {
      schemaVersion: 1, releaseId: 'unpublished', generatedAt: '1970-01-01T00:00:00.000Z',
      records: [], wars: [], entities: [], collections: [],
      coverage: { sources: 0, records: 0, lastCollectedAt: null, limitations: ['아직 승인된 공개본이 없습니다.'] },
    };
  }
  cached = validateArchive(JSON.parse(fs.readFileSync(filename, 'utf8')));
  return cached;
}

export function validateArchive(value: unknown): PublicArchive {
  const parsed = PublicArchiveSchema.parse(value);
  if (parsed.claims?.some(claim => !claim.public)) throw new Error('비공개 주장이 공개본에 포함되어 있습니다.');
  const groups = [parsed.records, parsed.wars, parsed.entities, parsed.collections];
  for (const group of groups) {
    const ids = new Set<string>();
    for (const item of group) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(item.id)) throw new Error('공개 자료 ID에 안전하지 않은 경로 문자가 있습니다.');
      if (ids.has(item.id)) throw new Error(`공개 자료 ID 중복: ${item.id}`);
      ids.add(item.id);
    }
  }
  const recordIds = new Set(parsed.records.map(record => record.id));
  const warIds = new Set(parsed.wars.map(war => war.id));
  const entityIds = new Set(parsed.entities.map(entity => entity.id));
  for (const record of parsed.records) {
    if (record.warIds.some(id => !warIds.has(id)) || record.entityIds.some(id => !entityIds.has(id))) throw new Error(`자료에 공개되지 않은 연결 대상이 있습니다: ${record.id}`);
    if (record.media.displayAllowed && (!record.media.attribution || !record.media.thumbnailUrl)) throw new Error(`썸네일 공개의 귀속·파일 정보가 없습니다: ${record.id}`);
  }
  for (const entity of parsed.entities) {
    if (entity.warIds.some(id => !warIds.has(id))) throw new Error(`연결 기록에 공개되지 않은 전쟁이 있습니다: ${entity.id}`);
  }
  for (const collection of parsed.collections) {
    if (collection.recordIds.some(id => !recordIds.has(id))) throw new Error(`컬렉션에 공개되지 않은 자료가 있습니다: ${collection.id}`);
  }
  return parsed;
}
