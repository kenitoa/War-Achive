import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyShelf, MAX_IMPORT_BYTES, mergeShelves, parseShelf, type Shelf } from '../lib/shelf';
const timestamp = '2026-10-18T00:00:00.000Z';
test('invalid or oversized shelf imports never become empty successful imports', () => {
  assert.throws(() => parseShelf('{broken'), /올바른/);
  assert.throws(() => parseShelf('x'.repeat(MAX_IMPORT_BYTES + 1)), /2MB/);
  assert.throws(() => parseShelf(JSON.stringify({ version: 99, items: [] })), /올바른/);
});
test('merge preserves notes on both sides and remaps colliding collection IDs', () => {
  const current: Shelf = { version: 1, updatedAt: timestamp, collections: [{ id: 'c', name: 'Local' }], items: [{ recordId: 'r', savedAt: timestamp, note: 'Local note', collectionIds: ['c'] }] };
  const incoming: Shelf = { version: 1, updatedAt: timestamp, collections: [{ id: 'c', name: 'Remote' }], items: [{ recordId: 'r', savedAt: timestamp, note: 'Remote note', collectionIds: ['c'] }] };
  const merged = mergeShelves(current, incoming);
  assert.equal(merged.items.length, 1); assert.equal(merged.collections.length, 2);
  assert.match(merged.items[0].note, /Local note/); assert.match(merged.items[0].note, /Remote note/);
  assert.equal(merged.items[0].collectionIds.length, 2);
  assert.equal(current.items[0].note, 'Local note');
});
test('imports reject duplicate records and dangling collection references', () => {
  const item = { recordId: 'r', savedAt: timestamp, note: '', collectionIds: [] };
  assert.throws(() => parseShelf(JSON.stringify({ ...emptyShelf(), items: [item, item] })));
  assert.throws(() => parseShelf(JSON.stringify({ ...emptyShelf(), items: [{ ...item, collectionIds: ['missing'] }] })));
});
test('roundtrip preserves unavailable record IDs and plain text notes', () => {
  const shelf: Shelf = { ...emptyShelf(), items: [{ recordId: 'retired-record', savedAt: timestamp, note: '<script>keep as text</script>', collectionIds: [] }] };
  assert.deepEqual(parseShelf(JSON.stringify(shelf)), shelf);
});
