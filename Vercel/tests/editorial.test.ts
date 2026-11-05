import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateArchive } from '../lib/archive';
import { dossierFor, guideRecords, readingGuides, references, warDossiers } from '../lib/editorial';

const data = validateArchive(JSON.parse(fs.readFileSync('content/archive.json', 'utf8')));

test('reading guides only return published records and never fill empty matches with unrelated material', () => {
  const guide = readingGuides.find(item => item.id === 'care-and-recovery')!;
  const before = JSON.stringify(data.records);
  const selected = guideRecords(guide, data.records);
  assert.ok(selected.length > 0);
  assert.ok(selected.some(record => /hospital/i.test(record.title)));
  for (const record of selected) assert.ok(data.records.includes(record));
  const unrelated = { ...data.records[0], title: 'Unrelated test record', topics: [], summary: 'hospital appears only in a narrative, not the selection fields' };
  assert.deepEqual(guideRecords(guide, [unrelated]), []);
  assert.equal(JSON.stringify(data.records), before);
});

test('format guides respect published type even when a title contains another format name', () => {
  const documents = readingGuides.find(item => item.id === 'reading-documents')!;
  const photos = readingGuides.find(item => item.id === 'reading-photographs')!;
  assert.deepEqual(guideRecords(documents, data.records), data.records.filter(record => record.kind === 'document'));
  assert.deepEqual(guideRecords(photos, data.records), data.records.filter(record => record.kind === 'photograph'));
  assert.deepEqual(guideRecords(documents, []), []);
});

test('editorial routes, citations and cross references are valid without altering published collections', () => {
  const ids = readingGuides.map(guide => guide.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every(id => /^[a-z0-9-]+$/.test(id)));
  assert.ok(ids.every(id => !data.collections.some(collection => collection.id === id)));
  const sources = new Set(references.map(source => source.id));
  for (const source of references) assert.equal(new URL(source.url).protocol, 'https:');
  for (const guide of readingGuides) {
    assert.ok(guide.chapters.length >= 3);
    assert.ok(guide.sourceIds.length > 0 && guide.sourceIds.every(id => sources.has(id)));
  }
  for (const dossier of warDossiers) {
    assert.ok(data.wars.some(war => war.id === dossier.warId));
    assert.ok(dossier.guideIds.every(id => ids.includes(id)));
    assert.ok(dossier.sourceIds.every(id => sources.has(id)));
    for (const event of dossier.events) {
      assert.match(event.year, /^\d{4}$/);
      assert.ok(sources.has(event.sourceId));
    }
    assert.deepEqual(dossier.events.map(event => event.year), dossier.events.map(event => event.year).sort());
  }
  assert.equal(dossierFor('unpublished-war'), undefined);
});
