import { describe, expect, it } from 'vitest';
import { dayActivity, dayLabel, formatMinutes, isDay, isoWeek, monthGrid, shiftMonth, weekLine, weekSummary, zurichDate } from '../src/lib/calendarMonth.js';

describe('month calendar', () => {
  it('builds a Monday-first grid with ISO weeks', () => {
    const { weeks, from, to } = monthGrid('2026-10', '2026-10-14');
    expect(from).toBe('2026-09-28');
    expect(to).toBe('2026-11-01');
    expect(weeks.map((w) => w.week)).toEqual([40, 41, 42, 43, 44]);
    expect(weeks[0].days[3]).toMatchObject({ iso: '2026-10-01', day: 1, inMonth: true });
    expect(weeks[0].days[0].inMonth).toBe(false);
    expect(weeks[2].days[2]).toMatchObject({ iso: '2026-10-14', isToday: true });
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2026-01-01')).toBe(1);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(isDay('2026-02-30')).toBe(false);
  });

  it('groups episodes by the Zurich day and sums up a week', () => {
    expect(zurichDate('2026-10-10T22:30:00Z')).toBe('2026-10-11');
    const activity = dayActivity({
      views: [{ date: '2026-10-10', title: 'Past Lives', media_type: 'movie', tmdb_id: 1, rating: 9 }],
      episodes: [
        { tmdb_id: 7, watched_at: '2026-10-10T19:00:00Z' },
        { tmdb_id: 7, watched_at: '2026-10-10T20:00:00Z' },
        { tmdb_id: 7, watched_at: '2026-10-10T22:30:00Z' },
      ],
      seriesTitles: new Map([[7, 'Severance']]),
      musicDays: [
        { day: '2026-10-10', plays: 60, minutes: 210, top_artist: 'Phoebe Bridgers', top_artist_plays: 20 },
        { day: '2026-10-11', plays: 30, minutes: 105, top_artist: 'Big Thief', top_artist_plays: 25 },
        { day: '2026-10-09', plays: 40, minutes: 140, top_artist: 'Phoebe Bridgers', top_artist_plays: 10 },
        { day: '2026-10-08', plays: 0, minutes: 0, top_artist: null },
      ],
      concerts: [{ artist: 'Phoenix', city: 'Zürich', local_date: '2026-10-10' }],
      today: '2026-10-14',
    });
    expect(activity.get('2026-10-10')).toMatchObject({ episodes: [{ title: 'Severance', count: 2 }], music: { minutes: 210, topArtist: 'Phoebe Bridgers' } });
    expect(activity.get('2026-10-11').episodes).toEqual([{ tmdb_id: 7, title: 'Severance', count: 1 }]);
    expect(activity.has('2026-10-08')).toBe(false);
    const week = monthGrid('2026-10', '2026-10-14').weeks[1];
    const summary = weekSummary(week, activity);
    expect(summary).toEqual({ minutes: 455, estimated: false, topArtist: 'Phoebe Bridgers', watchedCount: 1, episodeCount: 3 });
    expect(weekLine(week, summary)).toBe('KW 41 · 7 h 35 min Musik · Top: Phoebe Bridgers · 1 Titel, 3 Folgen');
    expect(weekLine(week, weekSummary(week, new Map()))).toBeNull();
    expect(dayLabel('2026-10-10', activity.get('2026-10-10'))).toBe('Samstag, 10. Oktober: 3 geschaut, 1 Konzert, 3 h 30 min Musik, Top-Artist Phoebe Bridgers');
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(120)).toBe('2 h');
  });
});
