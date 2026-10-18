import type { PublicArchive, PublicRecord } from './generated-contract';

export interface SearchFilters {
  q: string; war: string; kind: string; language: string; rights: string; from: string; to: string; sort: string; page: number;
}
export const defaultFilters: SearchFilters = { q: '', war: '', kind: '', language: '', rights: '', from: '', to: '', sort: 'updated', page: 1 };
export const PAGE_SIZE = 12;

export function parseFilters(params: URLSearchParams): SearchFilters {
  const get = (key: string): string => (params.get(key) ?? '').slice(0, 300).trim();
  const year = (key: string): string => /^\d{1,4}$/.test(get(key)) ? get(key) : '';
  return {
    q: get('q'), war: get('war'), kind: get('type'), language: get('language'),
    rights: ['download', 'reuse', 'link'].includes(get('rights')) ? get('rights') : '',
    from: year('from'), to: year('to'),
    sort: ['updated', 'oldest', 'newest', 'title'].includes(get('sort')) ? get('sort') : 'updated',
    page: Math.min(100000, Math.max(1, Number.parseInt(get('page'), 10) || 1)),
  };
}

export function filtersToParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  const entries = { ...filters, type: filters.kind, kind: undefined };
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== '' && !(key === 'page' && value === 1) && !(key === 'sort' && value === 'updated')) params.set(key, String(value));
  }
  return params;
}

const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/[·ㆍ・]/g, '').replace(/\s+/g, ' ');
function recordYear(record: PublicRecord, end = false): number | undefined {
  const value = end ? record.dates.end ?? record.dates.start : record.dates.start;
  if (!value || !/^\d{1,4}(?:-|$)/.test(value)) return undefined;
  return Number.parseInt(value, 10);
}

export function searchArchive(data: PublicArchive, filters: SearchFilters): PublicRecord[] {
  const terms = normalize(filters.q).split(' ').filter(Boolean);
  const associatedWars = data.wars.filter(war => terms.some(term => normalize([war.name, ...war.aliases].join(' ')).includes(term)));
  const records = data.records.filter(record => {
    if (filters.war && !record.warIds.includes(filters.war)) return false;
    if (filters.kind && record.kind !== filters.kind) return false;
    if (filters.language && record.language !== filters.language) return false;
    if (filters.rights === 'download' && !record.rights.downloadAllowed) return false;
    if (filters.rights === 'reuse' && !record.rights.reuseAllowed) return false;
    if (filters.rights === 'link' && record.media.originalUrl) return false;
    const start = recordYear(record);
    const end = recordYear(record, true);
    if (filters.from && (end === undefined || end < Number(filters.from))) return false;
    if (filters.to && (start === undefined || start > Number(filters.to))) return false;
    const wars = data.wars.filter(war => record.warIds.includes(war.id));
    const entities = data.entities.filter(entity => record.entityIds.includes(entity.id));
    const haystack = normalize([record.title, record.originalTitle, record.summary, record.source.name, record.source.identifier, ...record.topics, record.transcript, record.translation, ...wars.flatMap(war => [war.name, ...war.aliases]), ...entities.map(entity => entity.name)].filter(Boolean).join(' '));
    return terms.every(term => haystack.includes(term) || associatedWars.some(war => record.warIds.includes(war.id) && normalize([war.name, ...war.aliases].join(' ')).includes(term)));
  });
  return records.sort((a, b) => {
    if (filters.sort === 'title') return a.title.localeCompare(b.title, 'ko');
    if (filters.sort === 'oldest' || filters.sort === 'newest') {
      const aYear = recordYear(a);
      const bYear = recordYear(b);
      if (aYear === undefined) return bYear === undefined ? a.id.localeCompare(b.id) : 1;
      if (bYear === undefined) return -1;
      return (aYear - bYear) * (filters.sort === 'newest' ? -1 : 1) || a.id.localeCompare(b.id);
    }
    return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
  });
}

export function searchExcerpt(record: PublicRecord, q: string): string | undefined {
  const first = q.trim().split(/\s+/)[0];
  if (!first) return undefined;
  for (const text of [record.transcript, record.translation, record.summary]) {
    const index = text?.toLocaleLowerCase().indexOf(first.toLocaleLowerCase()) ?? -1;
    if (text && index >= 0) return `${index > 50 ? '…' : ''}${text.slice(Math.max(0, index - 50), index + 160)}${index + 160 < text.length ? '…' : ''}`;
  }
  return undefined;
}
