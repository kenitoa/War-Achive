import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateArchive } from '../lib/archive';
import type { PublicArchive } from '../lib/generated-contract';

const empty: PublicArchive = { schemaVersion: 1, releaseId: 'test-only', generatedAt: '2026-10-18T00:00:00.000Z', records: [], wars: [], entities: [], collections: [] };
test('publication boundary rejects unsafe paths, duplicate IDs and dangling collection members', () => {
  assert.throws(() => validateArchive({ ...empty, collections: [{ id: '../unsafe', title: 'test', summary: '', recordIds: [], topics: [] }] }), /경로/);
  const collection = { id: 'same', title: 'test', summary: '', recordIds: [], topics: [] };
  assert.throws(() => validateArchive({ ...empty, collections: [collection, collection] }), /중복/);
  assert.throws(() => validateArchive({ ...empty, collections: [{ ...collection, recordIds: ['not-public'] }] }), /공개되지 않은/);
});
test('private claims cannot enter the public artifact even when other fields are valid', () => {
  assert.throws(() => validateArchive({ ...empty, claims: [{ id: 'c', subjectId: 's', statement: 'test', source: { label: 'test', url: 'https://example.org/' }, scope: {}, status: 'reported', public: false }] }), /비공개/);
});
test('valid empty publication remains genuinely empty and strips unrecognized root data', () => {
  const result = validateArchive({ ...empty, privateAdminNote: 'never publish this' });
  assert.equal(result.records.length, 0);
  assert.equal('privateAdminNote' in result, false);
});
