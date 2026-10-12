import { describe, expect, it, vi } from 'vitest';
import { handleTmdbRequest, normalizeText, rankResults } from '../supabase/functions/_shared/tmdb.ts';

const respond = (data: unknown, status = 200) =>
  vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => data } as Response);

describe('tmdb function', () => {
  it('searches movies and series in de-CH and merges them', async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      const body = String(url).includes('/search/movie')
        ? { total_pages: 2, results: [{ id: 807, title: 'Sieben', original_title: 'Se7en', vote_count: 21000, release_date: '1995-09-22' }] }
        : { total_pages: 1, results: [{ id: 5, name: 'Seven Seconds', original_name: 'Seven Seconds', vote_count: 300 }] };
      return { ok: true, status: 200, json: async () => body } as Response;
    });
    const res = await handleTmdbRequest({ action: 'search', query: ' seven ' }, 'v3key', fetchImpl);
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body.total_pages).toBe(2);
    expect(body.results.map((r: any) => [r.media_type, r.tmdb_id])).toEqual(expect.arrayContaining([['movie', 807], ['tv', 5]]));
    expect(body.results.find((r: any) => r.tmdb_id === 807)).toMatchObject({ title: 'Sieben', original_title: 'Se7en' });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.searchParams.get('query')).toBe('seven');
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

describe('search ranking', () => {
  it('normalises accents, case and punctuation', () => {
    expect(normalizeText('Amélie: Die Fabelhafte!')).toBe('ameliediefabelhafte');
  });

  it('puts exact matches (German or original title) first when similarly known', () => {
    const movies = [
      { id: 1, title: 'Sieben Leben', original_title: 'Seven Pounds', vote_count: 600 },
      { id: 2, title: 'Seven', original_title: 'Seven', vote_count: 500 },
    ];
    expect(rankResults('seven', movies, []).map((r) => r.tmdb_id)).toEqual([2, 1]);
  });

  it('prefers well-known titles over obscure ones at the same match level', () => {
    const movies = [{ id: 1, title: 'Dune', original_title: 'Dune', vote_count: 12 }];
    const series = [{ id: 2, name: 'Dune', original_name: 'Dune', vote_count: 9000 }];
    expect(rankResults('dune', movies, series).map((r) => r.tmdb_id)).toEqual([2, 1]);
  });

  it('keeps famous titles matched via alternative names above obscure exact matches', () => {
    const movies = [
      { id: 807, title: 'Sieben', original_title: 'Se7en', vote_count: 21000 },
      { id: 9, title: 'Seven Days', original_title: 'Seven Days', vote_count: 10 },
      { id: 10, title: 'Seven', original_title: 'Seven', vote_count: 50 },
    ];
    expect(rankResults('seven', movies, [])[0].tmdb_id).toBe(807);
  });
});
