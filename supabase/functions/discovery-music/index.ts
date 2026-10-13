// Music discovery: new releases of my artists and similar ones (Last.fm / stats.fm + MusicBrainz, optional Spotify),
// concerts in Switzerland (Ticketmaster, optional). Daily for everybody (cron) or on demand ('refresh').
// 'spotify-connect' exchanges a PKCE code and stores the refresh token encrypted.
import { adminClient } from '../_shared/admin.ts';
import { requireUser } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronRequest } from '../_shared/cron.ts';
import { decryptText, deriveKey, encryptionSecret, encryptText } from '../_shared/crypto.ts';
import {
  type Album,
  type Artist,
  type Concert,
  isMbid,
  isoDaysAgo,
  lastfmGet,
  lastfmSimilar,
  lastfmTopArtists,
  mergeArtists,
  mergeSimilar,
  MUSIC,
  musicBrainzClient,
  normalizeEvents,
  normalizeReleaseGroups,
  rankAlbums,
  releaseQuery,
  spotifyAlbums,
  spotifyArtists,
  SPOTIFY_SCOPES,
  statsfmGet,
  statsfmStreamStats,
  statsfmTopArtists,
  ticketmasterUrl,
} from '../_shared/music.ts';
import { mapLimited } from '../_shared/importJob.ts';
import { HttpError } from '../_shared/tmdb.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

const REFRESH_COOLDOWN_MS = 10 * 60_000;
const FEED_TTL_MS = 30 * 86_400_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Db = ReturnType<typeof adminClient>;

const env = {
  lastfm: Deno.env.get('LASTFM_API_KEY') ?? '',
  spotifyClient: Deno.env.get('SPOTIFY_CLIENT_ID') ?? '',
  ticketmaster: Deno.env.get('TICKETMASTER_API_KEY') ?? '',
};

// ---- Spotify ------------------------------------------------------------------------------------

async function spotifyToken(params: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.spotifyClient, ...params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(res.status === 400 ? 400 : 502, body.error_description ?? 'Spotify token request failed', body.error === 'invalid_grant' ? 'SPOTIFY_REVOKED' : 'SPOTIFY_AUTH_FAILED');
  return body as { access_token: string; refresh_token?: string; scope?: string };
}

async function spotifyGet(path: string, accessToken: string) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401 || res.status === 403) throw new HttpError(res.status, 'Spotify denied access', 'SPOTIFY_REVOKED');
  if (!res.ok) throw new HttpError(502, `Spotify ${path} failed (${res.status})`, 'SPOTIFY_UNAVAILABLE');
  return res.json();
}

async function connectSpotify(db: Db, userId: string, body: any) {
  if (!env.spotifyClient) return json(501, { error: 'Spotify is not configured', code: 'SPOTIFY_NOT_CONFIGURED' });
  const { code, verifier, redirect_uri } = body ?? {};
  const valid =
    typeof code === 'string' && code.length <= 1000 &&
    typeof verifier === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier) &&
    typeof redirect_uri === 'string' && redirect_uri.length <= 300 && /^(https:\/\/|http:\/\/127\.0\.0\.1[:/])/.test(redirect_uri);
  if (!valid) return json(400, { error: 'Invalid request', code: 'INVALID_INPUT' });
  const token = await spotifyToken({ grant_type: 'authorization_code', code, redirect_uri, code_verifier: verifier });
  if (!token.refresh_token) throw new HttpError(502, 'Spotify returned no refresh token', 'SPOTIFY_AUTH_FAILED');
  const me = await spotifyGet('/me', token.access_token);
  const key = await deriveKey(encryptionSecret());
  const { error } = await db.from('spotify_connections').upsert({
    user_id: userId,
    spotify_user_id: String(me.id).slice(0, 100),
    display_name: me.display_name ? String(me.display_name).slice(0, 100) : null,
    refresh_token_enc: await encryptText(token.refresh_token, key),
    connected_at: new Date().toISOString(),
  });
  if (error) throw error;
  return json(200, { display_name: me.display_name ?? me.id, scope: token.scope ?? SPOTIFY_SCOPES });
}

