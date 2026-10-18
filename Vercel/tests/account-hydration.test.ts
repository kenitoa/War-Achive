import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AccountPanel } from '../components/account';

test('server-rendered account controls wait for hydration and password forms use POST', () => {
  const previousOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
  process.env.NEXT_PUBLIC_API_ORIGIN = 'https://archive.example.org';
  try {
    const html = renderToStaticMarkup(createElement(AccountPanel));
    const controls = [...html.matchAll(/<(?:input|button)\b[^>]*>/g)].map(match => match[0]);
    assert.ok(controls.length > 0, 'account controls are rendered');
    for (const control of controls) assert.match(control, /\sdisabled(?:=|\s|>)/, 'each interactive account control is disabled before hydration');
    const forms = [...html.matchAll(/<form\b[^>]*>/g)].map(match => match[0]);
    assert.equal(forms.length, 1);
    assert.match(forms[0], /\smethod="post"/, 'native fallback must never send credentials in a GET query');
    assert.match(html, /<input\b[^>]*type="password"[^>]*>/);
  } finally {
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_API_ORIGIN;
    else process.env.NEXT_PUBLIC_API_ORIGIN = previousOrigin;
  }
});
