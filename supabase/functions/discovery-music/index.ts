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
  isoDaysAgo,
  lastfmArtistInfo,
  lastfmMonth,
  monthBounds,
  monthsToFill,
  statsfmMonth,
  lastfmGet,
  lastfmLovedArtists,
  lastfmSimilar,
  lastfmTopArtists,
  mergeArtists,
  mergeSimilar,
  MUSIC,
  musicBrainzClient,
  nicheOf,
  normalizeEvents,
  normalizeReleaseGroups,
  notifyWorthy,
  pickConcertArtists,
  pickSeeds,
  rankAlbums,
  releaseQuery,
  type SimilarHit,
  spotifyAlbums,
  spotifyArtists,
  SPOTIFY_SCOPES,
  spotifySearchUrl,
  statsfmGet,
  statsfmStreamStats,
  statsfmTopArtists,
  ticketmasterUrl,
  weighList,
} from '../_shared/music.ts';
import { mapLimited } from '../_shared/importJob.ts';
import { HttpError, normalizeComposers, tmdbGet } from '../_shared/tmdb.ts';
import { BRIDGE, composersToDiscover, type FavouriteFilm, pickComposerAlbums } from '../_shared/bridge.ts';
import { lastfmRecentArtists, MOOD_WINDOW_HOURS, moodFromListening, type RecentArtist, statsfmRecentArtists } from '../_shared/mood.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

