import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicRecordSchema } from '../lib/generated-contract';
import { groupLocations } from '../lib/map/group-locations';

const record = (id: string, lat?: number, lon?: number) => PublicRecordSchema.parse({ id, title: 'Test only', summary: '', kind: 'photograph', language: 'und', source: { name: 'Test', url: 'https://example.org/', identifier: id, accessedAt: '2026-10-18T00:00:00.000Z' }, dates: { display: 'Unknown', precision: 'unknown' }, warIds: [], entityIds: [], topics: [], rights: { label: 'Test only', downloadAllowed: false, reuseAllowed: false }, review: { provenance: 'unverified', content: 'source-description', translation: 'none' }, media: {}, citations: [], revision: 1, updatedAt: '2026-10-18T00:00:00.000Z', sensitivity: 'none', ...(lat === undefined || lon === undefined ? {} : { location: { name: 'Source-provided test coordinate', lat, lon, precision: 'approximate' } }) });

test('nearby map locations form a selectable group without moving or dropping records', () => {
  const records = [record('a', 52, 9), record('b', 52.1, 9.2), record('c', 37, 127), record('unknown')];
  const groups = groupLocations(records);
  assert.equal(groups.length, 2); assert.equal(groups[0].records.length, 2);
  assert.deepEqual(groups[0].anchor, records[0].location);
  assert.deepEqual(groups[0].records[1].location, records[1].location);
  assert.deepEqual(groups.flatMap(group => group.records.map(item => item.id)), ['a', 'b', 'c']);
});
test('group anchors remain separated enough to avoid pointer interception at world scale', () => {
  const records = [record('a', 50, 10), record('b', 51, 11), record('c', 52, 12), record('d', 33, 133), record('e', 40, -90)];
  const groups = groupLocations(records);
  for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) assert.ok(Math.hypot((groups[i].anchor.lon - groups[j].anchor.lon) * 2.5, (groups[i].anchor.lat - groups[j].anchor.lat) * 2.5) >= 34);
});
