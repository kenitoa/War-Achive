import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citationFragment, externalUrl, routeId } from '../lib/security';
test('only HTTP(S) links without credentials are accepted', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,<h1>x</h1>', 'file:///etc/passwd', 'https://user:pass@example.org/', '//example.org/', 'not a url']) assert.equal(externalUrl(value), undefined);
  assert.equal(externalUrl('https://example.org/item'), 'https://example.org/item');
});
test('citation fragments encode numeric page and validated timecode without script interpolation', () => {
  assert.equal(citationFragment('https://example.org/doc.pdf', '7'), 'https://example.org/doc.pdf#page=7');
  assert.equal(citationFragment('https://example.org/clip', undefined, '01:02:03'), 'https://example.org/clip#t=3723');
  assert.equal(citationFragment('javascript:alert(1)', '7'), undefined);
  assert.equal(citationFragment('https://example.org/doc.pdf', '7&evil=1'), 'https://example.org/doc.pdf');
  assert.equal(routeId('a/b?x=1'), 'a%2Fb%3Fx%3D1');
});