const REFRESH_COOLDOWN_MS = 10 * 60_000;
const FEED_TTL_MS = 30 * 86_400_000;
const CACHE_TTL_MS = 30 * 86_400_000;
const SIMILAR_TTL_MS = 7 * 86_400_000;
const RUN_BUDGET_MS = 100_000; // Edge Functions stop after 150 s: no new user after this
const DAY_MS = 86_400_000;
const COMPOSERS_TTL_MS = 90 * DAY_MS;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Db = ReturnType<typeof adminClient>;
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const env = {
  lastfm: Deno.env.get('LASTFM_API_KEY') ?? '',
  tmdb: Deno.env.get('TMDB_API_KEY') ?? '',
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

// Shared by all users of one run: MusicBrainz releases per artist id, Ticketmaster events per artist.
interface RunCache {
  mb: ReturnType<typeof musicBrainzClient>;
  releases: Map<string, Album[]>;
  events: Map<string, Concert[]>;
}

// Collects artists from every connected source and period (last weeks, months, all time), plus loved
// tracks and followed artists. One failing source does not hide the others; if nothing could be read
// at all, the first error is reported (e.g. "profile is private").
async function collectArtists(db: Db, userId: string, src: Sources) {
  const lists: Artist[][] = [];
  const errors: unknown[] = [];
  let spotify: string | null = null;
  let listening: ReturnType<typeof statsfmStreamStats> = null;
  const attempt = async (fn: () => Promise<void>) => fn().catch((err) => void errors.push(err));
  const optional = <T,>(p: Promise<T>) => p.catch(() => null);
  await Promise.all([
    src.lastfm && env.lastfm
      ? attempt(async () => {
          const top = (period: string, limit: number) => lastfmGet('user.gettopartists', { user: src.lastfm!, period, limit }, env.lastfm);
          const [mid, short, long, loved] = await Promise.all([
            top('6month', 200),
            optional(top('1month', 100)),
            optional(top('overall', 300)),
            optional(lastfmGet('user.getlovedtracks', { user: src.lastfm!, limit: 500 }, env.lastfm)),
          ]);
          lists.push(
            weighList(lastfmTopArtists(mid), 'mid'),
            weighList(lastfmTopArtists(short), 'short'),
            weighList(lastfmTopArtists(long), 'long'),
            lastfmLovedArtists(loved),
          );
        })
      : null,
    src.statsfm
      ? attempt(async () => {
          const name = encodeURIComponent(src.statsfm!);
          const top = (range: string, offset = 0) =>
            statsfmGet(`/users/${name}/top/artists?range=${range}&limit=50${offset ? `&offset=${offset}` : ''}`).then((json) => statsfmTopArtists(json, offset));
          const [mid, mid2, short, long, long2, stats] = await Promise.all([
            top('months'),
            optional(top('months', 50)),
            optional(top('weeks')),
            optional(top('lifetime')),
            optional(top('lifetime', 50)),
            optional(statsfmGet(`/users/${name}/streams/stats?range=months`)),
          ]);
          lists.push(weighList([...mid, ...(mid2 ?? [])], 'mid'), weighList(short ?? [], 'short'), weighList([...(long ?? []), ...(long2 ?? [])], 'long'));
          listening = statsfmStreamStats(stats);
        })
      : null,
    src.spotifyEnc && env.spotifyClient
      ? attempt(async () => {
          spotify = await spotifySession(db, userId, src.spotifyEnc!);
          if (!spotify) return;
          const top = (range: string) => optional(spotifyGet(`/me/top/artists?time_range=${range}&limit=50`, spotify!));
          const [short, mid, long] = await Promise.all([top('short_term'), top('medium_term'), top('long_term')]);
          lists.push(weighList(spotifyArtists(short), 'short'), weighList(spotifyArtists(mid), 'mid'), weighList(spotifyArtists(long), 'long'));
          // Followed artists: up to 200, page by page.
          let after = '';
          for (let page = 0; page < 4; page++) {
            const res = await optional(spotifyGet(`/me/following?type=artist&limit=50${after ? `&after=${encodeURIComponent(after)}` : ''}`, spotify!));
            lists.push(spotifyArtists(res, { followed: true, offset: page * 50 + 1000 }));
            after = res?.artists?.cursors?.after ?? '';
            if (!after || !/^[A-Za-z0-9]{1,40}$/.test(after)) break;
          }
        })
      : null,
  ]);
  const artists = mergeArtists(lists).slice(0, MUSIC.maxArtists);
  if (!artists.length && errors.length) throw errors[0];
  return { artists, spotify: spotify as string | null, listening: listening as ReturnType<typeof statsfmStreamStats> };
}

// Last.fm artist.getinfo for ids (MusicBrainz), size (listeners) and genre tags. Cached for 30 days and
// shared by all users; uncached lookups are spread over several runs, strongest artists first.
async function enrichArtists(db: Db, artists: Artist[]) {
  if (env.lastfm && artists.length) {
    const cacheKey = (a: Artist) => `lfm:${a.key}`.slice(0, 200);
    const cached = new Map<string, any>();
    for (let i = 0; i < artists.length; i += 100) {
      const { data } = await db.from('tmdb_cache').select('cache_key, data, expires_at').in('cache_key', artists.slice(i, i + 100).map(cacheKey));
      for (const c of data ?? []) if (!c.expires_at || new Date(c.expires_at) > new Date()) cached.set(c.cache_key, c.data);
    }
    const todo = artists.filter((a) => !cached.has(cacheKey(a))).slice(0, MUSIC.enrichPerRun);
    await mapLimited(todo, 4, async (a) => {
      const res = await lastfmGet('artist.getinfo', a.mbid ? { mbid: a.mbid } : { artist: a.name, autocorrect: 1 }, env.lastfm).catch(() => null);
      const info = res ? lastfmArtistInfo(res) : { mbid: null, listeners: null, tags: [] };
      cached.set(cacheKey(a), info);
      await db.from('tmdb_cache').upsert({
        cache_key: cacheKey(a),
        kind: 'mapping',
        data: info,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + (res ? CACHE_TTL_MS : DAY_MS)).toISOString(),
      });
    });
    for (const a of artists) {
      const info = cached.get(cacheKey(a));
      if (!info) continue;
      a.mbid ??= info.mbid ?? null;
      a.listeners ??= info.listeners ?? null;
      if (!a.genres.length) a.genres = info.tags ?? [];
    }
  }
  for (const a of artists) a.niche = nicheOf(a);
}

// Similar artists of a few diverse seeds (Last.fm, cached for a week), not ones I already listen to.
async function findSimilar(db: Db, artists: Artist[]) {
  if (!env.lastfm) return [];
  const seeds = pickSeeds(artists);
  const results = await mapLimited(seeds, 4, async (seed) => {
    const key = `similar:${seed.key}`.slice(0, 200);
    const { data: hit } = await db.from('tmdb_cache').select('data, expires_at').eq('cache_key', key).maybeSingle();
    let similar: SimilarHit[];
    if (hit && (!hit.expires_at || new Date(hit.expires_at) > new Date())) {
      similar = hit.data?.similar ?? [];
    } else {
      const res = await lastfmGet('artist.getsimilar', seed.mbid ? { mbid: seed.mbid, limit: 30 } : { artist: seed.name, limit: 30, autocorrect: 1 }, env.lastfm).catch(() => null);
      similar = lastfmSimilar(res);
      if (res) {
        await db.from('tmdb_cache').upsert({ cache_key: key, kind: 'other', data: { similar }, fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + SIMILAR_TTL_MS).toISOString() });
      }
    }
    return { seed, similar };
  });
  return mergeSimilar(results, new Set(artists.map((a) => a.key)));
}

