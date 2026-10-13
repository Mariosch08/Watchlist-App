// Builds the "Für dich" feed: daily for everybody (cron) or on demand for one user (action 'refresh').
import { adminClient } from '../_shared/admin.ts';
import { requireUser } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronRequest } from '../_shared/cron.ts';
import { BRIDGE, type Composer, composerCandidates, pickComposer, scoreSource } from '../_shared/bridge.ts';
import { mapLimited } from '../_shared/importJob.ts';
import { type Candidate, deriveWeights, effectiveWeights, type Kind, rankCandidates, type RatedItem, topGenres } from '../_shared/scoring.ts';
import { genreIds, tmdbGet, TMDB_LANGUAGE, WATCH_REGION } from '../_shared/tmdb.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

const REFRESH_COOLDOWN_MS = 10 * 60_000;
const FEED_TTL_MS = 14 * 86_400_000;
const BACKFILL_PER_RUN = 30;
const COMPOSER_TTL_MS = 60 * 86_400_000;
const COMPOSER_MISS_TTL_MS = 30 * 86_400_000;
type Db = ReturnType<typeof adminClient>;

// Memoizes TMDb list requests within one run (shared by all users).
function pools(token: string) {
  const memo = new Map<string, Promise<any>>();
  const get = (path: string, params: Record<string, unknown>) => {
    const key = path + JSON.stringify(params);
    if (!memo.has(key)) memo.set(key, tmdbGet(path, { language: TMDB_LANGUAGE, ...params }, token, fetch).catch(() => null));
    return memo.get(key)!;
  };
  const list = async (kind: Kind, path: string, params: Record<string, unknown>, source: string): Promise<Candidate[]> => {
    const res = await get(path, params);
    return (res?.results ?? [])
      .filter((r: any) => Number.isInteger(r.id) && !r.adult)
      .map((r: any) => ({
        media_type: kind,
        tmdb_id: r.id,
        title: r.title ?? r.name ?? '',
        original_title: r.original_title ?? r.original_name ?? null,
        poster_path: r.poster_path ?? null,
        release_date: r.release_date || r.first_air_date || null,
        vote_average: r.vote_average ?? null,
        vote_count: r.vote_count ?? 0,
        genre_ids: genreIds(r),
        popularity: r.popularity ?? 0,
        sources: [source],
      }));
  };
  return { get, list };
}

async function readAll(db: Db, userId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('watchlist')
      .select('media_type, tmdb_id, title, status, my_rating, rated_at, genre_ids')
      .eq('user_id', userId)
      .order('media_type')
      .order('tmdb_id')
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

// Older rows were stored without genres: fill some in per run (rated titles first).
async function backfillGenres(db: Db, userId: string, rows: any[], token: string) {
  const missing = rows.filter((r) => !r.genre_ids?.length).sort((a, b) => (b.my_rating ?? 0) - (a.my_rating ?? 0)).slice(0, BACKFILL_PER_RUN);
  await mapLimited(missing, 4, async (r) => {
    const raw = await tmdbGet(`/${r.media_type}/${r.tmdb_id}`, { language: TMDB_LANGUAGE }, token, fetch).catch(() => null);
    if (!raw) return;
    r.genre_ids = genreIds(raw);
    await db.from('watchlist').update({ genre_ids: r.genre_ids }).match({ user_id: userId, media_type: r.media_type, tmdb_id: r.tmdb_id });
  });
}

// Score Bridge: which of my artists also write film music? (TMDb person search, cached for everybody.)
async function myComposers(db: Db, userId: string, p: ReturnType<typeof pools>): Promise<Composer[]> {
  const { data: artists } = await db
    .from('music_artists')
    .select('artist_key, name, playcount, affinity')
    .eq('user_id', userId)
    .gte('affinity', BRIDGE.minAffinity)
    .order('affinity', { ascending: false })
    .limit(BRIDGE.artists);
  if (!artists?.length) return [];
  const keys = artists.map((a) => `composer:${a.artist_key}`.slice(0, 200));
  const { data: cached } = await db.from('tmdb_cache').select('cache_key, data, expires_at').in('cache_key', keys);
  const hit = new Map((cached ?? []).filter((c) => !c.expires_at || new Date(c.expires_at) > new Date()).map((c) => [c.cache_key, c.data]));
  const found: Composer[] = [];
  await mapLimited(artists, 4, async (a) => {
    const key = `composer:${a.artist_key}`.slice(0, 200);
    let person = hit.get(key) as { id: number | null; name?: string } | undefined;
    if (!person) {
      const res = await p.get('/search/person', { query: a.name, include_adult: false });
      if (res == null) return; // TMDb hiccup: try again next run
      const match = pickComposer(res, { key: a.artist_key });
      person = { id: match?.id ?? null, name: match?.name };
      await db.from('tmdb_cache').upsert({
        cache_key: key,
        kind: 'mapping',
        data: person,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + (match ? COMPOSER_TTL_MS : COMPOSER_MISS_TTL_MS)).toISOString(),
      });
    }
    if (person.id) found.push({ person_id: person.id, name: a.name, plays: a.playcount, affinity: a.affinity });
  });
  return found.sort((x, y) => y.affinity - x.affinity).slice(0, BRIDGE.composers);
}

