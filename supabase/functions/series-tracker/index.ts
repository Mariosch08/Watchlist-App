// Daily: refresh all tracked series from TMDb and notify users about new seasons/episodes.
// Called by .github/workflows/cron.yml with the x-cron-secret header.
import { adminClient } from '../_shared/admin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronRequest } from '../_shared/cron.ts';
import { mapLimited } from '../_shared/importJob.ts';
import { behindSchedule, catchUpPlan, diffSeries } from '../_shared/series.ts';
import { tmdbGet, TMDB_LANGUAGE } from '../_shared/tmdb.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });
type Db = ReturnType<typeof adminClient>;

// Catch-up countdown: remember where the plan started (once per season) and nudge gently, at most weekly,
// when someone falls more than a week behind it.
async function catchUp(db: Db, row: any, update: ReturnType<typeof diffSeries>['update'], title: string, today: string) {
  const next = update.next_episode_to_air;
  if (!next || next.episode_number !== 1 || !next.air_date || next.air_date <= today) return 0;
  const { count } = await db.from('watched_episodes').select('tmdb_id', { count: 'exact', head: true }).match({ user_id: row.user_id, tmdb_id: row.tmdb_id });
  const plan = catchUpPlan({ ...update, tmdb_id: row.tmdb_id, watched_count: count ?? 0, next_up_season: row.next_up_season, next_up_episode: row.next_up_episode }, today);
  if (!plan) return 0;
  const key = { user_id: row.user_id, tmdb_id: row.tmdb_id, season_number: plan.season };
  await db.from('catchup_plans').upsert({ ...key, premiere: plan.premiere, behind_at_start: plan.behind, per_week: plan.perWeek }, { onConflict: 'user_id,tmdb_id,season_number', ignoreDuplicates: true });
  const { data: stored } = await db.from('catchup_plans').select('premiere, behind_at_start, per_week, started_on, dismissed, last_nudged_on').match(key).maybeSingle();
  if (!stored || stored.dismissed) return 0;
  if (stored.premiere !== plan.premiere) await db.from('catchup_plans').update({ premiere: plan.premiere }).match(key);
  const weekSinceNudge = !stored.last_nudged_on || Date.parse(today) - Date.parse(stored.last_nudged_on) >= 7 * 86_400_000;
  if (!behindSchedule(stored, plan.behind, today) || !weekSinceNudge) return 0;
  await db.from('notifications').upsert(
    {
      user_id: row.user_id,
      type: 'catchup',
      title: `${title}: noch ${plan.behind === 1 ? '1 Folge' : `${plan.behind} Folgen`} bis Staffel ${plan.season}`,
      body: `Start in ${plan.days} Tagen – mit ${plan.perWeek} ${plan.perWeek === 1 ? 'Folge' : 'Folgen'} pro Woche schaffst du es noch.`,
      data: { path: `/title/tv/${row.tmdb_id}`, media_type: 'tv', tmdb_id: row.tmdb_id },
      dedupe_key: `catchup:${row.tmdb_id}:${plan.season}:${today}`,
    },
    { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
  );
  await db.from('catchup_plans').update({ last_nudged_on: today }).match(key);
  return 1;
}

Deno.serve(async (req) => {
  if (!isCronRequest(req)) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
  const token = Deno.env.get('TMDB_API_KEY');
  if (!token) return json(500, { error: 'TMDB_API_KEY is not configured', code: 'TMDB_NOT_CONFIGURED' });
  const db = adminClient();

  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('series_progress')
      .select('user_id, tmdb_id, number_of_seasons, last_episode_to_air, next_up_season, next_up_episode')
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
  let nudges = 0;
  let failed = 0;
  const today = new Date().toISOString().slice(0, 10);
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
        nudges += await catchUp(db, row, update, raw.name ?? 'Serie', today).catch((err) => (console.error('catch-up', tmdbId, err), 0));
      }
    } catch (err) {
      failed++;
      console.error('series check failed', tmdbId, err);
    }
  });
  return json(200, { series: bySeries.size, notifications, nudges, failed });
});