// New and announced releases for these artist ids. Each id is asked once per run, even across users.
async function releasesFor(run: RunCache, mbids: string[], from: string, to: string) {
  const missing = mbids.filter((id) => !run.releases.has(id));
  for (let i = 0; i < missing.length; i += MUSIC.mbChunk) {
    const chunk = missing.slice(i, i + MUSIC.mbChunk);
    const found: Album[] = [];
    for (let page = 0; page < MUSIC.mbPages; page++) {
      const res = await run.mb(releaseQuery(chunk, from, to), page * 100).catch((err) => (console.error('musicbrainz', err), null));
      found.push(...normalizeReleaseGroups(res, from));
      if (!res || (res.count ?? 0) <= (page + 1) * 100) break;
    }
    for (const id of chunk) run.releases.set(id, found.filter((a) => a.artist_mbid === id || a.credit_mbids?.includes(id)));
  }
  return [...new Map(mbids.flatMap((id) => run.releases.get(id) ?? []).map((a) => [a.key, a])).values()];
}

// Score Bridge, the other way: the music of films I rated 9 or 10 (TMDb credits, then Last.fm top albums).
async function favouriteFilmMusic(db: Db, userId: string, artists: Artist[], excluded: Set<string>) {
  if (!env.tmdb || !env.lastfm) return [];
  const { data: films } = await db
    .from('watchlist')
    .select('media_type, tmdb_id, title, my_rating')
    .eq('user_id', userId)
    .gte('my_rating', BRIDGE.favouriteRating)
    .order('rated_at', { ascending: false })
    .limit(BRIDGE.favourites);
  if (!films?.length) return [];
  const withComposers: FavouriteFilm[] = await mapLimited(films, 4, async (f) => {
    const key = `composers:${f.media_type}:${f.tmdb_id}`;
    const { data: hit } = await db.from('tmdb_cache').select('data, expires_at').eq('cache_key', key).maybeSingle();
    let composers = hit && (!hit.expires_at || new Date(hit.expires_at) > new Date()) ? hit.data?.composers : null;
    if (!composers) {
      const path = f.media_type === 'tv' ? `/tv/${f.tmdb_id}/aggregate_credits` : `/movie/${f.tmdb_id}/credits`;
      const res = await tmdbGet(path, {}, env.tmdb, fetch).catch(() => null);
      composers = res ? normalizeComposers(f.media_type === 'tv' ? { aggregate_credits: res } : { credits: res }, f.media_type) : [];
      if (res) {
        await db.from('tmdb_cache').upsert({ cache_key: key, kind: 'other', data: { composers }, fetched_at: new Date().toISOString(), expires_at: new Date(Date.now() + COMPOSERS_TTL_MS).toISOString() });
      }
    }
    return { ...f, composers };
  });
  const known = new Set(artists.filter((a) => a.affinity >= 0.5).map((a) => a.key));
  const picks = composersToDiscover(withComposers, known);
  const rows = await mapLimited(picks, 3, async ({ name, film, known: isKnown }) => {
    const res = await lastfmGet('artist.gettopalbums', { artist: name, limit: 10, autocorrect: 1 }, env.lastfm).catch(() => null);
    return pickComposerAlbums(res, name, film.title)
      .filter((album) => !excluded.has(album.key))
      .map((album, i) => ({
        album,
        film,
        score: 30 + film.my_rating - i * 2,
        reason: `Du hast „${film.title}“ mit ${film.my_rating} bewertet – die Musik ist von ${name}${isKnown ? ', auch in deiner Sammlung' : ''}`.slice(0, 300),
      }));
  });
  return rows.flat();
}

