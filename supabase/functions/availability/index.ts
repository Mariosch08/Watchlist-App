// Streaming availability in Switzerland.
//  user: { action: 'scan' }  -> where the titles of the watchlist can be streamed (cached 24 h per title)
//  cron: { action: 'check' } -> availability alerts: notify when a title arrives on a wanted service
import { adminClient } from '../_shared/admin.ts';
import { requireUser } from '../_shared/auth.ts';
import { alertMatches, providersCacheKey, type TitleAvailability } from '../_shared/availability.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronRequest } from '../_shared/cron.ts';
import { mapLimited } from '../_shared/importJob.ts';
import { normalizeProviders, tmdbGet } from '../_shared/tmdb.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

const TTL_MS = 24 * 3_600_000;
const MAX_TITLES = 300;
type Db = ReturnType<typeof adminClient>;

async function providersFor(db: Db, token: string, mediaType: string, id: number, fresh = false) {
  const key = providersCacheKey(mediaType, id);
  if (!fresh) {
    const { data } = await db.from('tmdb_cache').select('data, expires_at').eq('cache_key', key).maybeSingle();
    if (data && (!data.expires_at || new Date(data.expires_at) > new Date())) return data.data;
  }
  const raw = await tmdbGet(`/${mediaType}/${id}/watch/providers`, {}, token, fetch);
  const providers = normalizeProviders(raw);
  await db.from('tmdb_cache').upsert({
    cache_key: key,
    kind: 'other',
    data: providers,
    fetched_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  });
  return providers;
}

async function scan(db: Db, token: string, userId: string) {
  const { data, error } = await db
    .from('watchlist')
    .select('media_type, tmdb_id, title, poster_path, status')
    .eq('user_id', userId)
    .in('status', ['planned', 'watching', 'paused'])
    .order('added_at', { ascending: false })
    .limit(MAX_TITLES + 1);
  if (error) throw error;
  const titles = data.slice(0, MAX_TITLES);
  const items: TitleAvailability[] = [];
  let failed = 0;
  await mapLimited(titles, 8, async (t: any) => {
    try {
      const p = await providersFor(db, token, t.media_type, t.tmdb_id);
      items.push({ media_type: t.media_type, tmdb_id: t.tmdb_id, title: t.title, poster_path: t.poster_path, flatrate: p.flatrate ?? [] });
    } catch (err) {
      failed++;
      console.warn('providers failed', t.media_type, t.tmdb_id, err);
    }
  });
  return { items, limited: data.length > MAX_TITLES, failed };
}

async function checkAlerts(db: Db, token: string) {
  const { data: alerts, error } = await db.from('availability_alerts').select('user_id, media_type, tmdb_id, title, provider_ids').is('notified_at', null);
  if (error) throw error;
  const users = [...new Set(alerts.map((a) => a.user_id))];
  const { data: settings } = users.length
    ? await db.from('user_settings').select('user_id, streaming_providers').in('user_id', users)
    : { data: [] as any[] };
  const servicesOf = new Map((settings ?? []).map((s: any) => [s.user_id, s.streaming_providers ?? []]));
  const titles = new Map<string, any>();
  for (const a of alerts) titles.set(`${a.media_type}:${a.tmdb_id}`, a);
  const fresh = new Map<string, any>();
  await mapLimited([...titles.values()], 6, async (a: any) => {
    fresh.set(`${a.media_type}:${a.tmdb_id}`, await providersFor(db, token, a.media_type, a.tmdb_id, true).catch(() => null));
  });
  let notified = 0;
  for (const a of alerts) {
    const providers = fresh.get(`${a.media_type}:${a.tmdb_id}`);
    if (!providers) continue;
    const wanted = a.provider_ids?.length ? a.provider_ids : servicesOf.get(a.user_id) ?? [];
    const matches = alertMatches(providers.flatrate ?? [], wanted.length ? wanted : null);
    if (!matches.length) continue;
    const names = matches.slice(0, 3).map((p: any) => p.name).join(', ');
    await db.from('notifications').upsert(
      {
        user_id: a.user_id,
        type: 'available',
        title: `„${a.title}“ ist jetzt im Abo verfügbar`,
        body: `Bei ${names}.`,
        data: { media_type: a.media_type, tmdb_id: a.tmdb_id, providers: matches.map((p: any) => p.id) },
        dedupe_key: `available:${a.media_type}:${a.tmdb_id}`,
      },
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    );
    await db.from('availability_alerts').update({ notified_at: new Date().toISOString() }).match({ user_id: a.user_id, media_type: a.media_type, tmdb_id: a.tmdb_id });
    notified++;
  }
  return { alerts: alerts.length, notified };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const token = Deno.env.get('TMDB_API_KEY');
  if (!token) return json(500, { error: 'TMDB_API_KEY is not configured', code: 'TMDB_NOT_CONFIGURED' });
  const db = adminClient();
  try {
    if (isCronRequest(req)) return json(200, await checkAlerts(db, token));
    const user = await requireUser(req);
    if (!user) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'scan') return json(400, { error: 'Unknown action', code: 'INVALID_INPUT' });
    return json(200, await scan(db, token, user.id));
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal error', code: 'INTERNAL' });
  }
});