// Returns an access token, stores a rotated refresh token, and drops the connection if Spotify revoked it.
async function spotifySession(db: Db, userId: string, encrypted: string) {
  const key = await deriveKey(encryptionSecret());
  try {
    const token = await spotifyToken({ grant_type: 'refresh_token', refresh_token: await decryptText(encrypted, key) });
    if (token.refresh_token) {
      await db.from('spotify_connections').update({ refresh_token_enc: await encryptText(token.refresh_token, key) }).eq('user_id', userId);
    }
    return token.access_token;
  } catch (err) {
    if (err instanceof HttpError && err.code === 'SPOTIFY_REVOKED') {
      await db.from('spotify_connections').delete().eq('user_id', userId);
      return null;
    }
    if (err instanceof DOMException || (err instanceof Error && /ciphertext|decrypt/i.test(err.message))) {
      await db.from('spotify_connections').delete().eq('user_id', userId); // key rotated: user reconnects
      return null;
    }
    throw err;
  }
}

// ---- Per-user run -------------------------------------------------------------------------------

interface Sources {
  lastfm: string | null;
  statsfm: string | null;
  spotifyEnc: string | null;
}

// Collects top artists from every connected source. One failing source does not hide the others;
// if nothing could be read at all, the first error is reported (e.g. "profile is private").
async function collectArtists(db: Db, userId: string, src: Sources) {
  const lists: Artist[][] = [];
  const errors: unknown[] = [];
  let spotify: string | null = null;
  let listening: ReturnType<typeof statsfmStreamStats> = null;
  const attempt = async (fn: () => Promise<void>) => fn().catch((err) => void errors.push(err));
  await Promise.all([
    src.lastfm && env.lastfm
      ? attempt(async () => {
          lists.push(lastfmTopArtists(await lastfmGet('user.gettopartists', { user: src.lastfm!, period: '6month', limit: 40 }, env.lastfm)));
        })
      : null,
    src.statsfm
      ? attempt(async () => {
          const name = encodeURIComponent(src.statsfm!);
          const [top, stats] = await Promise.all([
            statsfmGet(`/users/${name}/top/artists?range=months&limit=50`),
            statsfmGet(`/users/${name}/streams/stats?range=months`).catch(() => null),
          ]);
          lists.push(statsfmTopArtists(top));
          listening = statsfmStreamStats(stats);
        })
      : null,
    src.spotifyEnc && env.spotifyClient
      ? attempt(async () => {
          spotify = await spotifySession(db, userId, src.spotifyEnc!);
          if (!spotify) return;
          const [top, followed] = await Promise.all([
            spotifyGet('/me/top/artists?time_range=medium_term&limit=30', spotify).catch(() => null),
            spotifyGet('/me/following?type=artist&limit=50', spotify).catch(() => null),
          ]);
          lists.push(spotifyArtists(top), spotifyArtists(followed, { followed: true }).map((a) => ({ ...a, rank: a.rank + 30 })));
        })
      : null,
  ]);
  const artists = mergeArtists(lists).slice(0, 60);
  if (!artists.length && errors.length) throw errors[0];
  return { artists, spotify: spotify as string | null, listening: listening as ReturnType<typeof statsfmStreamStats> };
}

// stats.fm and Spotify only know names: look up MusicBrainz ids via Last.fm (cached, misses for 30 days).
async function resolveMbids(db: Db, artists: Artist[]) {
  const missing = artists.filter((a) => !a.mbid).slice(0, 30);
  if (!env.lastfm || !missing.length) return;
  const keys = missing.map((a) => `mbid:${a.key}`.slice(0, 200));
  const { data: cached } = await db.from('tmdb_cache').select('cache_key, data, expires_at').in('cache_key', keys);
  const hit = new Map((cached ?? []).filter((c) => !c.expires_at || new Date(c.expires_at) > new Date()).map((c) => [c.cache_key, c.data?.mbid ?? null]));
  await mapLimited(missing, 4, async (a) => {
    const key = `mbid:${a.key}`.slice(0, 200);
    if (hit.has(key)) {
      a.mbid = hit.get(key);
      return;
    }
    const info = await lastfmGet('artist.getinfo', { artist: a.name, autocorrect: 1 }, env.lastfm).catch(() => null);
    const mbid = isMbid(info?.artist?.mbid) ? info.artist.mbid : null;
    a.mbid = mbid;
    await db.from('tmdb_cache').upsert({
      cache_key: key,
      kind: 'mapping',
      data: { mbid },
      fetched_at: new Date().toISOString(),
      expires_at: mbid ? null : new Date(Date.now() + 30 * 86_400_000).toISOString(),
    });
  });
}

