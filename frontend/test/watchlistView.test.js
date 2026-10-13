import { describe, expect, it } from 'vitest';
import { applyView, matchesText, normalizeView, sortItems, viewToParams } from '../src/lib/watchlistView.js';

const item = (over) => ({ media_type: 'movie', tmdb_id: 1, title: 'X', status: 'planned', added_at: '2026-01-01T00:00:00Z', ...over });
const items = [
  item({ tmdb_id: 1, title: 'Dune', status: 'planned', added_at: '2026-03-01T00:00:00Z', release_date: '2021-09-15', vote_average: 7.8 }),
  item({ tmdb_id: 2, title: 'Severance', media_type: 'tv', status: 'watching', added_at: '2026-01-01T00:00:00Z', release_date: '2022-02-17' }),
  item({ tmdb_id: 3, title: 'Die fabelhafte Welt der Amélie', original_title: "Le Fabuleux Destin d'Amélie Poulain", status: 'completed', my_rating: 9, watched_at: '2026-02-01T00:00:00Z', release_date: '2001-04-25' }),
  item({ tmdb_id: 4, title: 'Lost', media_type: 'tv', status: 'dropped' }),
];

describe('normalizeView / viewToParams', () => {
  it('falls back to defaults for unknown values', () => {
    expect(normalizeView(new URLSearchParams('s=bogus&type=book&sort=x'))).toEqual({ segment: 'next', type: 'all', sort: 'added', q: '', layout: 'grid' });
  });
  it('uses the segment default sort and leaves defaults out of the URL', () => {
    expect(normalizeView({ s: 'watched' }).sort).toBe('watched');
    expect(viewToParams({ segment: 'next', type: 'all', sort: 'added', q: '' })).toEqual({});
    expect(viewToParams({ segment: 'watched', type: 'tv', sort: 'title', q: 'lo' })).toEqual({ s: 'watched', type: 'tv', sort: 'title', q: 'lo' });
    expect(viewToParams({ ...normalizeView({}), layout: 'list' })).toEqual({ ansicht: 'liste' });
    expect(normalizeView(new URLSearchParams('ansicht=liste')).layout).toBe('list');
  });
});

describe('matchesText', () => {
  it('ignores case and accents and searches the original title', () => {
    expect(matchesText(items[2], 'amelie')).toBe(true);
    expect(matchesText(items[2], 'FABULEUX')).toBe(true);
    expect(matchesText(items[0], 'severance')).toBe(false);
    expect(matchesText(items[0], '  ')).toBe(true);
  });
});

describe('applyView', () => {
  it('counts per segment and shows watching before planned in "Als Nächstes"', () => {
    const { visible, counts, total } = applyView(items, normalizeView({}));
    expect(counts).toEqual({ next: 2, watched: 1, paused: 1, all: 4 });
    expect(total).toBe(4);
    expect(visible.map((i) => i.tmdb_id)).toEqual([2, 1]);
  });
  it('filters by type and text; counts follow the filters', () => {
    const { visible, counts } = applyView(items, normalizeView({ s: 'all', type: 'tv', q: 'lo' }));
    expect(visible.map((i) => i.title)).toEqual(['Lost']);
    expect(counts).toEqual({ next: 0, watched: 0, paused: 1, all: 1 });
  });
  it('handles a list that is not loaded yet', () => {
    expect(applyView(undefined, normalizeView({}))).toEqual({ visible: [], counts: { next: 0, watched: 0, paused: 0, all: 0 }, total: 0 });
  });
});

describe('sortItems', () => {
  it('sorts by title with Swiss German collation and by year/rating', () => {
    expect(sortItems(items, 'title').map((i) => i.tmdb_id)).toEqual([3, 1, 4, 2]);
    expect(sortItems(items, 'year')[0].tmdb_id).toBe(2);
    expect(sortItems(items, 'mine')[0].tmdb_id).toBe(3);
  });
  it('handles 2000 items quickly', () => {
    const many = Array.from({ length: 2000 }, (_, i) => item({ tmdb_id: i + 1, title: `Titel ${i}`, added_at: new Date(2026, 0, 1 + (i % 300)).toISOString() }));
    const t = performance.now();
    applyView(many, normalizeView({ s: 'all', q: 'titel 1' }));
    expect(performance.now() - t).toBeLessThan(200);
  });
});
