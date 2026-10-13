// Subscribable calendar (ICS): the same agenda as the Calendar page – new episodes, film starts, concerts,
// announced albums, catch-up sessions and subscription reminders – for the next 180 days.
// Auth: secret token in the URL (user_settings.calendar_token), because calendar apps cannot log in.
import { adminClient } from '../_shared/admin.ts';
import { agendaToIcs, buildAgenda } from '../_shared/agenda.ts';
import { buildIcs } from '../_shared/ics.ts';
import { sanitizePlan } from '../_shared/rotation.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/?$/, '/');

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID.test(token)) return new Response('Not found', { status: 404 });
  const db = adminClient();
  const { data: settings } = await db.from('user_settings').select('user_id').eq('calendar_token', token).maybeSingle();
  if (!settings) return new Response('Not found', { status: 404 });
  const userId = settings.user_id;
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: series }, { data: titles }, { data: concerts }, { data: going }, { data: albums }, { data: plan }, { data: catchups }, { data: watched }] = await Promise.all([
    db.from('series_progress').select('tmdb_id, next_episode_to_air, last_episode_to_air, season_episodes, next_up_season, next_up_episode').eq('user_id', userId),
    db.from('watchlist').select('media_type, tmdb_id, title, status, release_date').eq('user_id', userId).neq('status', 'dropped'),
    db.from('concerts').select('event_id, artist, name, venue, city, local_date, starts_at, url').eq('user_id', userId).gte('local_date', today),
    db.from('concert_log').select('event_id, artist, venue, city, local_date').eq('user_id', userId).gte('local_date', today),
    db.from('feed').select('external_id, title, subtitle, release_date').eq('user_id', userId).eq('type', 'album').neq('status', 'disliked').gt('release_date', today),
    db.from('rotation_plans').select('months').eq('user_id', userId).maybeSingle(),
    db.from('catchup_plans').select('tmdb_id, season_number').eq('user_id', userId).eq('dismissed', true),
    db.from('watched_episodes').select('tmdb_id').eq('user_id', userId).limit(20000),
  ]);
  const byKey = new Map((titles ?? []).map((t) => [`${t.media_type}:${t.tmdb_id}`, t]));
  const watchedCount = new Map<number, number>();
  for (const w of watched ?? []) watchedCount.set(w.tmdb_id, (watchedCount.get(w.tmdb_id) ?? 0) + 1);

  const items = buildAgenda(
    {
      series: (series ?? []).map((s) => ({
        ...s,
        title: byKey.get(`tv:${s.tmdb_id}`)?.title ?? 'Serie',
        watch_status: byKey.get(`tv:${s.tmdb_id}`)?.status ?? null,
        watched_count: watchedCount.get(s.tmdb_id) ?? 0,
      })),
      watchlist: titles ?? [],
      concerts: concerts ?? [],
      going: going ?? [],
      albums: albums ?? [],
      rotation: sanitizePlan(plan?.months),
      done: new Set((titles ?? []).filter((t) => t.status === 'completed').map((t) => `${t.media_type}:${t.tmdb_id}`)),
      dismissedCatchUps: new Set((catchups ?? []).map((c) => `${c.tmdb_id}:${c.season_number}`)),
    },
    { today, days: 180 },
  );
  return new Response(buildIcs(agendaToIcs(items, appUrl), { name: 'Watchlist' }), {
    headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=3600' },
  });
});
