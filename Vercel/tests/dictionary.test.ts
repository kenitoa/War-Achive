import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateArchive } from '../lib/archive';
import { dictionaryEntries, dictionaryNotes, DictionaryNoteSchema } from '../lib/dictionary';

const data = validateArchive(JSON.parse(fs.readFileSync('content/archive.json', 'utf8')));

test('dictionary facts require citations and actual registered source references', () => {
  const noCitation = structuredClone(dictionaryNotes[0]);
  noCitation.facts[0].citations = [];
  assert.equal(DictionaryNoteSchema.safeParse(noCitation).success, false);
  const dangling = structuredClone(dictionaryNotes[0]);
  dangling.facts[0].citations[0].sourceId = 'not-a-source';
  assert.equal(DictionaryNoteSchema.safeParse(dangling).success, false);
  const noFacts = structuredClone(dictionaryNotes[0]);
  noFacts.facts = [];
  assert.equal(DictionaryNoteSchema.safeParse(noFacts).success, false);
});

test('Wikidata and unregistered hosts cannot stand in for the institution source registry', () => {
  for (const url of ['https://www.wikidata.org/wiki/Q8684', 'https://www.seoul.go.kr.example.com/history', 'https://user:password@www.seoul.go.kr/history', 'http://www.seoul.go.kr/history']) {
    const note = structuredClone(dictionaryNotes[0]);
    note.sources[0].url = url;
    assert.equal(DictionaryNoteSchema.safeParse(note).success, false, url);
  }
});

test('an imported official URL and exact coordinate do not automatically create a sourced dictionary note', () => {
  const imported = { ...data.entities[0], id: 'new-import', name: 'Test import', sourceUrl: 'https://www.seoul.go.kr/seoul/history.do', location: { name: 'Test point', lat: 0, lon: 0, precision: 'exact' as const } };
  const entry = dictionaryEntries({ ...data, entities: [...data.entities, imported] }).find(item => item.id === 'new-import');
  assert.equal(entry?.note, undefined);
  assert.equal(entry?.imported?.location?.precision, 'exact');
});

test('war associations never fabricate direct record evidence and original publication is unchanged', () => {
  const before = JSON.stringify(data);
  const withoutExplicitLinks = { ...data, records: data.records.map(record => ({ ...record, entityIds: [] })) };
  const entries = dictionaryEntries(withoutExplicitLinks);
  assert.ok(dictionaryNotes.every(note => entries.some(entry => entry.id === note.id)));
  assert.ok(entries.every(entry => entry.directRecordIds.length === 0));
  const id = dictionaryNotes[0].id;
  const withExplicitLink = { ...data, records: data.records.map((record, index) => index === 0 ? { ...record, entityIds: [id] } : record) };
  assert.deepEqual(dictionaryEntries(withExplicitLink).find(entry => entry.id === id)?.directRecordIds, [data.records[0].id]);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(dictionaryEntries({ ...data, wars: [], entities: [], records: [] }), []);
});

test('duplicate editorial identities fail instead of silently overwriting', () => {
  assert.throws(() => dictionaryEntries(data, [dictionaryNotes[0], dictionaryNotes[0]]), /ID/);
});
