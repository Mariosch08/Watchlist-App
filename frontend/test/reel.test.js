import { describe, expect, it } from 'vitest';
import { onThisDay, reelMonths, yearMusic, yearsAgo } from '../src/lib/reel.js';
import { reviewSvg } from '../src/lib/stats.js';

const views = [
  { media_type: 'movie', tmdb_id: 666277, title: 'Past Lives', rating: 9, date: '2026-03-04' },
  { media_type: 'movie', tmdb_id: 2, title: 'Okay', rating: 6, date: '2026-03-10' },
  { media_type: 'tv', tmdb_id: 3, title: 'Severance', rating: null, date: '2026-03-20' },
  { media_type: 'movie', tmdb_id: 4, title: 'Last Year', rating: 8, date: '2025-10-14' },
];
const musicMonths = [
  { month: '2026-03-01', plays: 700, minutes: 2460, minutes_estimated: false, top_artist: 'Phoenix', top_artist_plays: 90, top_track: 'Lisztomania', top_track_artist: 'Phoenix' },
  { month: '2026-01-01', plays: 300, minutes: 1050, minutes_estimated: true, top_artist: 'Big Thief', top_artist_plays: 40 },
  { month: '2025-10-01', plays: 500, minutes: 1750, minutes_estimated: true, top_artist: 'Phoenix', top_artist_plays: 70 },
];
const concerts = [
  { artist: 'Phoenix', venue: 'Volkshaus', city: 'Zürich', local_date: '2026-03-12' },
  { artist: 'Future Gig', city: 'Bern', local_date: '2026-11-01' },
];

describe('Life Reel', () => {
  it('sums up each month across watching, listening and concerts', () => {
    const months = reelMonths({ views, musicMonths, concerts, year: 2026, today: '2026-10-14' });
    expect(months.map((m) => m.label)).toEqual(['März', 'Januar']);
    expect(months[0]).toMatchObject({
      summary: '2 Filme, 1 Serie, 41 h Musik, Phoenix live in Zürich',
      top: { title: 'Past Lives' },
      topTrack: { name: 'Lisztomania', artist: 'Phoenix' },
      topArtist: 'Phoenix',
    });
    expect(months[1].summary).toBe('ca. 18 h Musik');
  });

  it('remembers this day in earlier years, for films, concerts and music', () => {
    const memories = onThisDay({ views, musicMonths, concerts: [...concerts, { artist: 'Old Gig', local_date: '2024-10-14', city: 'Basel' }], today: '2026-10-14' });
    expect(memories.map((m) => [m.kind, m.years, m.title])).toEqual([
      ['music', 1, 'Phoenix'],
      ['view', 1, 'Last Year'],
      ['concert', 2, 'Old Gig'],
    ]);
    expect(yearsAgo(1)).toBe('Vor einem Jahr');
    expect(yearsAgo(3)).toBe('Vor 3 Jahren');
  });

  it('adds music to the year in review', () => {
    const music = yearMusic({ musicMonths, concerts, year: 2026, today: '2026-10-14' });
    expect(music).toEqual({ hours: 59, estimated: true, topArtist: 'Phoenix', concerts: 1 });
    expect(yearMusic({ musicMonths: [], concerts: [], year: 2026, today: '2026-10-14' })).toBeNull();
    const stats = { year: 2026, titles: 3, hours: 5, cinema: 0, months: Array(12).fill(1), bestMonth: 2, favourites: [], genres: [] };
    const svg = reviewSvg(stats, { music });
    expect(svg).toContain('Mein Jahr 2026');
    expect(svg).toContain('Stunden Musik (ca.)');
    expect(svg).toContain('Meistgehört: Phoenix');
    expect(reviewSvg(stats)).toContain('Mein Filmjahr 2026');
  });
});
