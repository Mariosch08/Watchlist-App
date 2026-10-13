import { describe, expect, it } from 'vitest';
import { musicMoodFit, pickTonight, tonightCandidates } from '../src/lib/tonight.js';

const items = [
  { media_type: 'movie', tmdb_id: 1, title: 'Komödie', status: 'planned', runtime: 95, genre_ids: [35], vote_average: 7 },
  { media_type: 'movie', tmdb_id: 2, title: 'Epos', status: 'planned', runtime: 170, genre_ids: [18], vote_average: 8.5 },
  { media_type: 'movie', tmdb_id: 3, title: 'Gesehen', status: 'completed', runtime: 90, genre_ids: [35], vote_average: 9 },
  { media_type: 'tv', tmdb_id: 4, title: 'Serie', status: 'watching', genre_ids: [10765], vote_average: 8 },
  { media_type: 'movie', tmdb_id: 5, title: 'Ohne Genre', status: 'planned', runtime: null, genre_ids: null, vote_average: 6 },
];

describe('tonight', () => {
  it('filters by kind, duration and mood and skips watched movies', () => {
    expect(tonightCandidates(items, { maxMinutes: 100 }).map((i) => i.tmdb_id)).toEqual([1, 4, 5]);
    expect(tonightCandidates(items, { mood: 'light' }).map((i) => i.tmdb_id)).toEqual([1]);
    expect(tonightCandidates(items, { kind: 'tv' }).map((i) => i.tmdb_id)).toEqual([4]);
  });
  it('picks among the best and never repeats titles already shown', () => {
    // A series you are watching gets a bonus, so it comes first.
    expect(pickTonight(items, {}, { random: () => 0 }).tmdb_id).toBe(4);
    expect(pickTonight(items, { kind: 'movie' }, { random: () => 0 }).tmdb_id).toBe(2);
    const shown = ['movie:2', 'tv:4', 'movie:1'];
    expect(pickTonight(items, {}, { shown, random: () => 0 }).tmdb_id).toBe(5);
    expect(pickTonight(items, { mood: 'deep' }, { shown: ['movie:2'] })).toBeNull();
  });
  it('lets the listening mood steer genres and length, without emptying the pool', () => {
    const calm = { genres: { movie: [18], tv: [18] }, avoid: { movie: [35], tv: [] }, maxMinutes: 120 };
    expect(musicMoodFit(items[1], calm)).toBe(2.5);
    expect(musicMoodFit(items[0], calm)).toBe(-3);
    expect(musicMoodFit(items[0], null)).toBe(0);
    // Under 2 h: the long drama is out, so the comedy-free short list wins.
    expect(pickTonight(items, { kind: 'movie', music: calm }, { random: () => 0 }).tmdb_id).toBe(5);
    // Nothing short enough left: the length is dropped and the drama fits best.
    expect(pickTonight(items, { kind: 'movie', music: calm }, { shown: ['movie:1', 'movie:5'], random: () => 0 }).tmdb_id).toBe(2);
    // An explicitly chosen length wins over the mood.
    expect(pickTonight(items, { kind: 'movie', maxMinutes: 200, music: calm }, { random: () => 0 }).tmdb_id).toBe(2);
  });
});