// Life Reel: listening per month – stats.fm with real minutes if connected, otherwise Last.fm plays.
async function fillMusicMonths(db: Db, userId: string, src: { lastfm: string | null; statsfm: string | null }) {
  if (!src.statsfm && !(src.lastfm && env.lastfm)) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const { data: stored } = await db.from('music_months').select('month').eq('user_id', userId);
  let filled = 0;
  for (const month of monthsToFill((stored ?? []).map((r) => r.month), today)) {
    const { from, to } = monthBounds(month);
    let row = null;
    if (src.statsfm) {
      const name = encodeURIComponent(src.statsfm);
      const range = `after=${from}&before=${to}`;
      const [stats, artists, tracks] = await Promise.all([
        statsfmGet(`/users/${name}/streams/stats?${range}`).catch(() => null),
        statsfmGet(`/users/${name}/top/artists?${range}&limit=1`).catch(() => null),
        statsfmGet(`/users/${name}/top/tracks?${range}&limit=1`).catch(() => null),
      ]);
      row = statsfmMonth(stats, artists, tracks);
    }
    if (!row && src.lastfm && env.lastfm) {
      const range = { user: src.lastfm, from: Math.floor(from / 1000), to: Math.floor(to / 1000) };
      const [recent, artists, tracks] = await Promise.all([
        lastfmGet('user.getrecenttracks', { ...range, limit: 1 }, env.lastfm).catch(() => null),
        lastfmGet('user.getweeklyartistchart', range, env.lastfm).catch(() => null),
        lastfmGet('user.getweeklytrackchart', range, env.lastfm).catch(() => null),
      ]);
      row = lastfmMonth(recent, artists, tracks);
    }
    if (!row) continue;
    const { error } = await db.from('music_months').upsert({ user_id: userId, month, ...row, updated_at: new Date().toISOString() });
    if (!error) filled++;
  }
  return filled;
}