async function buildMusic(db: Db, userId: string, mb: ReturnType<typeof musicBrainzClient>) {
  const [{ data: settings }, { data: conn }, { data: taste }, { data: answered }] = await Promise.all([
    db.from('user_settings').select('lastfm_username, statsfm_username').eq('user_id', userId).maybeSingle(),
    db.from('spotify_connections').select('refresh_token_enc').eq('user_id', userId).maybeSingle(),
    db.from('taste_profile').select('genre_weights_music, rejected_ids').eq('user_id', userId).maybeSingle(),
    db.from('feed').select('external_id').eq('user_id', userId).eq('type', 'album').neq('status', 'new'),
  ]);
  const { artists, spotify, listening } = await collectArtists(db, userId, {
    lastfm: settings?.lastfm_username ?? null,
    statsfm: settings?.statsfm_username ?? null,
    spotifyEnc: conn?.refresh_token_enc ?? null,
  });
  if (listening) {
    await db.from('music_stats').upsert({ user_id: userId, source: 'statsfm', ...listening, updated_at: new Date().toISOString() });
  } else if (!settings?.statsfm_username) {
    await db.from('music_stats').delete().eq('user_id', userId);
  }
  if (!artists.length) return { artists: 0, albums: 0, concerts: 0 };
  await resolveMbids(db, artists);
  const today = new Date().toISOString().slice(0, 10);
  const from = isoDaysAgo(today, MUSIC.releaseDays);

  await db.from('music_artists').delete().eq('user_id', userId);
  const { error: artistsError } = await db.from('music_artists').insert(
    artists.map((a) => ({
      user_id: userId,
      artist_key: a.key,
      name: a.name,
      mbid: a.mbid,
      spotify_id: a.spotify_id,
      sources: a.sources,
      rank: a.rank,
      playcount: a.playcount,
      followed: a.followed,
      image_url: a.image_url,
      updated_at: new Date().toISOString(),
    })),
  );
  if (artistsError) throw artistsError;

  // Similar artists of the top few (Last.fm), not ones I already listen to.
  const similar = env.lastfm
    ? mergeSimilar(
        await Promise.all(
          artists.slice(0, MUSIC.similarSeeds).map((a) =>
            lastfmGet('artist.getsimilar', a.mbid ? { mbid: a.mbid, limit: 10 } : { artist: a.name, limit: 10, autocorrect: 1 }, env.lastfm)
              .then((res) => lastfmSimilar(res, a.name))
              .catch(() => []),
          ),
        ),
        new Set(artists.map((a) => a.key)),
      )
    : [];

  // New releases: MusicBrainz for all artists with an id, Spotify for my Spotify artists.
  const albums: Album[] = [];
  const mbids = [...new Set([...artists.map((a) => a.mbid), ...similar.map((s) => s.mbid)].filter((x): x is string => Boolean(x)))];
  for (let i = 0; i < mbids.length; i += MUSIC.mbChunk) {
    const res = await mb(releaseQuery(mbids.slice(i, i + MUSIC.mbChunk), from, today)).catch((err) => (console.error('musicbrainz', err), null));
    albums.push(...normalizeReleaseGroups(res, from));
  }
  if (spotify) {
    for (const a of artists.filter((x) => x.spotify_id).slice(0, 15)) {
      const res = await spotifyGet(`/artists/${a.spotify_id}/albums?include_groups=album,single&market=CH&limit=10`, spotify).catch(() => null);
      albums.push(...spotifyAlbums(res, a, from));
    }
  }

  const rejected = (taste?.rejected_ids ?? []).filter((r: string) => r.startsWith('album:')).map((r: string) => r.slice(6));
  const ranked = rankAlbums(albums, {
    artists,
    similar,
    weights: taste?.genre_weights_music ?? {},
    excluded: new Set([...rejected, ...(answered ?? []).map((r) => r.external_id)]),
    today,
  });

  await db.from('feed').delete().eq('user_id', userId).eq('type', 'album').eq('status', 'new');
  if (ranked.length) {
    const expires = new Date(Date.now() + FEED_TTL_MS).toISOString();
    const { error } = await db.from('feed').upsert(
      ranked.map(({ album: a, score, reason, fresh }) => ({
        user_id: userId,
        type: 'album',
        external_id: a.key,
        title: a.title,
        subtitle: a.artist,
        image_url: a.image_url,
        release_date: a.release_date,
        source: a.source,
        score,
        reason,
        data: { artist: a.artist, kind: a.kind, genre_ids: a.tags, spotify_url: a.spotify_url, fresh },
        expires_at: expires,
      })),
      { onConflict: 'user_id,type,external_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  // One notification per fresh release of a top-10 artist.
  const notify = ranked.filter((r) => r.own && r.fresh && (r.rank ?? 99) <= 10).slice(0, 3);
  if (notify.length) {
    await db.from('notifications').upsert(
      notify.map(({ album: a }) => ({
        user_id: userId,
        type: 'new_release',
        title: `${a.kind === 'Album' ? 'Neues Album' : a.kind === 'EP' ? 'Neue EP' : 'Neue Single'}: ${a.artist} – ${a.title}`.slice(0, 200),
        body: 'Jetzt auf „Musik“ ansehen.',
        data: { path: '/music', spotify_url: a.spotify_url },
        dedupe_key: `release:${a.key}`,
      })),
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    );
  }

  const concerts = env.ticketmaster ? await findConcerts(db, userId, artists, today) : 0;
  return { artists: artists.length, albums: ranked.length, concerts };
}

async function findConcerts(db: Db, userId: string, artists: Artist[], today: string) {
  const found: Concert[] = [];
  for (const a of artists.slice(0, MUSIC.concertArtists)) {
    const res = await fetch(ticketmasterUrl(a.name, env.ticketmaster, today)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    found.push(...normalizeEvents(res, a));
    await sleep(250); // Ticketmaster: max 5 requests per second
  }
  const unique = [...new Map(found.map((c) => [c.event_id, c])).values()];
  await db.from('concerts').delete().eq('user_id', userId);
  if (unique.length) {
    const { error } = await db.from('concerts').insert(unique.map((c) => ({ ...c, user_id: userId, updated_at: new Date().toISOString() })));
    if (error) throw error;
    await db.from('notifications').upsert(
      unique.slice(0, 5).map((c) => ({
        user_id: userId,
        type: 'concert',
        title: `${c.artist} spielt am ${c.local_date.split('-').reverse().join('.')} in ${c.city ?? 'der Schweiz'}`.slice(0, 200),
        body: c.venue ?? null,
        data: { path: '/music', url: c.url },
        dedupe_key: `concert:${c.event_id}`,
      })),
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    );
  }
  return unique.length;
}

// ---- Entry --------------------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const db = adminClient();
  try {
    let userIds: string[];
    if (isCronRequest(req)) {
      const [{ data: lf }, { data: sf }, { data: sp }] = await Promise.all([
        db.from('user_settings').select('user_id').not('lastfm_username', 'is', null),
        db.from('user_settings').select('user_id').not('statsfm_username', 'is', null),
        db.from('spotify_connections').select('user_id'),
      ]);
      userIds = [...new Set([...(lf ?? []), ...(sf ?? []), ...(sp ?? [])].map((r) => r.user_id))];
    } else {
      const user = await requireUser(req);
      if (!user) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
      const body = await req.json().catch(() => ({}));
      if (body?.action === 'spotify-connect') return await connectSpotify(db, user.id, body);
      if (body?.action !== 'refresh') return json(400, { error: 'Unknown action', code: 'INVALID_INPUT' });
      const [{ data: settings }, { data: conn }, { data: latest }] = await Promise.all([
        db.from('user_settings').select('lastfm_username, statsfm_username').eq('user_id', user.id).maybeSingle(),
        db.from('spotify_connections').select('user_id').eq('user_id', user.id).maybeSingle(),
        db.from('music_artists').select('updated_at').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      if (!settings?.lastfm_username && !settings?.statsfm_username && !conn) return json(400, { error: 'No music source connected', code: 'NO_MUSIC_SOURCE' });
      if (settings?.lastfm_username && !env.lastfm && !conn && !settings?.statsfm_username) return json(501, { error: 'LASTFM_API_KEY is not configured', code: 'LASTFM_NOT_CONFIGURED' });
      if (latest && Date.now() - Date.parse(latest.updated_at) < REFRESH_COOLDOWN_MS) {
        return json(429, { error: 'Music was refreshed recently', code: 'RATE_LIMITED' });
      }
      userIds = [user.id];
    }

    const mb = musicBrainzClient();
    const total = { users: userIds.length, artists: 0, albums: 0, concerts: 0, failed: 0 };
    for (const id of userIds) {
      try {
        const r = await buildMusic(db, id, mb);
        total.artists += r.artists;
        total.albums += r.albums;
        total.concerts += r.concerts;
      } catch (err) {
        if (userIds.length === 1 && !isCronRequest(req)) throw err;
        total.failed++;
        console.error('music failed', id, err);
      }
    }
    return json(200, total);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.message, code: err.code });
    console.error(err);
    return json(500, { error: 'Internal error', code: 'INTERNAL' });
  }
});
