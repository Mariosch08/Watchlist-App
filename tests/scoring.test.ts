import { describe, expect, it } from 'vitest';
import { type Candidate, deriveWeights, effectiveWeights, rankCandidates, scoreCandidate, type ScoreContext, topGenres } from '../supabase/functions/_shared/scoring.ts';
import { genreIds, mergeProviders } from '../supabase/functions/_shared/tmdb.ts';

const SCIFI = 878;
const DRAMA = 18;
const HORROR = 27;
const COMEDY = 35;

const rated = (id: number, rating: number | null, genres: number[], status = 'completed') => ({
  media_type: 'movie' as const,
  tmdb_id: id,
  title: `Film ${id}`,
  status,
  my_rating: rating,
  genre_ids: genres,
});

const cand = (id: number, genres: number[], over: Partial<Candidate> = {}): Candidate => ({
  media_type: 'movie',
  tmdb_id: id,
  title: `Kandidat ${id}`,
  poster_path: null,
  release_date: '2020-01-01',
  vote_average: 7,
  vote_count: 500,
  genre_ids: genres,
  popularity: 10,
  sources: ['discover'],
  ...over,
});

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  weights: { movie: { [SCIFI]: 0.9, [HORROR]: -0.8 }, tv: {} },
  excluded: new Set(),
  becauseTitles: new Map(),
  providerNames: [],
  genreNames: { movie: { [SCIFI]: 'Science-Fiction', [DRAMA]: 'Drama' }, tv: {} },
  today: '2026-10-13',
  ...over,
});

describe('deriveWeights', () => {
  it('8-10 raise and 1-4 lower genre weights, damped for few titles', () => {
    const items = [rated(1, 9, [SCIFI]), rated(2, 10, [SCIFI, DRAMA]), rated(3, 8, [SCIFI]), rated(4, 2, [HORROR]), rated(5, 6, [COMEDY])];
    const w = deriveWeights(items, 'movie');
    expect(w[SCIFI]).toBe(1);
    expect(w[HORROR]).toBeCloseTo(-1 / 3);
    expect(w[COMEDY]).toBe(0); // 5-7 is neutral
    expect(w[DRAMA]).toBeCloseTo(1 / 3);
  });

  it('ignores other media types and items without genres', () => {
    expect(deriveWeights([rated(1, 10, [])], 'movie')).toEqual({});
    expect(deriveWeights([rated(1, 10, [SCIFI])], 'tv')).toEqual({});
  });

  it('applies adjustments within bounds and picks top genres', () => {
    const w = effectiveWeights({ [SCIFI]: 0.9, [DRAMA]: 0.2 }, { [SCIFI]: 0.5, [COMEDY]: 0.4 });
    expect(w).toEqual({ [SCIFI]: 1, [DRAMA]: 0.2, [COMEDY]: 0.4 });
    expect(topGenres(w)).toEqual([SCIFI, COMEDY, DRAMA]);
  });
});

describe('scoreCandidate', () => {
  it('prefers liked genres and penalises disliked ones', () => {
    expect(scoreCandidate(cand(1, [SCIFI]), ctx()).score).toBeGreaterThan(scoreCandidate(cand(2, [HORROR]), ctx()).score);
  });

  it('explains why with the rated title, streaming services and freshness', () => {
    const c = cand(3, [SCIFI], { sources: ['because:movie:438631', 'providers'], release_date: '2026-10-01' });
    const r = scoreCandidate(c, ctx({ becauseTitles: new Map([['because:movie:438631', { title: 'Dune', rating: 9 }]]), providerNames: ['Netflix'] }));
    expect(r.reason).toBe('Weil du „Dune“ mit 9 bewertet hast');
    expect(r.reasons).toContain('Auf deinen Streaming-Diensten (Netflix)');
    expect(r.reasons).toContain('Neu erschienen');
    expect(r.fresh).toBe(true);
  });

  it('names liked genres when nothing else explains it', () => {
    expect(scoreCandidate(cand(4, [SCIFI, DRAMA]), ctx()).reason).toBe('Passt zu deinen Lieblingsgenres: Science-Fiction');
  });
});

describe('rankCandidates', () => {
  it('excludes seen/rejected titles, merges sources and keeps the best', () => {
    const list = [cand(1, [SCIFI]), cand(1, [SCIFI], { sources: ['providers'] }), cand(2, [HORROR]), cand(3, [SCIFI])];
    const ranked = rankCandidates(list, ctx({ excluded: new Set(['movie:3']) }), 5);
    expect(ranked.map((r) => r.c.tmdb_id)).toEqual([1, 2]);
    expect(ranked[0].c.sources).toEqual(['discover', 'providers']);
  });

  it('keeps genre variety in the top list', () => {
    const list = Array.from({ length: 12 }, (_, i) => cand(i + 1, [SCIFI])).concat([cand(99, [DRAMA])]);
    const ranked = rankCandidates(list, ctx(), 8);
    expect(ranked.filter((r) => r.c.genre_ids[0] === SCIFI)).toHaveLength(2);
    expect(ranked.map((r) => r.c.tmdb_id)).toContain(99);
  });
});

describe('tmdb helpers', () => {
  it('reads genre ids from lists and details', () => {
    expect(genreIds({ genre_ids: [18, 'x', 35] })).toEqual([18, 35]);
    expect(genreIds({ genres: [{ id: 878, name: 'Sci-Fi' }] })).toEqual([878]);
  });
  it('merges Swiss providers by priority', () => {
    const merged = mergeProviders(
      [{ provider_id: 8, provider_name: 'Netflix', display_priorities: { CH: 1 } }],
      [{ provider_id: 8, provider_name: 'Netflix', display_priorities: { CH: 2 } }, { provider_id: 337, provider_name: 'Disney Plus', display_priorities: { CH: 0 } }],
    );
    expect(merged.map((p) => p.name)).toEqual(['Disney Plus', 'Netflix']);
  });
});
