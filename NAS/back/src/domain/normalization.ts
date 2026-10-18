import { PublicRecordSchema, type PublicRecord } from './contracts.js';
import type { RawItem, Source } from './models.js';
import { createHash } from 'node:crypto';

export const recordId = (sourceId: string, identifier: string): string => `rec-${createHash('sha256').update(`${sourceId}:${identifier}`).digest('hex').slice(0, 24)}`;
export function historicalDate(value: string): PublicRecord['dates'] {
  const display = value.trim().slice(0, 200) || '날짜 미상';
  if (/^\d{4}-\d{2}-\d{2}$/.test(display) && !Number.isNaN(Date.parse(display)) && new Date(display).toISOString().slice(0,10)===display) return { display, start: display, precision: 'exact' };
  if (/^\d{4}$/.test(display)) return { display, start: display, precision: 'year' };
  const range = /^(\d{4})\s*[-–/]\s*(\d{4})$/.exec(display); if (range) return { display, start: range[1], end: range[2], precision: 'range' };
  const circa = /(?:circa|ca\.|around|약|경)\s*(\d{4})|(\d{4})\s*(?:년\s*)?(?:경|circa)/i.exec(display); if (circa) return { display, start: circa[1] ?? circa[2], precision: 'circa' };
  return { display, precision: 'unknown' };
}
export function normalizeItem(source: Source, item: RawItem, at: string, revision = 1): PublicRecord {
  return PublicRecordSchema.parse({ id: recordId(source.id, item.identifier), title: item.title || '제목 미상', originalTitle: item.title || undefined, summary: item.description || '원 소장처의 자료 정보와 이용 조건을 확인할 수 있는 기록입니다.', kind: item.kind, language: item.language || 'und', source: { name: source.name, url: item.url, identifier: item.identifier, accessedAt: at }, dates: historicalDate(item.date), warIds: source.warIds, entityIds: [], topics: item.topics.slice(0, 30), rights: { label: source.policy.rightsLabel, url: source.policy.rightsUrl, downloadAllowed: false, reuseAllowed: false }, review: { provenance: source.policy.status === 'approved' ? 'checked' : 'unverified', content: 'source-description', translation: 'none' }, media: { displayAllowed:Boolean(item.thumbnailUrl&&item.attribution),...(item.thumbnailUrl&&item.attribution ? { thumbnailUrl: item.thumbnailUrl,attribution:item.attribution } : {}) }, citations: [{ label: `${source.name} 원 소장처`, url: item.url }], revision, updatedAt: at, sensitivity: item.sensitive ? 'warning' : 'none', location:item.location,changes: [{ at, summary: revision === 1 ? '원 소장처 메타데이터 수집' : '원 소장처 자료 변경 반영' }] });
}
export function canAutoPublish(source: Source, record: PublicRecord): boolean { return source.policy.status === 'approved' && source.policy.allowAutoPublish && source.policy.metadataOnly && Boolean(source.policy.reviewedAt && source.policy.reviewedBy) && record.sensitivity === 'none' && record.review.content === 'source-description' && record.review.translation === 'none' && record.review.provenance === 'checked'; }
