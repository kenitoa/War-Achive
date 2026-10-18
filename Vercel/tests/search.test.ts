import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultFilters, filtersToParams, parseFilters, searchArchive } from '../lib/search';
import type { PublicArchive, PublicRecord } from '../lib/generated-contract';

const record = (id: string, dates: PublicRecord['dates'], extra: Partial<PublicRecord> = {}): PublicRecord => ({
  id, title: `Test ${id}`, summary: 'A test-only record', kind: 'document', language: 'en', source: { name: 'Test archive', url: 'https://example.org/source', identifier: id, accessedAt: '2026-10-18T00:00:00.000Z' }, dates, warIds: ['test-war'], entityIds: [], topics: [], rights: { label: 'Test', downloadAllowed: false, reuseAllowed: false }, review: { provenance: 'checked', content: 'source-description', translation: 'none' }, media: { displayAllowed: false }, citations: [], revision: 1, updatedAt: '2026-10-18T00:00:00.000Z', sensitivity: 'none', ...extra,
});
const data: PublicArchive = { schemaVersion: 1, releaseId: 'test-only', generatedAt: '2026-10-18T00:00:00.000Z', records: [record('old', { display: '1950–1953', start: '1950', end: '1953', precision: 'range' }), record('unknown', { display: 'Unknown', precision: 'unknown' }), record('new', { display: '2000', start: '2000', precision: 'year' }, { language: 'ko', rights: { label: 'CC0', downloadAllowed: true, reuseAllowed: true }, transcript: '피란민의 일상 생활' })], wars: [{ id: 'test-war', name: '한국전쟁', aliases: ['6·25전쟁', 'Korean War'], period: '1950–1953', summary: 'Test only', sourceUrl: 'https://example.org/', regions: [] }], entities: [], collections: [] };

test('war aliases and Unicode punctuation find connected records', () => { assert.equal(searchArchive(data, { ...defaultFilters, q: '6·25전쟁' }).length, 3); assert.equal(searchArchive(data, { ...defaultFilters, q: 'Korean War' }).length, 3); });
test('date ranges overlap and unknown dates remain excluded under a date filter', () => { assert.deepEqual(searchArchive(data, { ...defaultFilters, from: '1951', to: '1952' }).map(item => item.id), ['old']); });
test('rights, language and transcript filters apply together', () => { assert.deepEqual(searchArchive(data, { ...defaultFilters, q: '피란민', language: 'ko', rights: 'reuse' }).map(item => item.id), ['new']); });
test('oldest/newest puts unknown dates last without inventing dates', () => { assert.deepEqual(searchArchive(data, { ...defaultFilters, sort: 'newest' }).map(item => item.id), ['new', 'old', 'unknown']); });
test('URL filters roundtrip non-default conditions and reject unbounded page input', () => { const input = { ...defaultFilters, q: '기록 & 사람', kind: 'document', from: '1950', sort: 'title', page: 3 }; assert.deepEqual(parseFilters(filtersToParams(input)), input); const parsed = parseFilters(new URLSearchParams('page=-5&from=oops&rights=unsafe&sort=bad')); assert.equal(parsed.page, 1); assert.equal(parsed.from, ''); assert.equal(parsed.rights, ''); assert.equal(parsed.sort, 'updated'); });
