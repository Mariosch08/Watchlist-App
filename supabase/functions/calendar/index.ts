// Subscribable calendar (ICS): upcoming episodes of tracked series, releases of planned movies and concerts of my artists.
// Auth: secret token in the URL (user_settings.calendar_token), because calendar apps cannot log in.
import { adminClient } from '../_shared/admin.ts';
import { buildIcs, type CalendarEvent } from '../_shared/ics.ts';
import { episodeCode } from '../_shared/series.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID.test(token)) return new Response('Not found', { status: 404 });
  const db = adminClient();
  const { data: settings } = await db.from('user_settings').select('user_id').eq('calendar_token', token).maybeSingle();
  if (!settings) return new Response('Not found', { status: 404 });
  const userId = settings.user_id;
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: series }, { data: titles }, { data: concerts }] = await Promise.all([
    db.from('series_progress').select('tmdb_id, next_episode_to_air').eq('user_id', userId),
    db.from('watchlist').select('media_type, tmdb_id, title, status, release_date').eq('user_id', userId).neq('status', 'dropped'),
    db.from('concerts').select('event_id, artist, name, venue, city, local_date, url').eq('user_id', userId).gte('local_date', today),
  ]);
  const nameOf = new Map((titles ?? []).map((t) => [`${t.media_type}:${t.tmdb_id}`, t.title]));
  const events: CalendarEvent[] = [];
  for (const s of series ?? []) {
    const ep = s.next_episode_to_air;
    if (!ep?.air_date || ep.air_date < today || ep.air_date > horizon) continue;
    const title = nameOf.get(`tv:${s.tmdb_id}`) ?? 'Serie';
    events.push({
      uid: `ep-${s.tmdb_id}-${ep.season_number}-${ep.episode_number}@watchlist-app`,
      date: ep.air_date,
      summary: `${title} ${episodeCode(ep)}`,
      description: ep.name ? `Neue Folge: ${ep.name}` : 'Neue Folge',
    });
  }
  for (const t of titles ?? []) {
    if (t.media_type !== 'movie' || t.status !== 'planned' || !t.release_date || t.release_date < today || t.release_date > horizon) continue;
    events.push({ uid: `movie-${t.tmdb_id}@watchlist-app`, date: t.release_date, summary: `Filmstart: ${t.title}`, description: 'Aus deiner Watchlist' });
  }
  for (const c of concerts ?? []) {
    events.push({
      uid: `concert-${c.event_id}@watchlist-app`,
      date: c.local_date,
      summary: `Konzert: ${c.artist}`,
      description: [c.name, [c.venue, c.city].filter(Boolean).join(', ')].filter(Boolean).join('\n'),
      url: c.url ?? undefined,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return new Response(buildIcs(events, { name: 'Watchlist' }), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=3600' },
  });
});
