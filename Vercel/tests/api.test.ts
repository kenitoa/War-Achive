import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, RegistrationSchema, SessionSchema } from '../lib/api';

test('account registration accepts the real user-only response and does not invent a login session', () => {
  const response = { user: { id: 'member-id', email: 'reader@example.org', displayName: '독자' } };
  assert.deepEqual(RegistrationSchema.parse(response), response);
  assert.equal(SessionSchema.safeParse(response).success, false);
});

test('account requests preserve cookie authentication, CSRF and no-store across the same-origin proxy', async () => {
  const previousOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
  const previousFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_API_ORIGIN = 'https://archive.example.org';
  let receivedUrl: string | undefined;
  let receivedOptions: RequestInit | undefined;
  globalThis.fetch = async (input, options) => {
    receivedUrl = String(input);
    receivedOptions = options;
    return new Response(JSON.stringify({ data: { user: { id: 'member-id', email: 'reader@example.org', displayName: '독자' }, csrfToken: 'csrf-for-test' }, error: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const session = await apiRequest('/api/v1/account/session', SessionSchema, { method: 'POST', body: { email: 'reader@example.org', password: 'test-only-password' }, csrfToken: 'csrf-for-test' });
    assert.equal(session.user.id, 'member-id');
    assert.equal(receivedUrl, 'https://archive.example.org/api/v1/account/session');
    assert.equal(receivedOptions?.credentials, 'include');
    assert.equal(receivedOptions?.cache, 'no-store');
    assert.equal(new Headers(receivedOptions?.headers).get('X-CSRF-Token'), 'csrf-for-test');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOrigin === undefined) delete process.env.NEXT_PUBLIC_API_ORIGIN;
    else process.env.NEXT_PUBLIC_API_ORIGIN = previousOrigin;
  }
});
