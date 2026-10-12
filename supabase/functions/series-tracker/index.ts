// Daily: refresh all tracked series from TMDb and notify users about new seasons/episodes.
// Called by .github/workflows/cron.yml with the x-cron-secret header.
import { adminClient } from '../_shared/admin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronRequest } from '../_shared/cron.ts';
import { mapLimited } from '../_shared/importJob.ts';
import { diffSeries } from '../_shared/series.ts';
import { tmdbGet, TMDB_LANGUAGE } from '../_shared/tmdb.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (!isCronRequest(req)) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
  const token = Deno.env.get('TMDB_API_KEY');
  if (!token) return json(500, { error: 'TMDB_API_KEY is not configured', code: 'TMDB_NOT_CONFIGURED' });
  const db = adminClient();

  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('series_progress')
      .select('user_id, tmdb_id, number_of_seasons, last_episode_to_air')
      .order('tmdb_id')
      .order('user_id')
      .range(from, from + 999);
    if (error) return json(500, { error: error.message });
    rows.push(...data);
    if (data.length < 1000) break;
  }
  const bySeries = new Map<number, any[]>();
  for (const r of rows) bySeries.set(r.tmdb_id, [...(bySeries.get(r.tmdb_id) ?? []), r]);

  let notifications = 0;
  let failed = 0;
  await mapLimited([...bySeries.keys()], 4, async (tmdbId) => {
    try {
      const raw = await tmdbGet(`/tv/${tmdbId}`, { language: TMDB_LANGUAGE }, token, fetch);
      if (!raw) return;
      for (const row of bySeries.get(tmdbId)!) {
        const { update, events } = diffSeries(row, raw, raw.name ?? 'Serie');
        await db.from('series_progress').update(update).match({ user_id: row.user_id, tmdb_id: tmdbId });
        if (events.length) {
          const { error } = await db.from('notifications').upsert(
            events.map((e) => ({ user_id: row.user_id, type: e.type, title: e.title, body: e.body, data: e.data, dedupe_key: e.key })),
            { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
          );
          if (error) throw error;
          notifications += events.length;
        }
      }
    } catch (err) {
      failed++;
      console.error('series check failed', tmdbId, err);
    }
  });
  return json(200, { series: bySeries.size, notifications, failed });
});
