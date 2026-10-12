import { describe, expect, it } from 'vitest';
import { availableYears, challenges, reviewSvg, viewings, yearStats } from '../src/lib/stats.js';

const w = (tmdb_id, extra = {}) => ({ media_type: 'movie', tmdb_id, title: `Film ${tmdb_id}`, status: 'completed', poster_path: null, genre_ids: [18], runtime: 120, ...extra });

const WATCHLIST = [
  w(1, { watched_at: '2026-01-10T20:00:00Z', my_rating: 9, release_date: '1994-05-01', genre_ids: [18, 80] }),
  w(2, { watched_at: '2026-03-02T20:00:00Z', my_rating: 6, release_date: '2021-01-01', runtime: null }),
  w(3, { watched_at: '2025-12-24T20:00:00Z', my_rating: 8, release_date: '1957-01-01' }),
  w(4, { status: 'planned', release_date: '2026-01-01' }),
  { media_type: 'tv', tmdb_id: 9, title: 'Dark', status: 'completed', watched_at: '2026-03-20T20:00:00Z', my_rating: 10, genre_ids: [9648], release_date: '2017-12-01' },
];
const DIARY = [
  { media_type: 'movie', tmdb_id: 1, title: 'Film 1', watched_on: '2026-01-10', place: 'cinema', rating: null, rewatch: false },
  { media_type: 'movie', tmdb_id: 1, title: 'Film 1', watched_on: '2026-03-15', place: 'home', rating: 10, rewatch: true },
];

describe('stats', () => {
  const views = viewings(WATCHLIST, DIARY);

  it('counts diary viewings and completed titles without diary once', () => {
    expect(views.map((v) => [v.tmdb_id, v.date])).toEqual([
      [3, '2025-12-24'],
      [1, '2026-01-10'],
      [2, '2026-03-02'],
      [1, '2026-03-15'],
      [9, '2026-03-20'],
    ]);
    expect(availableYears(views, new Date('2026-10-12'))).toEqual([2026, 2025]);
  });

  it('summarizes a year', () => {
    const s = yearStats(views, 2026, new Map([[18, 'Drama'], [80, 'Krimi']]));
    expect(s).toMatchObject({ total: 4, titles: 3, movies: 2, series: 1, cinema: 1, rewatches: 1, bestMonth: 2, estimated: true });
    expect(s.hours).toBe(Math.round((120 + 120 + 110) / 60));
    expect(s.months.slice(0, 3)).toEqual([1, 0, 3]);
    expect(s.genres[0]).toEqual({ id: 18, name: 'Drama', count: 2, average: 8 });
    expect(s.favourites[0].tmdb_id).toBe(9);
    expect(s.decades).toEqual([
      { decade: 1990, count: 1 },
      { decade: 2020, count: 1 },
    ]);
  });

  it('tracks challenges', () => {
    const list = challenges({ views, watchlist: WATCHLIST, topRated: [{ tmdb_id: 1 }, { tmdb_id: 3 }, { tmdb_id: 77 }], year: 2026, now: new Date('2026-10-12') });
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    expect(byId.films52).toMatchObject({ value: 2, goal: 52, done: false });
    expect(byId.decades).toMatchObject({ value: 3, goal: 11 });
    expect(byId.decades.missing).toContain(1920);
    expect(byId.top100.value).toBe(2);
    expect(byId.cinema.value).toBe(1);
  });

  it('renders an escaped review card', () => {
    const s = yearStats(views, 2026, new Map([[18, 'Drama & <Krimi>']]));
    const svg = reviewSvg(s, { name: 'Mario' });
    expect(svg).toContain('Mein Filmjahr 2026');
    expect(svg).toContain('MARIO · JAHRESRÜCKBLICK');
    expect(svg).toContain('Drama &amp; &lt;Krimi&gt;');
    expect(svg.match(/<rect /g)).toHaveLength(13);
  });
});
