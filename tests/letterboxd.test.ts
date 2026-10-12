import { describe, expect, it } from 'vitest';
import { mergeImportRow } from '../supabase/functions/_shared/imdb.ts';
import { isLetterboxdCsv, parseLetterboxd, parseTrakt, pickSearchResult } from '../supabase/functions/_shared/letterboxd.ts';

const DIARY = `Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
2026-09-02,Heat,1995,https://boxd.it/abc1,4.5,,,2026-09-01
2026-09-20,Heat,1995,https://boxd.it/abc2,5,Yes,,2026-09-19
2026-09-20,Heat,1995,https://boxd.it/abc2,5,Yes,,2026-09-19
2026-10-01,"Crouching Tiger, Hidden Dragon",2000,https://boxd.it/xyz,0.5,,,2026-10-01
`;

describe('Letterboxd', () => {
  it('recognises the export and reads diary rows with ratings, rewatches and dates', () => {
    expect(isLetterboxdCsv(DIARY)).toBe(true);
    expect(isLetterboxdCsv('Const,Your Rating\n')).toBe(false);
    const parsed = parseLetterboxd(DIARY, 'diary.csv');
    expect(parsed.kind).toBe('letterboxd_diary');
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      imdb_id: '',
      ref: 'lb:boxd.it/abc1',
      title: 'Heat',
      year: 1995,
      rating: 9,
      rated_at: '2026-09-01',
      status_hint: 'completed',
      watched_at: '2026-09-01',
      source: 'letterboxd',
      diary: { watched_on: '2026-09-01', rewatch: false, rating: 9 },
    });
    expect(parsed.rows[1].diary).toEqual({ watched_on: '2026-09-19', rewatch: true, rating: 10 });
    expect(parsed.rows[2]).toMatchObject({ title: 'Crouching Tiger, Hidden Dragon', rating: 1 });
  });

  it('tells watchlist, ratings and watched files apart', () => {
    const watchlist = parseLetterboxd('Date,Name,Year,Letterboxd URI\n2026-01-01,Dune,2021,https://boxd.it/d\n', 'watchlist.csv');
    expect(watchlist.kind).toBe('letterboxd_watchlist');
    expect(watchlist.rows[0]).toMatchObject({ status_hint: 'planned', diary: null, rating: null });
    expect(parseLetterboxd('Date,Name,Year,Letterboxd URI\n2026-01-01,Dune,2021,https://boxd.it/d\n', 'watched.csv').rows[0].status_hint).toBe('completed');
    expect(parseLetterboxd('Date,Name,Year,Letterboxd URI,Rating\n2026-01-01,Dune,2021,https://boxd.it/d,3\n', 'ratings.csv').kind).toBe('letterboxd_ratings');
    expect(() => parseLetterboxd('Const,Title\ntt1,x\n')).toThrow('UNSUPPORTED_FILE');
  });

  it('matches TMDb search results by title and year', () => {
    const results = [
      { id: 1, title: 'Heat', release_date: '1986-07-04' },
      { id: 2, title: 'Heat', original_title: 'Heat', release_date: '1995-12-15' },
      { id: 3, title: 'Tiger und Drache', original_title: 'Wo hu cang long', release_date: '2000-07-07' },
    ];
    expect(pickSearchResult(results, 'Heat', 1995)?.id).toBe(2);
    expect(pickSearchResult(results, 'Crouching Tiger, Hidden Dragon', 2000)?.id).toBe(3);
    expect(pickSearchResult(results, 'Unknown', 1970)).toBeNull();
    expect(pickSearchResult(results, 'Heat', null)?.id).toBe(1);
  });
});

describe('Trakt', () => {
  it('reads ratings with TMDb ids and skips episodes', () => {
    const parsed = parseTrakt(
      JSON.stringify([
        { rated_at: '2026-05-01T20:00:00.000Z', rating: 8, type: 'movie', movie: { title: 'Arrival', year: 2016, ids: { trakt: 1, tmdb: 329865, imdb: 'tt2543164' } } },
        { rated_at: '2026-05-02T20:00:00.000Z', rating: 9, type: 'show', show: { title: 'Dark', year: 2017, ids: { trakt: 2, tmdb: 70523 } } },
        { rated_at: '2026-05-03T20:00:00.000Z', rating: 7, type: 'episode', episode: { title: 'Pilot' }, show: { title: 'X', ids: { tmdb: 5 } } },
      ]),
      'ratings-movies.json',
    );
    expect(parsed.kind).toBe('trakt_ratings');
    expect(parsed.rows.map((r) => [r.media_hint, r.tmdb_id, r.imdb_id, r.rating, r.rated_at])).toEqual([
      ['movie', 329865, 'tt2543164', 8, '2026-05-01'],
      ['tv', 70523, '', 9, '2026-05-02'],
    ]);
    expect(parsed.skipped).toHaveLength(1);
  });

  it('reads watchlist and watched files', () => {
    const wl = parseTrakt(JSON.stringify([{ listed_at: '2026-01-01T00:00:00Z', type: 'movie', movie: { title: 'Dune', ids: { tmdb: 438631 } } }]));
    expect(wl.kind).toBe('trakt_watchlist');
    expect(wl.rows[0].status_hint).toBe('planned');
    const watched = parseTrakt(JSON.stringify([{ plays: 2, last_watched_at: '2026-03-04T21:00:00Z', movie: { title: 'Heat', ids: { tmdb: 949 } } }]));
    expect(watched.kind).toBe('trakt_watched');
    expect(watched.rows[0]).toMatchObject({ status_hint: 'completed', watched_at: '2026-03-04' });
    expect(() => parseTrakt('{"not":"a list"}')).toThrow('UNSUPPORTED_FILE');
    expect(() => parseTrakt('nope')).toThrow('UNSUPPORTED_FILE');
  });
});

describe('merging rows from other sources', () => {
  const base = { imdb_id: '', title: 'Heat', title_type: 'movie', year: 1995, rating: null, rated_at: null, runtime: null };

  it('inserts watched titles as completed with the viewing date and their source', () => {
    const d = mergeImportRow({ ...base, source: 'letterboxd', status_hint: 'completed', watched_at: '2026-09-01' }, null, false);
    expect(d).toEqual({
      action: 'insert',
      values: expect.objectContaining({ imdb_id: null, status: 'completed', watched_at: '2026-09-01', source: 'letterboxd', my_rating: null }),
    });
  });

  it('marks a planned title as watched but never clears a known IMDb id', () => {
    const existing = { status: 'planned', my_rating: null, rated_at: null, imdb_id: 'tt0113277', runtime: 170 };
    expect(mergeImportRow({ ...base, status_hint: 'completed', watched_at: '2026-09-01' }, existing, false)).toEqual({
      action: 'update',
      values: { status: 'completed', watched_at: '2026-09-01' },
    });
    expect(mergeImportRow({ ...base, status_hint: 'planned' }, existing, false)).toEqual({ action: 'skip', reason: 'unchanged' });
  });
});
