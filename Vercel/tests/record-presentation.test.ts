import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordDateLabel, recordDisplayTitle, recordLanguageLabel } from '../lib/record-presentation';

test('display titles remove known package identifiers without discarding meaningful dates or page context', () => {
  assert.equal(recordDisplayTitle('1944 - Year of Decision - DPLA - 5a2df7ec72f38922a90e1666e67cdd63.jpg'), '1944 - Year of Decision');
  assert.equal(recordDisplayTitle('Defense Against Gas - DPLA - a1257d3e56d37120ec2c995fc03e4e0d (page 62).jpg'), 'Defense Against Gas');
  assert.equal(recordDisplayTitle('Camp Hospital - NARA - 45497693.jpg'), 'Camp Hospital');
  assert.equal(recordDisplayTitle('Report, 11 September 1940.pdf'), 'Report, 11 September 1940');
  assert.equal(recordDisplayTitle('Volume 2 (page 62).jpg'), 'Volume 2 (page 62)');
  assert.equal(recordDisplayTitle('Research - DPLA - useful context'), 'Research - DPLA - useful context');
  assert.equal(recordDisplayTitle('1914–1918: The Western Front'), '1914–1918: The Western Front');
});

test('unknown language is readable while unrecognized language codes remain intact', () => {
  assert.equal(recordLanguageLabel('und'), '언어 미상');
  assert.equal(recordLanguageLabel('EN'), '영어');
  assert.equal(recordLanguageLabel('la'), 'la');
});

test('an unknown source date is never presented as a confirmed historical date', () => {
  const dates = { display: '2026-06-27 16:47:40', precision: 'unknown' as const };
  assert.equal(recordDateLabel({ dates }), '시기 미상');
  assert.equal(dates.display, '2026-06-27 16:47:40');
  assert.equal(recordDateLabel({ dates: { display: '1950–1953', precision: 'range' } }), '1950–1953');
});
