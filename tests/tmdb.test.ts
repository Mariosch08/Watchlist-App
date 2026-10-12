import { describe, expect, it, vi } from 'vitest';
import { handleTmdbRequest } from '../supabase/functions/_shared/tmdb.ts';

const respond = (data: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => data } as Response);

describe('tmdb function', () => {
  it('searches in de-CH and keeps only movies/series', async () => {
    const fetchImpl = respond({ total_pages: 1, results: [{ id: 1, media_type: 'movie', title: 'A' }, { id: 2, media_type: 'person', name: 'P' }] });
    const res = await handleTmdbRequest({ action: 'search', query: ' dune ' }, 'v3key', fetchImpl);
    expect(res.status).toBe(200);
    expect((res.body as any).results).toEqual([expect.objectContaining({ tmdb_id: 1, media_type: 'movie', title: 'A' })]);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get('query')).toBe('dune');
    expect(url.searchParams.get('language')).toBe('de-CH');
    expect(url.searchParams.get('api_key')).toBe('v3key');
  });

  it('uses bearer auth for v4 tokens', async () => {
    const fetchImpl = respond({ id: 1399, name: 'GoT', first_air_date: '2011-04-17' });
    const res = await handleTmdbRequest({ action: 'title', media_type: 'tv', tmdb_id: 1399 }, 'eyJtoken', fetchImpl);
    expect(res.body).toMatchObject({ tmdb_id: 1399, title: 'GoT', release_date: '2011-04-17' });
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe('Bearer eyJtoken');
  });

  it.each([
    [{ action: 'search', query: '' }],
    [{ action: 'search', query: 'x'.repeat(101) }],
    [{ action: 'title', media_type: 'book', tmdb_id: 1 }],
    [{ action: 'title', media_type: 'movie', tmdb_id: -5 }],
    [{ action: 'drop_tables' }],
    [null],
  ])('rejects invalid input %j', async (body) => {
    expect((await handleTmdbRequest(body, 'k', respond({}))).status).toBe(400);
  });

  it('maps TMDb errors and missing key', async () => {
    expect((await handleTmdbRequest({ action: 'title', media_type: 'movie', tmdb_id: 9 }, 'k', respond({}, 404))).status).toBe(404);
    expect((await handleTmdbRequest({ action: 'search', query: 'a' }, 'k', respond({}, 500))).status).toBe(502);
    expect((await handleTmdbRequest({ action: 'search', query: 'a' }, undefined, respond({}))).status).toBe(500);
  });
});
