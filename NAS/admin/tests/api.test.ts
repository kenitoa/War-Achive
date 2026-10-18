import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, list, object, safeUrl } from '../src/api';

afterEach(() => vi.unstubAllGlobals());

describe('same-origin API client', () => {
  it('uses only same-origin cookies and sends CSRF on mutations', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: 'source-1' }, error: null })));
    vi.stubGlobal('fetch', fetcher);
    const client = new ApiClient(); client.setCsrfToken('session-csrf');
    await expect(client.request('/sources', { method: 'POST', body: { name: 'Library' } })).resolves.toEqual({ id: 'source-1' });
    expect(fetcher).toHaveBeenCalledWith('/api/v1/sources', expect.objectContaining({ credentials: 'same-origin', headers: expect.objectContaining({ 'X-CSRF-Token': 'session-csrf' }) }));
  });

  it('does not display internal server messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: null, error: { code: 'INTERNAL_ERROR', message: 'database password=secret' }, meta: { requestId: 'trace-123' } }), { status: 500 })));
    const error = await new ApiClient().request('/overview').catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toHaveProperty('message', expect.not.stringContaining('password'));
    expect(error).toHaveProperty('requestId', 'trace-123');
  });

  it('rejects malformed server envelopes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"stack trace"}')));
    await expect(new ApiClient().request('/overview')).rejects.toThrow('응답 형식');
  });

  it('does not accept script URLs or unsafe data shapes', () => {
    expect(safeUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeUrl('https://example.org/source')).toBe('https://example.org/source');
    expect(object(null)).toEqual({});
    expect(list({ items: [1] })).toEqual([1]);
    expect(list({ items: 'malformed' })).toEqual([]);
  });
});
