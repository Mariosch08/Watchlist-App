import { describe, expect, it } from 'vitest';
import { buildIcs, foldLine } from '../supabase/functions/_shared/ics.ts';
import { diffSeries, episodeCode } from '../supabase/functions/_shared/series.ts';
import { normalizeSeason, normalizeSeriesInfo } from '../supabase/functions/_shared/tmdb.ts';

const ep = (s: number, e: number, air_date = '2026-10-01', name = 'Folge') => ({ season_number: s, episode_number: e, air_date, name });

describe('diffSeries', () => {
  const raw = { name: 'Severance', status: 'Returning Series', number_of_seasons: 3, number_of_episodes: 29, last_episode_to_air: ep(2, 10), next_episode_to_air: ep(3, 1, '2027-01-17') };

  it('announces nothing on the first check, only stores the state', () => {
    const { update, events } = diffSeries({ tmdb_id: 95396, number_of_seasons: null, last_episode_to_air: null }, raw, 'Severance');
    expect(events).toEqual([]);
    expect(update).toMatchObject({ tmdb_status: 'Returning Series', number_of_seasons: 3, last_episode_to_air: { season_number: 2, episode_number: 10 } });
  });

  it('reports a new season with its start date and a newly aired episode', () => {
    const prev = { tmdb_id: 95396, number_of_seasons: 2, last_episode_to_air: ep(2, 9) };
    const { events } = diffSeries(prev, raw, 'Severance');
    expect(events.map((e) => e.type)).toEqual(['new_season', 'new_episode']);
    expect(events[0]).toMatchObject({ key: 'season:95396:3', title: 'Severance: Staffel 3 angekündigt', body: 'Start am 17.01.2027.' });
    expect(events[1]).toMatchObject({ key: 'episode:95396:S02E10', title: 'Severance: neue Folge S02E10' });
  });

  it('is quiet when nothing changed', () => {
    const prev = { tmdb_id: 95396, number_of_seasons: 3, last_episode_to_air: ep(2, 10) };
    expect(diffSeries(prev, raw, 'Severance').events).toEqual([]);
  });

  it('formats episode codes', () => {
    expect(episodeCode({ season_number: 1, episode_number: 5 })).toBe('S01E05');
  });
});

describe('series details', () => {
  it('drops specials, sorts seasons and normalizes episodes', () => {
    const info = normalizeSeriesInfo({
      status: 'Ended',
      seasons: [{ season_number: 2, episode_count: 8 }, { season_number: 0, episode_count: 3 }, { season_number: 1, episode_count: 9, name: 'Staffel 1' }],
      next_episode_to_air: null,
      last_episode_to_air: ep(2, 8),
    });
    expect(info.seasons.map((s) => s.season_number)).toEqual([1, 2]);
    expect(info.seasons[1].name).toBe('Staffel 2');
    expect(info.tmdb_status).toBe('Ended');
    const season = normalizeSeason({ season_number: 1, episodes: [{ episode_number: 1, name: 'Pilot', air_date: '2022-02-17', runtime: 57 }] });
    expect(season.episodes[0]).toEqual({ episode_number: 1, name: 'Pilot', overview: null, air_date: '2022-02-17', runtime: 57, still_path: null });
  });
});

describe('ics', () => {
  it('builds valid all-day events with escaping and CRLF', () => {
    const ics = buildIcs([{ uid: 'ep-1@x', date: '2026-12-31', summary: 'Dune, Teil 2; Premiere' }], { name: 'Watchlist', now: new Date('2026-10-13T08:00:00Z') });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101');
    expect(ics).toContain('SUMMARY:Dune\\, Teil 2\\; Premiere');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('builds timed events in UTC with a duration', () => {
    const ics = buildIcs([{ uid: 'night-1@x', date: '2026-10-18', start: '2026-10-18T18:00:00Z', minutes: 150, summary: 'Filmabend' }], {
      name: 'Filmabend',
      now: new Date('2026-10-13T08:00:00Z'),
    });
    expect(ics).toContain('DTSTART:20261018T180000Z\r\nDTEND:20261018T203000Z');
    expect(ics).toContain('TRANSP:OPAQUE');
    expect(ics).not.toContain('VALUE=DATE');
  });

  it('folds long lines at 75 octets', () => {
    const folded = foldLine('SUMMARY:' + 'ä'.repeat(60));
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
