import { describe, expect, it } from 'vitest';
import { airedEpisodes, behindSchedule, catchUpLine, catchUpPlan, diffSeries, seasonEpisodes, sessionLabel } from '../supabase/functions/_shared/series.ts';

const ep = (season_number: number, episode_number: number, air_date: string | null = null) => ({ season_number, episode_number, name: null, air_date });

// Severance: S1 has 9, S2 has 10 episodes; S3 starts on 2026-11-24 (Tuesday). Today: Wednesday 2026-10-14.
const severance = {
  tmdb_id: 95396,
  season_episodes: [9, 10],
  last_episode_to_air: ep(2, 10, '2025-03-21'),
  next_episode_to_air: ep(3, 1, '2026-11-24'),
  watched_count: 13,
  next_up_season: 2,
  next_up_episode: 5,
};

describe('season counts', () => {
  it('reads episodes per season without specials', () => {
    expect(seasonEpisodes({ seasons: [{ season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 9 }, { season_number: 2, episode_count: 10 }] })).toEqual([9, 10]);
    expect(seasonEpisodes({})).toBeNull();
    expect(airedEpisodes([9, 10], ep(2, 4))).toBe(13);
    expect(airedEpisodes(null, ep(2, 4))).toBeNull();
  });

  it('are stored by the daily check', () => {
    const { update } = diffSeries({ tmdb_id: 1, number_of_seasons: 2, last_episode_to_air: null }, { number_of_seasons: 2, seasons: [{ season_number: 1, episode_count: 8 }] }, 'X');
    expect(update.season_episodes).toEqual([8]);
  });
});

describe('catchUpPlan', () => {
  it('plans weekly sessions on Saturdays until the premiere', () => {
    const plan = catchUpPlan(severance, '2026-10-14')!;
    expect(plan).toMatchObject({ season: 3, premiere: '2026-11-24', days: 41, behind: 6, perWeek: 1 });
    expect(plan.sessions.map((s) => [s.date, sessionLabel(s)])).toEqual([
      ['2026-10-17', 'S02E05'],
      ['2026-10-24', 'S02E06'],
      ['2026-10-31', 'S02E07'],
      ['2026-11-07', 'S02E08'],
      ['2026-11-14', 'S02E09'],
      ['2026-11-21', 'S02E10'],
    ]);
    expect(catchUpLine('Severance', plan)).toBe('Severance Staffel 3 startet in 41 Tagen. Du bist 6 Folgen hinten – mit 1 Folge pro Woche bist du rechtzeitig dran.');
  });

  it('asks for more per week when time is short and crosses seasons', () => {
    const plan = catchUpPlan({ ...severance, watched_count: 7, next_up_season: 1, next_up_episode: 8 }, '2026-11-09')!;
    expect(plan).toMatchObject({ behind: 12, perWeek: 6 });
    expect(plan.sessions.map(sessionLabel)).toEqual(['S01E08–S02E04', 'S02E05–S02E10']);
  });

  it('only for an announced first episode, in time, with something to catch up', () => {
    expect(catchUpPlan({ ...severance, watched_count: 19 }, '2026-10-14')).toBeNull();
    expect(catchUpPlan({ ...severance, next_episode_to_air: ep(2, 11, '2026-11-24') }, '2026-10-14')).toBeNull();
    expect(catchUpPlan({ ...severance, next_episode_to_air: ep(3, 1, '2027-12-24') }, '2026-10-14')).toBeNull();
    expect(catchUpPlan({ ...severance, next_episode_to_air: ep(3, 1, '2026-10-14') }, '2026-10-14')).toBeNull();
    expect(catchUpPlan({ ...severance, season_episodes: null }, '2026-10-14')).toBeNull();
  });

  it('counts the episodes when the order is unknown', () => {
    const plan = catchUpPlan({ ...severance, next_up_season: 9 }, '2026-10-14')!;
    expect(plan.sessions[0]).toMatchObject({ count: 1, episodes: [] });
    expect(sessionLabel(plan.sessions[0])).toBe('1 Folge');
  });
});

describe('behindSchedule', () => {
  const start = { behind_at_start: 6, per_week: 1, started_on: '2026-10-14' };
  it('nudges only when more than a week behind the plan', () => {
    expect(behindSchedule(start, 6, '2026-10-20')).toBe(false);
    expect(behindSchedule(start, 6, '2026-10-28')).toBe(true); // two weeks in, nothing watched
    expect(behindSchedule(start, 5, '2026-10-28')).toBe(false);
  });
});