async function buildMusic(db: Db, userId: string, run: RunCache) {
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
  await fillMusicMonths(db, userId, { lastfm: settings?.lastfm_username ?? null, statsfm: settings?.statsfm_username ?? null }).catch((err) =>
    console.error('music months', err),
  );
  if (!artists.length) return { artists: 0, albums: 0, concerts: 0 };
  await enrichArtists(db, artists);
  const today = new Date().toISOString().slice(0, 10);
  const from = isoDaysAgo(today, MUSIC.releaseDays);
  const to = isoDaysAgo(today, -MUSIC.upcomingDays);

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
      affinity: a.affinity,
      trend: a.trend,
      niche: a.niche,
      listeners: a.listeners,
      popularity: a.popularity,
      loved: a.loved,
      genres: a.genres,
      updated_at: new Date().toISOString(),
    })),
  );
  if (artistsError) throw artistsError;

  const similar = await findSimilar(db, artists);

  // Releases: MusicBrainz for every artist with an id, Spotify for my strongest Spotify artists.
  const mbids = [...new Set([...artists.map((a) => a.mbid), ...similar.map((s) => s.mbid)].filter((x): x is string => Boolean(x)))];
  const albums: Album[] = await releasesFor(run, mbids, from, to);
  if (spotify) {
    for (const a of artists.filter((x) => x.spotify_id && !x.mbid).concat(artists.filter((x) => x.spotify_id && x.mbid)).slice(0, 25)) {
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

  const excludedIds = new Set([...rejected, ...(answered ?? []).map((r) => r.external_id), ...ranked.map((r) => r.album.key)]);
  const bridge = await favouriteFilmMusic(db, userId, artists, excludedIds).catch((err) => (console.error('film music', err), []));

  await db.from('feed').delete().eq('user_id', userId).eq('type', 'album').eq('status', 'new');
  if (bridge.length) {
    const expires = new Date(Date.now() + FEED_TTL_MS).toISOString();
    const { error } = await db.from('feed').upsert(
      bridge.map(({ album: a, film, score, reason }) => ({
        user_id: userId,
        type: 'album',
        external_id: a.key,
        title: a.title,
        subtitle: a.artist,
        image_url: a.image_url,
        release_date: null,
        source: 'score_bridge',
        score,
        reason,
        data: {
          artist: a.artist,
          kind: 'Album',
          genre_ids: [],
          spotify_url: spotifySearchUrl(`${a.artist} ${a.title}`),
          lastfm_url: a.url,
          bridge: { media_type: film.media_type, tmdb_id: film.tmdb_id, title: film.title, rating: film.my_rating },
        },
        expires_at: expires,
      })),
      { onConflict: 'user_id,type,external_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }
  if (ranked.length) {
    const expires = new Date(Date.now() + FEED_TTL_MS).toISOString();
    const { error } = await db.from('feed').upsert(
      ranked.map(({ album: a, score, reason, fresh, upcoming, small }) => ({
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
        data: { artist: a.artist, kind: a.kind, genre_ids: a.tags, spotify_url: a.spotify_url, fresh, upcoming, small },
        expires_at: expires,
      })),
      { onConflict: 'user_id,type,external_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }

  // Notifications for fresh releases of favourites and of small artists I like (at most 3 per run).
  const notify = ranked.filter(notifyWorthy).slice(0, 3);
  if (notify.length) {
    await db.from('notifications').upsert(
      notify.map(({ album: a, reason }) => ({
        user_id: userId,
        type: 'new_release',
        title: `${a.kind === 'Album' ? 'Neues Album' : a.kind === 'EP' ? 'Neue EP' : 'Neue Single'}: ${a.artist} – ${a.title}`.slice(0, 200),
        body: capitalize(reason.split(' – ').slice(1).join(' – ')) || 'Jetzt auf „Musik“ ansehen.',
        data: { path: '/music', spotify_url: a.spotify_url },
        dedupe_key: `release:${a.key}`,
      })),
      { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true },
    );
  }

  const concerts = env.ticketmaster ? await findConcerts(db, userId, artists, today, run) : 0;
  return { artists: artists.length, albums: ranked.length, concerts };
}

async function findConcerts(db: Db, userId: string, artists: Artist[], today: string, run: RunCache) {
  const found: Concert[] = [];
  for (const a of pickConcertArtists(artists)) {
    if (!run.events.has(a.key)) {
      const res = await fetch(ticketmasterUrl(a.name, env.ticketmaster, today)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      run.events.set(a.key, normalizeEvents(res, a));
      await sleep(250); // Ticketmaster: max 5 requests per second
    }
    found.push(...run.events.get(a.key)!);
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
    await notifyConcertBuddies(db, userId, unique);
  }
  return unique.length;
}

// Concert buddies: friends who also listen to the artist a lot. Only when both share their music.
async function notifyConcertBuddies(db: Db, userId: string, concerts: Concert[]) {
  const { data: me } = await db.from('user_settings').select('share_music_with_friends').eq('user_id', userId).maybeSingle();
  if (!me?.share_music_with_friends) return;
  const { data: links } = await db.from('friendships').select('requester_id, addressee_id').eq('status', 'accepted').or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  const friends = (links ?? []).map((f) => (f.requester_id === userId ? f.addressee_id : f.requester_id));
  if (!friends.length) return;
  const [{ data: sharing }, { data: profiles }] = await Promise.all([
    db.from('user_settings').select('user_id').in('user_id', friends).eq('share_music_with_friends', true),
    db.from('profiles').select('id, display_name').in('id', friends),
  ]);
  const ids = (sharing ?? []).map((s) => s.user_id);
  if (!ids.length) return;
  const { data: overlap } = await db
    .from('music_artists')
    .select('user_id, artist_key')
    .in('user_id', ids)
    .in('artist_key', [...new Set(concerts.map((c) => c.artist_key))])
    .gte('affinity', 0.25);
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? 'Jemand']));
  const rows = concerts.flatMap((c) =>
    (overlap ?? [])
      .filter((o) => o.artist_key === c.artist_key)
      .map((o) => ({
        user_id: userId,
        type: 'concert',
        title: `Konzert-Buddy: ${nameOf.get(o.user_id)} hört ${c.artist} auch oft`.slice(0, 200),
        body: `${c.artist} spielt am ${c.local_date.split('-').reverse().join('.')} in ${c.city ?? 'der Schweiz'}.`,
        data: { path: '/music', url: c.url, friend_id: o.user_id },
        dedupe_key: `concert-buddy:${c.event_id}:${o.user_id}`,
      })),
  );
  if (rows.length) await db.from('notifications').upsert(rows.slice(0, 5), { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true });
}

// ---- Tonight's mood from the last hours of listening ---------------------------------------------

const MOOD_TTL_MS = 15 * 60_000;

async function listeningMood(db: Db, userId: string) {
  const { data: settings } = await db.from('user_settings').select('lastfm_username, statsfm_username, music_mood').eq('user_id', userId).maybeSingle();
  if (!settings?.music_mood) return { mood: null, off: true };
  if (!settings.lastfm_username && !settings.statsfm_username) return { mood: null, reason: 'NO_SOURCE' };
  const cacheKey = `mood:${userId}`;
  const { data: hit } = await db.from('tmdb_cache').select('data, expires_at').eq('cache_key', cacheKey).maybeSingle();
  if (hit && hit.expires_at && new Date(hit.expires_at) > new Date()) return hit.data;

  const now = Date.now();
  const since = now - MOOD_WINDOW_HOURS * 3_600_000;
  let recent: RecentArtist[] = [];
  if (settings.lastfm_username && env.lastfm) {
    const res = await lastfmGet('user.getrecenttracks', { user: settings.lastfm_username, from: Math.floor(since / 1000), limit: 200 }, env.lastfm).catch(() => null);
    recent = lastfmRecentArtists(res, now);
  }
  if (!recent.length && settings.statsfm_username) {
    const res = await statsfmGet(`/users/${encodeURIComponent(settings.statsfm_username)}/streams/recent?limit=100`).catch(() => null);
    recent = statsfmRecentArtists(res, since);
  }
  // Tags: my stored genres first (Spotify/stats.fm/Last.fm), then the shared Last.fm cache, then a few lookups.
  const top = recent.slice(0, 8);
  const tags = new Map<string, string[]>();
  if (top.length) {
    const { data: mine } = await db.from('music_artists').select('artist_key, genres').eq('user_id', userId).in('artist_key', top.map((a) => a.key));
    for (const m of mine ?? []) if (m.genres?.length) tags.set(m.artist_key, m.genres);
    const missing = top.filter((a) => !tags.has(a.key));
    const { data: cached } = missing.length
      ? await db.from('tmdb_cache').select('cache_key, data').in('cache_key', missing.map((a) => `lfm:${a.key}`.slice(0, 200)))
      : { data: [] as any[] };
    for (const c of cached ?? []) if (c.data?.tags?.length) tags.set(c.cache_key.slice(4), c.data.tags);
    if (env.lastfm) {
      await mapLimited(missing.filter((a) => !tags.has(a.key)).slice(0, 4), 4, async (a) => {
        const res = await lastfmGet('artist.getinfo', { artist: a.name, autocorrect: 1 }, env.lastfm).catch(() => null);
        if (!res) return;
        const info = lastfmArtistInfo(res);
        tags.set(a.key, info.tags);
        await db.from('tmdb_cache').upsert({ cache_key: `lfm:${a.key}`.slice(0, 200), kind: 'mapping', data: info, fetched_at: new Date().toISOString(), expires_at: new Date(now + CACHE_TTL_MS).toISOString() });
      });
    }
  }
  const result = { mood: moodFromListening(recent, (a) => tags.get(a.key) ?? []), plays: recent.reduce((n, a) => n + a.plays, 0) };
  await db.from('tmdb_cache').upsert({ cache_key: cacheKey, kind: 'other', data: result, fetched_at: new Date().toISOString(), expires_at: new Date(now + MOOD_TTL_MS).toISOString() });
  return result;
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
      // Stalest first, so users skipped for lack of time come first in the next run.
      const { data: done } = await db.from('music_artists').select('user_id, updated_at').eq('rank', 1);
      const updated = new Map((done ?? []).map((r) => [r.user_id, Date.parse(r.updated_at)]));
      userIds = [...new Set([...(lf ?? []), ...(sf ?? []), ...(sp ?? [])].map((r) => r.user_id))].sort((x, y) => (updated.get(x) ?? 0) - (updated.get(y) ?? 0));
    } else {
      const user = await requireUser(req);
      if (!user) return json(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' });
      const body = await req.json().catch(() => ({}));
      if (body?.action === 'spotify-connect') return await connectSpotify(db, user.id, body);
      if (body?.action === 'mood') return json(200, await listeningMood(db, user.id));
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

    const run: RunCache = { mb: musicBrainzClient(), releases: new Map(), events: new Map() };
    const started = Date.now();
    const total = { users: userIds.length, artists: 0, albums: 0, concerts: 0, failed: 0, remaining: 0 };
    for (const id of userIds) {
      if (Date.now() - started > RUN_BUDGET_MS) {
        total.remaining++; // the cron calls again
        continue;
      }
      try {
        const r = await buildMusic(db, id, run);
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
