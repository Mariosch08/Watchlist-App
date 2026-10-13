import { describe, expect, it } from 'vitest';
import { lastfmRecentArtists, moodFromListening, moodOfTag, statsfmRecentArtists } from '../supabase/functions/_shared/mood.ts';

// 2026-10-14 15:00 in Zurich (UTC+2)
const NOW = Date.parse('2026-10-14T13:00:00Z');
const at = (h: number) => Math.floor((NOW - h * 3_600_000) / 1000);
const track = (artist: string, hoursAgo: number | null) => ({ artist: { '#text': artist }, ...(hoursAgo == null ? { '@attr': { nowplaying: 'true' } } : { date: { uts: String(at(hoursAgo)) } }) });

describe('mood rules', () => {
  it('maps tags to moods, the most specific tag first', () => {
    expect(moodOfTag('Indie Folk')).toBe('calm');
    expect(moodOfTag('dream pop')).toBe('epic');
    expect(moodOfTag('pop')).toBe('upbeat');
    expect(moodOfTag('post-rock')).toBe('epic');
    expect(moodOfTag('indie rock')).toBe('energetic');
    expect(moodOfTag('trip-hop')).toBe('dark');
    expect(moodOfTag('hip-hop')).toBe('energetic');
    expect(moodOfTag('dark ambient')).toBe('dark');
    expect(moodOfTag('synthpop')).toBe('upbeat');
    expect(moodOfTag('seen live')).toBeNull();
  });
});

describe('recent listening', () => {
  it('counts plays per artist from Last.fm, including the track playing now', () => {
    const json = { recenttracks: { track: [track('Phoebe Bridgers', null), track('Phoebe Bridgers', 1), track('phoebe bridgers', 2), track('Big Thief', 3), { artist: {} }] } };
    const artists = lastfmRecentArtists(json, NOW);
    expect(artists.map((a) => [a.name, a.plays])).toEqual([
      ['Phoebe Bridgers', 3],
      ['Big Thief', 1],
    ]);
    expect(artists[0].times[0]).toBe(NOW);
    expect(lastfmRecentArtists(null, NOW)).toEqual([]);
  });

  it('only takes stats.fm plays inside the window', () => {
    const json = {
      items: [
        { endTime: new Date(NOW - 3_600_000).toISOString(), track: { artists: [{ name: 'Phoebe Bridgers' }, { name: 'Bo Burnham' }] } },
        { endTime: new Date(NOW - 10 * 3_600_000).toISOString(), track: { artists: [{ name: 'Old' }] } },
        { endTime: 'nonsense', track: { artists: [{ name: 'X' }] } },
      ],
    };
    expect(statsfmRecentArtists(json, NOW - 6 * 3_600_000).map((a) => a.name)).toEqual(['Phoebe Bridgers']);
  });
});

describe('moodFromListening', () => {
  const tags: Record<string, string[]> = { 'phoebe bridgers': ['indie folk', 'singer-songwriter', 'sad'], 'big thief': ['indie folk', 'indie rock'], metallica: ['metal'] };
  const tagsOf = (a: { key: string }) => tags[a.key] ?? [];
  const plays = (list: [string, number][]) =>
    lastfmRecentArtists({ recenttracks: { track: list.flatMap(([name, n]) => Array.from({ length: n }, (_, i) => track(name, 1 + i * 0.2))) } }, NOW);

  it('turns an afternoon of Phoebe Bridgers into quiet dramas under 2 h', () => {
    const mood = moodFromListening(plays([['Phoebe Bridgers', 8], ['Big Thief', 2]]), tagsOf)!;
    expect(mood).toMatchObject({ id: 'calm', maxMinutes: 120, plays: 10, artists: ['Phoebe Bridgers', 'Big Thief'] });
    expect(mood.line).toBe('Heute Nachmittag lief bei dir Phoebe Bridgers in Dauerschleife → ruhige Dramen unter 2 h');
    expect(mood.genres.movie).toContain(18);
  });

  it('names two artists when none dominates', () => {
    expect(moodFromListening(plays([['Phoebe Bridgers', 4], ['Big Thief', 4]]), tagsOf)!.line).toBe(
      'Heute Nachmittag liefen bei dir Phoebe Bridgers und Big Thief → ruhige Dramen unter 2 h',
    );
  });

  it('stays quiet with too little listening, unknown tags or no clear mood', () => {
    expect(moodFromListening(plays([['Phoebe Bridgers', 3]]), tagsOf)).toBeNull();
    expect(moodFromListening(plays([['Unknown', 9]]), tagsOf)).toBeNull();
    expect(moodFromListening(plays([['Phoebe Bridgers', 3], ['Metallica', 3], ['Big Thief', 0]]), () => ['metal'])).toMatchObject({ id: 'energetic' });
    const mixed = { a: ['pop'], b: ['metal'], c: ['jazz'], d: ['post-punk'] } as Record<string, string[]>;
    expect(moodFromListening(plays([['a', 2], ['b', 2], ['c', 2], ['d', 2]]), (x) => mixed[x.key] ?? [])).toBeNull();
  });
});
