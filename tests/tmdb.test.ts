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
    const outage = await handleTmdbRequest({ action: 'search', query: 'ab' }, 'k', respond({}, 401));
    expect(outage.status).toBe(502);
    expect(outage.body).toMatchObject({ code: 'TMDB_UNAVAILABLE' });
    const missing = await handleTmdbRequest({ action: 'search', query: 'ab' }, undefined, respond({}));
    expect(missing.status).toBe(500);
    expect(missing.body).toMatchObject({ code: 'TMDB_NOT_CONFIGURED' });
    const short = await handleTmdbRequest({ action: 'search', query: 'a' }, 'k', respond({}));
    expect(short.body).toMatchObject({ code: 'INVALID_QUERY' });
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

describe('tmdbGet retries', async () => {
  const { tmdbGet } = await import('../supabase/functions/_shared/tmdb.ts');
  const res = (status: number, retryAfter?: string) =>
    ({ ok: status < 400, status, headers: new Headers(retryAfter ? { 'retry-after': retryAfter } : {}), json: async () => ({ ok: true }) }) as Response;

  it('retries 429 using Retry-After and then succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(429, '2')).mockResolvedValueOnce(res(200));
    const sleep = vi.fn(async () => {});
    expect(await tmdbGet('/x', {}, 'k', fetchImpl, sleep)).toEqual({ ok: true });
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('gives up after repeated server errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(503));
    await expect(tmdbGet('/x', {}, 'k', fetchImpl, async () => {})).rejects.toThrow('TMDb request failed (503)');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not retry client errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(401));
    await expect(tmdbGet('/x', {}, 'k', fetchImpl, async () => {})).rejects.toThrow('(401)');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

const DUNE = {
  id: 438631,
  title: 'Dune',
  original_title: 'Dune',
  release_date: '2021-09-15',
  vote_average: 7.8,
  vote_count: 12000,
  poster_path: '/p.jpg',
  backdrop_path: '/b.jpg',
  overview: '',
  tagline: '',
  runtime: 155,
  imdb_id: 'tt1160419',
  genres: [{ id: 878, name: 'Science-Fiction' }],
  credits: {
    cast: Array.from({ length: 15 }, (_, i) => ({ id: i, name: `Actor ${i}`, character: `Role ${i}`, profile_path: null })),
    crew: [
      { name: 'Denis Villeneuve', job: 'Director' },
      { name: 'Denis Villeneuve', job: 'Screenplay' },
      { name: 'Jon Spaihts', job: 'Screenplay' },
      { name: 'Hans Zimmer', job: 'Original Music Composer' },
    ],
  },
  videos: {
    results: [
      { site: 'YouTube', key: 'teaserDE01', type: 'Teaser', iso_639_1: 'de', official: true },
      { site: 'YouTube', key: 'trailerEN1', type: 'Trailer', iso_639_1: 'en', official: true },
      { site: 'YouTube', key: 'trailerDE1', type: 'Trailer', iso_639_1: 'de', official: true, name: 'Offizieller Trailer' },
      { site: 'Vimeo', key: 'trailerDE2', type: 'Trailer', iso_639_1: 'de' },
      { site: 'YouTube', key: 'bad key"><script>', type: 'Trailer', iso_639_1: 'de', official: true },
    ],
  },
  'watch/providers': {
    results: {
      DE: { flatrate: [{ provider_id: 1, provider_name: 'Only DE' }] },
      CH: {
        link: 'https://www.themoviedb.org/movie/438631/watch?locale=CH',
        flatrate: [
          { provider_id: 8, provider_name: 'Netflix', logo_path: '/n.png', display_priority: 2 },
          { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/d.png', display_priority: 1 },
        ],
        free: [{ provider_id: 8, provider_name: 'Netflix', display_priority: 2 }],
        rent: [{ provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.png', display_priority: 3 }],
      },
    },
  },
  recommendations: { results: [{ id: 693134, title: 'Dune: Part Two', media_type: 'movie' }, { id: 438631, title: 'Dune', media_type: 'movie' }] },
  similar: { results: [{ id: 1, title: 'Similar' }] },
};

describe('details action', () => {
  const fetchFor = (raw: any, en: any = { overview: 'English overview' }) =>
    vi.fn(async (url: URL) => {
      const body = new URL(String(url)).searchParams.get('language') === 'en-US' ? en : raw;
      return { ok: true, status: 200, json: async () => body } as Response;
    });

  it('loads everything in one request and normalises it', async () => {
    const fetchImpl = fetchFor(DUNE);
    const res = await handleTmdbRequest({ action: 'details', media_type: 'movie', tmdb_id: 438631 }, 'k', fetchImpl);
    expect(res.status).toBe(200);
    const body = res.body as any;
    expect(body).toMatchObject({
      tmdb_id: 438631,
      media_type: 'movie',
      title: 'Dune',
      backdrop_path: '/b.jpg',
      overview: 'English overview',
      tagline: null,
      genres: ['Science-Fiction'],
      runtime: 155,
      imdb_id: 'tt1160419',
      trailer: { key: 'trailerDE1', name: 'Offizieller Trailer', language: 'de' },
    });
    expect(body.cast).toHaveLength(12);
    expect(body.cast[0]).toEqual({ id: 0, name: 'Actor 0', character: 'Role 0', profile_path: null });
    expect(body.crew).toEqual([
      { job: 'Regie', names: ['Denis Villeneuve'] },
      { job: 'Drehbuch', names: ['Denis Villeneuve', 'Jon Spaihts'] },
    ]);
    expect(body.providers.link).toContain('locale=CH');
    expect(body.providers.flatrate.map((p: any) => p.name)).toEqual(['Disney Plus', 'Netflix']);
    expect(body.providers.rent).toEqual([{ id: 2, name: 'Apple TV', logo_path: '/a.png' }]);
    expect(body.providers.buy).toEqual([]);
    // The title itself is never recommended; recommendations win over "similar".
    expect(body.similar.map((s: any) => s.tmdb_id)).toEqual([693134]);
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.pathname).toBe('/3/movie/438631');
    expect(url.searchParams.get('append_to_response')).toContain('watch/providers');
    expect(url.searchParams.get('language')).toBe('de-CH');
    expect(fetchImpl).toHaveBeenCalledTimes(2); // second call only for the missing German overview
  });

  it('uses aggregate credits and creators for series and falls back to "similar"', async () => {
    const raw = {
      id: 95396,
      name: 'Severance',
      overview: 'Deutsch',
      episode_run_time: [55],
      number_of_seasons: 2,
      created_by: [{ name: 'Dan Erickson' }],
      aggregate_credits: { cast: [{ id: 1, name: 'Adam Scott', roles: [{ character: 'Mark' }] }] },
      recommendations: { results: [] },
      similar: { results: [{ id: 7, name: 'Similar Show' }] },
    };
    const fetchImpl = fetchFor(raw);
    const res = await handleTmdbRequest({ action: 'details', media_type: 'tv', tmdb_id: 95396 }, 'k', fetchImpl);
    const body = res.body as any;
    expect(body).toMatchObject({ title: 'Severance', overview: 'Deutsch', runtime: 55, number_of_seasons: 2, trailer: null });
    expect(body.cast[0]).toMatchObject({ name: 'Adam Scott', character: 'Mark' });
    expect(body.crew).toEqual([{ job: 'Idee', names: ['Dan Erickson'] }]);
    expect(body.similar).toEqual([expect.objectContaining({ tmdb_id: 7, media_type: 'tv', title: 'Similar Show' })]);
    expect(body.providers).toEqual({ link: null, flatrate: [], rent: [], buy: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('append_to_response')).toContain('aggregate_credits');
  });

  it('serves from cache and stores fresh results for 24 h', async () => {
    const store = new Map<string, unknown>();
    const cache = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      set: vi.fn(async (k: string, d: unknown) => void store.set(k, d)),
    };
    const fetchImpl = fetchFor({ ...DUNE, overview: 'Deutsch' });
    const body = { action: 'details', media_type: 'movie', tmdb_id: 438631 };
    const first = await handleTmdbRequest(body, 'k', fetchImpl, cache);
    const second = await handleTmdbRequest(body, 'k', fetchImpl, cache);
    expect(second.body).toEqual(first.body);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith('details2:movie:438631:de-CH', expect.anything(), 24 * 60 * 60 * 1000);
  });

  it('keeps working when the cache fails and does not cache misses', async () => {
    const cache = { get: vi.fn().mockRejectedValue(new Error('db down')), set: vi.fn().mockRejectedValue(new Error('db down')) };
    const ok = await handleTmdbRequest({ action: 'details', media_type: 'movie', tmdb_id: 1 }, 'k', fetchFor({ ...DUNE, overview: 'x' }), cache);
    expect(ok.status).toBe(200);
    const missing = { get: vi.fn(async () => null), set: vi.fn() };
    const res = await handleTmdbRequest({ action: 'details', media_type: 'movie', tmdb_id: 2 }, 'k', respond({}, 404), missing);
    expect(res).toMatchObject({ status: 404, body: { code: 'NOT_FOUND' } });
    expect(missing.set).not.toHaveBeenCalled();
  });

  it.each([[{ action: 'details', media_type: 'book', tmdb_id: 1 }], [{ action: 'details', media_type: 'movie', tmdb_id: 'abc' }]])(
    'rejects invalid input %j',
    async (body) => {
      expect((await handleTmdbRequest(body, 'k', respond({}))).status).toBe(400);
    },
  );
});

describe('top_rated action', () => {
  it('loads five pages once and caches the list for a week', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page'));
      return new Response(JSON.stringify({ results: [{ id: page, title: `Film ${page}`, release_date: '1994-01-01' }] }));
    });
    const store = new Map<string, { data: unknown; ttl: number }>();
    const cache = { get: async (k: string) => store.get(k)?.data ?? null, set: async (k: string, data: unknown, ttl: number) => void store.set(k, { data, ttl }) };
    const res = await handleTmdbRequest({ action: 'top_rated' }, 'k', fetchImpl, cache);
    expect(res.status).toBe(200);
    expect((res.body as any).titles.map((t: any) => t.tmdb_id)).toEqual([1, 2, 3, 4, 5]);
    expect([...store.values()][0].ttl).toBe(7 * 86_400_000);
    await handleTmdbRequest({ action: 'top_rated' }, 'k', fetchImpl, cache);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });
});

describe('find action', () => {
  it('maps an IMDb id to a TMDb title and validates the id', async () => {
    const fetchImpl = respond({ movie_results: [{ id: 603, title: 'Matrix', release_date: '1999-03-31' }], tv_results: [] });
    const res = await handleTmdbRequest({ action: 'find', imdb_id: 'tt0133093' }, 'k', fetchImpl);
    expect(res).toMatchObject({ status: 200, body: { media_type: 'movie', tmdb_id: 603, title: 'Matrix' } });
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/find/tt0133093');
    expect((await handleTmdbRequest({ action: 'find', imdb_id: 'tt1; drop' }, 'k', fetchImpl)).status).toBe(400);
    expect((await handleTmdbRequest({ action: 'find', imdb_id: 'tt0000001' }, 'k', respond({ movie_results: [], tv_results: [] }))).status).toBe(404);
  });
});
