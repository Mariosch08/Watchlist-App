import { describe, expect, it } from 'vitest';
import { airedEpisodes, bingeFinish, episodeKey, episodesUpTo, isForgotten, nextUp, progressStats } from '../src/lib/series.js';

const seasons = [
  { season_number: 1, episode_count: 3 },
  { season_number: 2, episode_count: 2 },
];
const lastAired = { season_number: 2, episode_number: 1 };

describe('series helpers', () => {
  it('lists aired episodes and "bis hier" ranges across seasons', () => {
    expect(airedEpisodes(seasons, lastAired)).toHaveLength(4);
    expect(episodesUpTo(seasons, 2, 1).map((e) => episodeKey(e.season_number, e.episode_number))).toEqual(['1:1', '1:2', '1:3', '2:1']);
    expect(airedEpisodes(seasons, null)).toEqual([]);
  });

  it('finds the next unwatched aired episode and counts progress', () => {
    const watched = new Set(['1:1', '1:2']);
    expect(nextUp(seasons, watched, lastAired)).toEqual({ season_number: 1, episode_number: 3 });
    expect(progressStats(seasons, watched, lastAired)).toEqual({ aired: 4, seen: 2, remaining: 2, percent: 50 });
    expect(nextUp(seasons, new Set(['1:1', '1:2', '1:3', '2:1']), lastAired)).toBeNull();
  });

  it('computes the binge finish date', () => {
    const r = bingeFinish(5, 2, new Date('2026-10-13T12:00:00'));
    expect(r.days).toBe(3);
    expect(r.date.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(bingeFinish(0, 2)).toBeNull();
  });

  it('flags series that were not continued for 30 days', () => {
    const now = new Date('2026-10-13T00:00:00Z');
    expect(isForgotten({ watch_status: 'watching', last_watched_at: '2026-09-01T00:00:00Z' }, now)).toBe(true);
    expect(isForgotten({ watch_status: 'watching', last_watched_at: '2026-10-01T00:00:00Z' }, now)).toBe(false);
    expect(isForgotten({ watch_status: 'paused', last_watched_at: '2026-01-01T00:00:00Z' }, now)).toBe(false);
  });
});
