import { describe, expect, it } from 'vitest';
import { agendaToIcs, buildAgenda } from '../supabase/functions/_shared/agenda.ts';

const today = '2026-10-14';
const ep = (season_number: number, episode_number: number, air_date: string | null = null) => ({ season_number, episode_number, name: null, air_date });

const input = {
  series: [
    {
      tmdb_id: 95396,
      title: 'Severance',
      watch_status: 'watching',
      season_episodes: [9, 10],
      last_episode_to_air: ep(2, 10, '2025-03-21'),
      next_episode_to_air: ep(3, 1, '2026-11-24'),
      watched_count: 18,
      next_up_season: 2,
      next_up_episode: 10,
    },
    { tmdb_id: 1, title: 'Dropped', watch_status: 'dropped', season_episodes: [5], last_episode_to_air: null, next_episode_to_air: ep(1, 2, '2026-10-20'), watched_count: 0 },
  ],
  watchlist: [
    { media_type: 'movie', tmdb_id: 7, title: 'Dune 3', status: 'planned', release_date: '2026-10-30' },
    { media_type: 'movie', tmdb_id: 8, title: 'Seen', status: 'completed', release_date: '2026-10-30' },
  ],
  concerts: [
    { event_id: 'tm1', artist: 'Phoenix', name: 'Phoenix Live', venue: 'Volkshaus', city: 'Zürich', local_date: '2026-10-21', starts_at: '2026-10-21T18:00:00Z', url: 'https://t/1' },
    { event_id: 'tm2', artist: 'Big Thief', venue: 'Kaufleuten', city: 'Zürich', local_date: '2026-11-02' },
  ],
  going: [
    { event_id: 'tm1', artist: 'Phoenix', local_date: '2026-10-21' },
    { event_id: null, artist: 'Local Band', city: 'Bern', local_date: '2026-10-25' },
  ],
  albums: [{ external_id: 'mb1', title: 'Rot', subtitle: 'Hovvdy', release_date: '2026-10-31' }],
  rotation: [{ month: '2026-11', provider_id: 8, provider: 'Netflix', price: 18.9, minutes: 600, titles: [{ key: 'movie:9', title: 'Roma' }] }],
};

describe('buildAgenda', () => {
  it('puts everything with a date in one ordered list', () => {
    const items = buildAgenda(input, { today, days: 30 });
    expect(items.map((i) => [i.date, i.kind, i.title, i.detail])).toEqual([
      ['2026-10-17', 'catchup', 'Severance', 'S02E10 schauen – Staffel 3 startet am 24.11.2026'],
      ['2026-10-21', 'concert', 'Phoenix', 'Du gehst hin · Volkshaus, Zürich · Phoenix Live'],
      ['2026-10-25', 'concert', 'Local Band', 'Du gehst hin · Bern'],
      ['2026-10-30', 'movie', 'Dune 3', 'Filmstart'],
      ['2026-10-31', 'album', 'Hovvdy – Rot', 'Erscheint heute'],
      ['2026-11-01', 'rotation', 'Abo starten: Netflix (1 Titel geplant)', 'CHF 18.90 für 11/2026.\nRoma'],
      ['2026-11-02', 'concert', 'Big Thief', 'Kaufleuten, Zürich'],
    ]);
  });

  it('reaches further for the subscription, without dismissed catch-ups', () => {
    const items = buildAgenda({ ...input, dismissedCatchUps: new Set(['95396:3']) }, { today, days: 60 });
    expect(items.some((i) => i.kind === 'catchup')).toBe(false);
    expect(items.find((i) => i.kind === 'episode')).toMatchObject({ date: '2026-11-24', detail: 'S03E01 · Staffelstart' });
    expect(items.filter((i) => i.kind === 'rotation').map((i) => i.title)).toEqual(['Abo starten: Netflix (1 Titel geplant)', 'Netflix bis 30.11. kündigen – noch 1 Titel offen']);
  });

  it('turns into calendar events with app links; concerts I go to get a time', () => {
    const events = agendaToIcs(buildAgenda(input, { today, days: 30 }), 'https://app.example/');
    expect(events[0]).toMatchObject({ summary: 'Severance: S02E10 schauen', description: 'S02E10 schauen – Staffel 3 startet am 24.11.2026\nhttps://app.example/title/tv/95396' });
    expect(events[1]).toMatchObject({ summary: 'Konzert: Phoenix', start: '2026-10-21T18:00:00Z', url: 'https://t/1' });
    expect(events.find((e) => e.summary.startsWith('Album'))!.summary).toBe('Album: Hovvdy – Rot');
  });
});