async function buildFeed(db: Db, userId: string, token: string, p: ReturnType<typeof pools>, genreNames: Record<Kind, Record<string, string>>) {
  const rows = await readAll(db, userId);
  await backfillGenres(db, userId, rows, token);
  const [{ data: taste }, { data: settings }, { data: tombstones }, { data: disliked }] = await Promise.all([
    db.from('taste_profile').select('genre_weights_movie, genre_weights_tv, rejected_ids').eq('user_id', userId).maybeSingle(),
    db.from('user_settings').select('streaming_providers').eq('user_id', userId).maybeSingle(),
    db.from('watchlist_tombstones').select('media_type, tmdb_id').eq('user_id', userId),
    db.from('feed').select('type, external_id').eq('user_id', userId).in('status', ['disliked', 'added']),
  ]);
  const items = rows as RatedItem[];
  const weights = {
    movie: effectiveWeights(deriveWeights(items, 'movie'), taste?.genre_weights_movie ?? {}),
    tv: effectiveWeights(deriveWeights(items, 'tv'), taste?.genre_weights_tv ?? {}),
  };
  const excluded = new Set<string>([
    ...rows.map((r) => `${r.media_type}:${r.tmdb_id}`),
    ...(taste?.rejected_ids ?? []),
    ...(tombstones ?? []).map((t: any) => `${t.media_type}:${t.tmdb_id}`),
    ...(disliked ?? []).map((f: any) => `${f.type}:${f.external_id}`),
  ]);

  const since = (years: number) => new Date(Date.now() - years * 365 * 86_400_000).toISOString().slice(0, 10);
  const sources: Promise<Candidate[]>[] = [
    p.list('movie', '/movie/upcoming', { region: WATCH_REGION }, 'upcoming'),
    p.list('movie', '/movie/now_playing', { region: WATCH_REGION }, 'now_playing'),
    p.list('tv', '/tv/on_the_air', {}, 'on_the_air'),
  ];
  for (const kind of ['movie', 'tv'] as Kind[]) {
    const genres = topGenres(weights[kind]);
    if (genres.length) {
      sources.push(
        p.list(kind, `/discover/${kind}`, {
          with_genres: genres.join('|'),
          sort_by: 'popularity.desc',
          'vote_count.gte': 50,
          [kind === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte']: since(3),
        }, 'discover'),
      );
    }
    const providers: number[] = settings?.streaming_providers ?? [];
    if (providers.length) {
      sources.push(
        p.list(kind, `/discover/${kind}`, {
          watch_region: WATCH_REGION,
          with_watch_providers: providers.join('|'),
          with_watch_monetization_types: 'flatrate|free|ads',
          sort_by: 'popularity.desc',
          'vote_count.gte': 100,
          ...(genres.length ? { with_genres: genres.join('|') } : {}),
        }, 'providers'),
      );
    }
  }
  const becauseTitles = new Map<string, { title: string; rating: number }>();
  const favourites = rows
    .filter((r) => (r.my_rating ?? 0) >= 8)
    .sort((a, b) => (b.my_rating - a.my_rating) || String(b.rated_at ?? '').localeCompare(String(a.rated_at ?? '')))
    .slice(0, 4);
  for (const f of favourites) {
    const key = `because:${f.media_type}:${f.tmdb_id}`;
    becauseTitles.set(key, { title: f.title, rating: f.my_rating });
    sources.push(p.list(f.media_type, `/${f.media_type}/${f.tmdb_id}/recommendations`, {}, key));
  }
  const composers = await myComposers(db, userId, p).catch((err) => (console.error('composers', err), []));
  for (const c of composers) {
    for (const kind of ['movie', 'tv'] as Kind[]) {
      sources.push(p.get(`/person/${c.person_id}/${kind}_credits`, {}).then((res) => composerCandidates(res, kind, c)));
    }
  }
  const candidates = (await Promise.all(sources)).flat();

  // Provider names for the reason text.
  let providerNames: string[] = [];
  if ((settings?.streaming_providers ?? []).length) {
    const prov = await p.get('/watch/providers/movie', { watch_region: WATCH_REGION });
    const names = new Map((prov?.results ?? []).map((x: any) => [x.provider_id, x.provider_name]));
    providerNames = (settings!.streaming_providers as number[]).map((id) => names.get(id) as string).filter(Boolean);
  }

  const ranked = rankCandidates(candidates, {
    weights,
    excluded,
    becauseTitles,
    providerNames,
    genreNames,
    today: new Date().toISOString().slice(0, 10),
    composers: new Map(composers.map((c) => [scoreSource(c.person_id), { name: c.name, plays: c.plays }])),
  });

  // Replace unanswered suggestions; liked/added/disliked rows stay and block duplicates.
  await db.from('feed').delete().eq('user_id', userId).eq('status', 'new').in('type', ['movie', 'tv']);
  if (!ranked.length) return 0;
  const expires = new Date(Date.now() + FEED_TTL_MS).toISOString();
  const { error } = await db.from('feed').upsert(
    ranked.map(({ c, score, reason, reasons, fresh, composer }) => ({
      user_id: userId,
      type: c.media_type,
      external_id: String(c.tmdb_id),
      title: c.title.slice(0, 300),
      subtitle: c.original_title && c.original_title !== c.title ? c.original_title.slice(0, 300) : null,
      image_url: c.poster_path,
      release_date: c.release_date,
      source: composer ? 'score_bridge' : c.sources[0].startsWith('because:') ? 'recommendations' : c.sources[0],
      score,
      reason,
      data: { media_type: c.media_type, tmdb_id: c.tmdb_id, genre_ids: c.genre_ids, vote_average: c.vote_average, reasons, fresh, ...(composer ? { composer } : {}) },
      expires_at: expires,
    })),
    { onConflict: 'user_id,type,external_id', ignoreDuplicates: true },
  );
  if (error) throw error;
  return ranked.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const token = Deno.env.get('TMDB_API_KEY');
  if (!token) return json(500, { error: 'TMDB_API_KEY is not configured', code: 'TMDB_NOT_CONFIGURED' });
  const db = adminClient();

  let userIds: string[];
  if (isCronRequest(req)) {
    const { data, error } = await db.from('profiles').select('id');
    if (error) return json(500, { error: error.message });
    userIds = data.map((r) => r.id);
  } else {
    const user = await requireUser(req);
    if (!user) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
    const { data: latest } = await db
      .from('feed')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('status', 'new')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && Date.now() - Date.parse(latest.created_at) < REFRESH_COOLDOWN_MS) {
      return json(429, { error: 'Feed was refreshed recently', code: 'RATE_LIMITED' });
    }
    userIds = [user.id];
  }

  const p = pools(token);
  const [mg, tg] = await Promise.all([p.get('/genre/movie/list', {}), p.get('/genre/tv/list', {})]);
  const toMap = (list: any) => Object.fromEntries((list?.genres ?? []).map((g: any) => [String(g.id), g.name]));
  const genreNames = { movie: toMap(mg), tv: toMap(tg) };

  let suggestions = 0;
  let failed = 0;
  for (const id of userIds) {
    try {
      suggestions += await buildFeed(db, id, token, p, genreNames);
    } catch (err) {
      failed++;
      console.error('feed failed', id, err);
    }
  }
  return json(200, { users: userIds.length, suggestions, failed });
});
