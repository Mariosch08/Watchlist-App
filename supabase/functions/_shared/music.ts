// Music discovery: clients and pure helpers for Last.fm, MusicBrainz, Spotify and Ticketmaster.
// No Deno APIs, so the logic is unit-tested in node.
import { HttpError } from './tmdb.ts';

export const MB_USER_AGENT = 'WatchlistApp/1.0 ( https://github.com/mariosch08/Watchlist-App )';
export const MUSIC = {
  releaseDays: 30, // "new" = first released within this many days
  upcomingDays: 60, // announced releases of my artists up to this many days ahead
  freshDays: 7,
  topN: 40,
  perArtist: 2,
  maxArtists: 300, // artists kept per user (long tail included)
  similarSeeds: 12, // artists whose similar artists are looked up
  similarMax: 50,
  mbChunk: 25, // artist ids per MusicBrainz query
  mbPages: 3, // pages of 100 per query
  enrichPerRun: 150, // Last.fm artist.getinfo lookups per user and run (cached for 30 days)
  concertArtists: 20,
  small: 0.5, // niche score from which an artist counts as small
};

type Fetch = typeof fetch;
type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export type MusicSource = 'lastfm' | 'spotify' | 'statsfm';
// short ≈ last 4 weeks, mid ≈ last 6 months, long = years / all time
export type Period = 'short' | 'mid' | 'long';
export const PERIODS: Period[] = ['short', 'mid', 'long'];
export type Trend = 'rising' | 'core' | 'steady' | 'fading';

// How present an artist is in one period: share of my listening, and w = 0.15..1 relative to my top artist (log scale).
export interface Signal {
  share: number;
  w: number;
}

export interface Artist {
  key: string;
  name: string;
  mbid: string | null;
  spotify_id: string | null;
  sources: MusicSource[];
  rank: number; // in a source list: its position; after mergeArtists: 1 = strongest affinity
  playcount: number | null; // plays in the last ~6 months, if a source counts them
  followed: boolean;
  image_url: string | null;
  genres: string[];
  signals: Partial<Record<Period, Signal>>;
  loved: number; // Last.fm loved tracks
  listeners: number | null; // Last.fm listeners worldwide
  popularity: number | null; // Spotify popularity 0..100
  affinity: number; // 0..1, see affinityOf
  trend: Trend | null;
  niche: number | null; // 0 = mainstream .. 1 = very small, see nicheOf
}

export interface SimilarHit {
  key: string;
  name: string;
  mbid: string | null;
  match: number; // 0..1
}

export interface Similar extends SimilarHit {
  because: string[]; // my artists it resembles, strongest first
}

export type ReleaseKind = 'Album' | 'EP' | 'Single';

export interface Album {
  key: string; // feed external_id: MusicBrainz release-group id or 'sp:<spotify album id>'
  title: string;
  artist: string;
  artist_key: string;
  artist_mbid: string | null;
  kind: ReleaseKind;
  release_date: string;
  image_url: string | null;
  tags: string[];
  spotify_url: string | null;
  source: 'musicbrainz' | 'spotify';
  credit_mbids?: string[]; // every credited artist (MusicBrainz)
}

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isMbid = (s: unknown): s is string => typeof s === 'string' && MBID.test(s);

// "Beyoncé", "beyonce" and "BEYONCÉ " are the same artist.
export const artistKey = (name: string) =>
  name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 200);

const releaseKey = (a: { artist_key: string; title: string }) =>
  `${a.artist_key}|${artistKey(a.title.replace(/\s*[([][^)\]]*(edition|deluxe|remaster|version)[^)\]]*[)\]]/gi, ''))}`;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const round = (x: number, digits = 3) => Math.round(x * 10 ** digits) / 10 ** digits;

export const blankArtist = (name: string, source: MusicSource, rank: number): Artist => ({
  key: artistKey(name),
  name: name.trim().slice(0, 200),
  mbid: null,
  spotify_id: null,
  sources: [source],
  rank,
  playcount: null,
  followed: false,
  image_url: null,
  genres: [],
  signals: {},
  loved: 0,
  listeners: null,
  popularity: null,
  affinity: 0,
  trend: null,
  niche: null,
});

export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
export const isoDaysAgo = (today: string, days: number) => new Date(Date.parse(today) - days * 86_400_000).toISOString().slice(0, 10);
export const spotifySearchUrl = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`;
export const lastfmAlbumUrl = (artist: string, title: string) =>
  `https://www.last.fm/music/${encodeURIComponent(artist).replace(/%20/g, '+')}/${encodeURIComponent(title).replace(/%20/g, '+')}`;

// ---- Last.fm ------------------------------------------------------------------------------------

export async function lastfmGet(method: string, params: Record<string, string | number>, key: string, fetchImpl: Fetch = fetch) {
  const url = new URL('https://ws.audioscrobbler.com/2.0/');
  url.search = new URLSearchParams({ method, api_key: key, format: 'json', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) }).toString();
  const res = await fetchImpl(url.toString(), { headers: { 'User-Agent': MB_USER_AGENT } });
  const body = await res.json().catch(() => null);
  if (body?.error === 6) throw new HttpError(404, body.message ?? 'Not found', method.startsWith('user.') ? 'LASTFM_USER_NOT_FOUND' : 'NOT_FOUND');
  if (!res.ok || !body || body.error) throw new HttpError(502, `Last.fm ${method} failed (${res.status})`, 'LASTFM_UNAVAILABLE');
  return body;
}

const asList = (x: unknown) => (Array.isArray(x) ? x : x ? [x] : []);

export function lastfmTopArtists(json: any): Artist[] {
  return asList(json?.topartists?.artist)
    .filter((a: any) => typeof a?.name === 'string' && a.name.trim())
    .map((a: any, i: number) => ({
      ...blankArtist(a.name, 'lastfm', Number(a['@attr']?.rank) || i + 1),
      mbid: isMbid(a.mbid) ? a.mbid : null,
      playcount: Number(a.playcount) || null,
    }));
}

// user.getlovedtracks → one entry per artist with the number of loved tracks.
export function lastfmLovedArtists(json: any): Artist[] {
  const byKey = new Map<string, Artist>();
  for (const t of asList(json?.lovedtracks?.track)) {
    const name = typeof t?.artist?.name === 'string' ? t.artist.name : typeof t?.artist?.['#text'] === 'string' ? t.artist['#text'] : '';
    if (!name.trim()) continue;
    const a = byKey.get(artistKey(name)) ?? { ...blankArtist(name, 'lastfm', 9999), mbid: isMbid(t.artist.mbid) ? t.artist.mbid : null };
    a.loved++;
    byKey.set(a.key, a);
  }
  return [...byKey.values()];
}

// Tags that say nothing about the sound.
const NOISE_TAGS = new Set(['seen live', 'favorites', 'favourites', 'favorite', 'favourite', 'my favorites', 'love', 'awesome', 'beautiful']);

// artist.getinfo → id, size (listeners worldwide) and up to three genre tags.
export function lastfmArtistInfo(json: any) {
  const a = json?.artist;
  const listeners = Number(a?.stats?.listeners);
  return {
    mbid: isMbid(a?.mbid) ? (a.mbid as string) : null,
    listeners: Number.isFinite(listeners) && listeners >= 0 ? Math.min(Math.round(listeners), 2_000_000_000) : null,
    tags: asList(a?.tags?.tag)
      .map((t: any) => String(t?.name ?? '').toLowerCase().trim().slice(0, 40))
      .filter((t: string) => t && !NOISE_TAGS.has(t))
      .slice(0, 3),
  };
}

export function lastfmSimilar(json: any): SimilarHit[] {
  return asList(json?.similarartists?.artist)
    .filter((a: any) => typeof a?.name === 'string' && a.name.trim())
    .map((a: any) => ({
      key: artistKey(a.name),
      name: a.name.trim().slice(0, 200),
      mbid: isMbid(a.mbid) ? a.mbid : null,
      match: clamp01(Number(a.match) || 0),
    }));
}

// Seeds for "similar artists": favourites, plus what is rising right now and small artists –
// those lead to music that the big names would never surface.
export function pickSeeds(artists: Artist[], n = MUSIC.similarSeeds): Artist[] {
  const picked = new Map<string, Artist>();
  const add = (list: Artist[], max: number) => list.slice(0, max).forEach((a) => picked.size < n && picked.set(a.key, a));
  add(artists, Math.ceil(n / 2));
  add(artists.filter((a) => a.trend === 'rising' && !picked.has(a.key)), Math.ceil(n / 4));
  add(artists.filter((a) => (a.niche ?? 0) >= MUSIC.small && !picked.has(a.key)), Math.ceil(n / 4));
  add(artists.filter((a) => !picked.has(a.key)), n);
  return [...picked.values()];
}

// Adds up the evidence: an artist that resembles several of my favourites beats one lucky match.
// Strength = 1 - e^(-2 · Σ match · affinity of the seed); artists I already listen to are dropped.
export function mergeSimilar(results: { seed: Pick<Artist, 'name' | 'affinity'>; similar: SimilarHit[] }[], known: Set<string>, max = MUSIC.similarMax): Similar[] {
  const acc = new Map<string, { hit: SimilarHit; sum: number; by: { name: string; v: number }[] }>();
  for (const { seed, similar } of results) {
    for (const hit of similar) {
      if (!hit.key || known.has(hit.key)) continue;
      const v = hit.match * Math.max(0.2, seed.affinity);
      const entry = acc.get(hit.key) ?? { hit: { ...hit }, sum: 0, by: [] };
      entry.sum += v;
      entry.hit.mbid ??= hit.mbid;
      if (!entry.by.some((b) => b.name === seed.name)) entry.by.push({ name: seed.name, v });
      acc.set(hit.key, entry);
    }
  }
  return [...acc.values()]
    .map(({ hit, sum, by }) => ({
      key: hit.key,
      name: hit.name,
      mbid: hit.mbid,
      match: round(1 - Math.exp(-2 * sum)),
      because: by.sort((a, b) => b.v - a.v).slice(0, 2).map((b) => b.name),
    }))
    .sort((a, b) => b.match - a.match || a.name.localeCompare(b.name))
    .slice(0, max);
}

// ---- MusicBrainz --------------------------------------------------------------------------------

// One Lucene query for many artists; MusicBrainz allows one request per second.
// Singles are included: small artists often release nothing else. Scoring decides what is shown.
export function releaseQuery(mbids: string[], from: string, to: string) {
  return `(${mbids.map((id) => `arid:${id}`).join(' OR ')}) AND firstreleasedate:[${from} TO ${to}] AND (primarytype:album OR primarytype:ep OR primarytype:single)`;
}

// Serializes requests with at least `gapMs` between them (shared by all users of one run).
export function musicBrainzClient(fetchImpl: Fetch = fetch, sleep: Sleep = defaultSleep, now = () => Date.now(), gapMs = 1100) {
  let last = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();
  const request = async (query: string, offset: number) => {
    for (let attempt = 1; ; attempt++) {
      const wait = last + gapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      const url = `https://musicbrainz.org/ws/2/release-group?fmt=json&limit=100${offset ? `&offset=${offset}` : ''}&query=${encodeURIComponent(query)}`;
      const res = await fetchImpl(url, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' } });
      if (res.ok) return res.json();
      if ((res.status === 503 || res.status === 429) && attempt < 3) {
        await sleep(gapMs * 2 * attempt);
        continue;
      }
      throw new HttpError(502, `MusicBrainz failed (${res.status})`, 'MUSICBRAINZ_UNAVAILABLE');
    }
  };
  return (query: string, offset = 0) => {
    const run = queue.then(() => request(query, offset));
    queue = run.catch(() => undefined);
    return run as Promise<any>;
  };
}

const SKIP_SECONDARY = new Set(['compilation', 'live', 'remix', 'dj-mix', 'demo', 'interview', 'spokenword', 'audiobook', 'mixtape/street']);

export function normalizeReleaseGroups(json: any, from: string): Album[] {
  const out: Album[] = [];
  for (const rg of asList(json?.['release-groups'])) {
    const type = rg?.['primary-type'];
    const kind: ReleaseKind | null = type === 'Album' || type === 'EP' || type === 'Single' ? type : null;
    const date = rg?.['first-release-date'];
    if (!kind || !isMbid(rg.id) || typeof rg.title !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? '') || date < from) continue;
    if (asList(rg['secondary-types']).some((t: any) => SKIP_SECONDARY.has(String(t).toLowerCase()))) continue;
    const credits = asList(rg['artist-credit']);
    const artist = credits.map((c: any) => `${c?.name ?? c?.artist?.name ?? ''}${c?.joinphrase ?? ''}`).join('').trim();
    const primary = credits[0]?.artist;
    if (!artist || !primary?.name) continue;
    const tags = asList(rg.tags)
      .filter((t: any) => typeof t?.name === 'string')
      .sort((a: any, b: any) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 3)
      .map((t: any) => t.name.toLowerCase().slice(0, 40));
    out.push({
      key: rg.id,
      title: rg.title.slice(0, 300),
      artist: artist.slice(0, 300),
      artist_key: artistKey(primary.name),
      artist_mbid: isMbid(primary.id) ? primary.id : null,
      kind,
      release_date: date,
      image_url: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
      tags,
      spotify_url: spotifySearchUrl(`${primary.name} ${rg.title}`),
      source: 'musicbrainz',
      credit_mbids: credits.map((c: any) => c?.artist?.id).filter(isMbid),
    });
  }
  return out;
}

// ---- Spotify (only /me/top/artists, /me/following and /artists/{id}/albums) ----------------------

export const SPOTIFY_SCOPES = 'user-top-read user-follow-read';

const pickImage = (images: any, min = 200) => {
  const list = asList(images).filter((i: any) => typeof i?.url === 'string' && i.url.startsWith('https://') && i.url.length <= 500);
  return (list.filter((i: any) => (i.width ?? 0) >= min).sort((a: any, b: any) => (a.width ?? 0) - (b.width ?? 0))[0] ?? list[0])?.url ?? null;
};

const popularityOf = (v: unknown) => (Number.isFinite(v) && (v as number) >= 0 && (v as number) <= 100 ? Math.round(v as number) : null);
const genresOf = (list: unknown) => asList(list).map((g: any) => String(g).toLowerCase().slice(0, 40)).filter(Boolean).slice(0, 3);

export function spotifyArtists(json: any, opts: { followed?: boolean; offset?: number } = {}): Artist[] {
  const items = asList(json?.items ?? json?.artists?.items);
  return items
    .filter((a: any) => typeof a?.name === 'string' && a.name.trim() && /^[A-Za-z0-9]{1,40}$/.test(a?.id ?? ''))
    .map((a: any, i: number) => ({
      ...blankArtist(a.name, 'spotify', (opts.offset ?? 0) + i + 1),
      spotify_id: a.id,
      followed: Boolean(opts.followed),
      image_url: pickImage(a.images, 160),
      genres: genresOf(a.genres),
      popularity: popularityOf(a.popularity),
    }));
}

export function spotifyAlbums(json: any, artist: Artist, from: string): Album[] {
  return asList(json?.items)
    .filter((a: any) => a?.release_date_precision === 'day' && a.release_date >= from && ['album', 'single'].includes(a.album_type) && typeof a.name === 'string')
    .map((a: any) => ({
      key: `sp:${a.id}`,
      title: a.name.slice(0, 300),
      artist: asList(a.artists).map((x: any) => x.name).join(', ').slice(0, 300) || artist.name,
      artist_key: artist.key,
      artist_mbid: artist.mbid,
      kind: (a.album_type === 'album' ? 'Album' : (a.total_tracks ?? 1) >= 4 ? 'EP' : 'Single') as ReleaseKind,
      release_date: a.release_date,
      image_url: pickImage(a.images),
      tags: artist.genres,
      spotify_url: typeof a.external_urls?.spotify === 'string' ? a.external_urls.spotify : spotifySearchUrl(`${artist.name} ${a.name}`),
      source: 'spotify' as const,
    }));
}

// ---- Listening profile --------------------------------------------------------------------------

const harmonic = (n: number) => {
  let h = 0;
  for (let i = 1; i <= n; i++) h += 1 / i;
  return h;
};

// Turns one top list (one source, one period) into signals. With play counts the share is real;
// with ranks only (Spotify) it follows Zipf's law (rank 1 ≈ twice rank 2). The weight is log-scaled
// against my top artist, so the 150th artist with 3 plays still counts (0.15) instead of vanishing.
export function weighList(list: Artist[], period: Period): Artist[] {
  if (!list.length) return [];
  const withPlays = list.every((a) => (a.playcount ?? 0) > 0);
  const total = withPlays ? list.reduce((sum, a) => sum + a.playcount!, 0) : 0;
  const h = harmonic(Math.max(list.length, ...list.map((a) => a.rank)));
  const raw = list.map((a) => (withPlays ? a.playcount! / total : 1 / a.rank / h));
  const top = Math.max(...raw);
  return list.map((a, i) => ({
    ...a,
    playcount: period === 'mid' ? a.playcount : null,
    signals: { [period]: { share: round(raw[i], 5), w: round(0.15 + 0.85 * clamp01(1 + Math.log10(raw[i] / top) / 2.5)) } },
  }));
}

const PERIOD_WEIGHT: Record<Period, number> = { short: 0.25, mid: 0.45, long: 0.3 };

// 0..1: mostly the last months, but years of loyalty and the last weeks count too. Only periods
// that some source delivered are weighed, so a single source still reaches 1 for the top artist.
// Loved tracks and following add a little.
export function affinityOf(a: Pick<Artist, 'signals' | 'loved' | 'followed'>, present: Period[] = PERIODS): number {
  const periods = present.length ? present : PERIODS;
  const norm = periods.reduce((sum, p) => sum + PERIOD_WEIGHT[p], 0);
  let x = periods.reduce((sum, p) => sum + PERIOD_WEIGHT[p] * (a.signals[p]?.w ?? 0), 0) / norm;
  x += Math.min(0.15, 0.03 * a.loved);
  if (a.followed) x += 0.1;
  return round(clamp01(x));
}

// Compares the last weeks with all time (needs both periods).
//  rising: ≥1 % of what I hear now and at least 2.5× its long-term share (or new)
//  fading: ≥0.8 % of all time, but neither in the last weeks nor really in the last months
//  core:   ≥0.8 % now and ≥0.8 % over the years – a constant favourite
export function trendOf(a: Pick<Artist, 'signals'>, present: Period[] = PERIODS): Trend | null {
  if (!present.includes('short') || !present.includes('long')) return null;
  const s = a.signals.short?.share ?? 0;
  const m = a.signals.mid?.share ?? 0;
  const l = a.signals.long?.share ?? 0;
  if (s >= 0.01 && (l === 0 || s / l >= 2.5)) return 'rising';
  if (l >= 0.008 && s === 0 && m < l * 0.5) return 'fading';
  if (s >= 0.008 && l >= 0.008) return 'core';
  return 'steady';
}

// 0 = mainstream .. 1 = small. Last.fm listeners on a log scale (2 M → 0, 200 k → 0.5, 20 k → 1)
// and Spotify popularity (65 → 0, 45 → 0.5, 25 → 1); the average if both are known.
export function nicheOf(a: Pick<Artist, 'listeners' | 'popularity'>): number | null {
  const parts: number[] = [];
  if (a.listeners != null && a.listeners > 0) parts.push(clamp01(Math.log10(2_000_000 / a.listeners) / 2));
  if (a.popularity != null) parts.push(clamp01((65 - a.popularity) / 40));
  return parts.length ? round(parts.reduce((x, y) => x + y, 0) / parts.length) : null;
}

// The same artist from every source and period → one profile, ranked by affinity.
export function mergeArtists(lists: Artist[][]): Artist[] {
  const byKey = new Map<string, Artist>();
  for (const a of lists.flat()) {
    if (!a.key) continue;
    const prev = byKey.get(a.key);
    if (!prev) {
      byKey.set(a.key, { ...a, sources: [...a.sources], genres: [...a.genres], signals: { ...a.signals } });
      continue;
    }
    prev.rank = Math.min(prev.rank, a.rank);
    prev.mbid ??= a.mbid;
    prev.spotify_id ??= a.spotify_id;
    prev.playcount ??= a.playcount;
    prev.image_url ??= a.image_url;
    prev.listeners ??= a.listeners;
    prev.popularity ??= a.popularity;
    prev.followed ||= a.followed;
    prev.loved = Math.max(prev.loved, a.loved);
    for (const [p, sig] of Object.entries(a.signals) as [Period, Signal][]) {
      if (!prev.signals[p] || sig.w > prev.signals[p]!.w) prev.signals[p] = sig;
    }
    for (const s of a.sources) if (!prev.sources.includes(s)) prev.sources.push(s);
    for (const g of a.genres) if (!prev.genres.includes(g) && prev.genres.length < 5) prev.genres.push(g);
  }
  const all = [...byKey.values()];
  const present = PERIODS.filter((p) => all.some((a) => a.signals[p]));
  return all
    .map((a) => ({ ...a, affinity: affinityOf(a, present), trend: trendOf(a, present), niche: nicheOf(a) }))
    .sort((a, b) => b.affinity - a.affinity || a.rank - b.rank || b.sources.length - a.sources.length || a.name.localeCompare(b.name))
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

// ---- stats.fm (public profiles; endpoints as in the official @statsfm/statsfm.js SDK) ------------

export const STATSFM_API = 'https://api.stats.fm/api/v1';
export const STATSFM_NAME = /^[A-Za-z0-9_.-]{2,40}$/;

export async function statsfmGet(path: string, fetchImpl: Fetch = fetch) {
  const res = await fetchImpl(`${STATSFM_API}${path}`, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' } });
  if (res.status === 404) throw new HttpError(404, 'stats.fm user not found', 'STATSFM_USER_NOT_FOUND');
  if (res.status === 401 || res.status === 403) throw new HttpError(403, 'stats.fm profile is private', 'STATSFM_PRIVATE');
  if (!res.ok) throw new HttpError(502, `stats.fm failed (${res.status})`, 'STATSFM_UNAVAILABLE');
  return res.json();
}

// /users/{name}/top/artists → artists with Spotify ids, genres, popularity and stream counts.
export function statsfmTopArtists(json: any, offset = 0): Artist[] {
  return asList(json?.items)
    .filter((i: any) => typeof i?.artist?.name === 'string' && i.artist.name.trim())
    .map((i: any, n: number) => {
      const spotify = asList(i.artist.externalIds?.spotify).find((id: any) => typeof id === 'string' && /^[A-Za-z0-9]{1,40}$/.test(id)) ?? null;
      const image = typeof i.artist.image === 'string' && i.artist.image.startsWith('https://') && i.artist.image.length <= 500 ? i.artist.image : null;
      return {
        ...blankArtist(i.artist.name, 'statsfm', Number.isInteger(i.position) && i.position > 0 ? i.position : offset + n + 1),
        spotify_id: spotify,
        playcount: Number.isFinite(i.streams) ? Math.min(i.streams, 2_000_000_000) : null,
        image_url: image,
        genres: genresOf(i.artist.genres),
        popularity: popularityOf(i.artist.spotifyPopularity),
      };
    });
}

// /users/{name}/streams/stats → totals for the music statistics (null if the profile hides them).
export function statsfmStreamStats(json: any) {
  const s = json?.items;
  if (!s || !Number.isFinite(s.count) || !Number.isFinite(s.durationMs)) return null;
  const int = (v: unknown) => (Number.isFinite(v) ? Math.max(0, Math.round(v as number)) : null);
  return {
    streams: int(s.count)!,
    minutes: Math.round(s.durationMs / 60_000),
    tracks: int(s.cardinality?.tracks),
    artists: int(s.cardinality?.artists),
    albums: int(s.cardinality?.albums),
  };
}

// ---- Scoring ------------------------------------------------------------------------------------

export interface MusicContext {
  artists: Artist[];
  similar: Similar[];
  weights: Record<string, number>; // tag → [-1, 1] from 👍/👎
  excluded: Set<string>; // feed external ids already answered or rejected
  today: string;
}

const KIND_BONUS: Record<ReleaseKind, number> = { Album: 8, EP: 3, Single: -2 };
const KIND_NEW: Record<ReleaseKind, string> = { Album: 'Neues Album', EP: 'Neue EP', Single: 'Neue Single' };
const TREND_BONUS: Record<Trend, number> = { rising: 5, core: 3, steady: 0, fading: 0 };
const thousands = (n: number) => n.toLocaleString('de-CH');

// Why an artist's release matters to me – the strongest reason wins.
function ownReason(a: Album, own: Artist) {
  const what = `${KIND_NEW[a.kind]} von ${own.name}`;
  const listened = PERIODS.some((p) => own.signals[p]);
  if (!listened && own.followed && own.sources.includes('spotify')) return `${KIND_NEW[a.kind]} – du folgst ${own.name} auf Spotify`;
  if ((own.niche ?? 0) >= MUSIC.small) {
    return own.listeners ? `${what} – Geheimtipp aus deiner Sammlung, nur ${thousands(own.listeners)} Hörer auf Last.fm` : `${what} – Geheimtipp aus deiner Sammlung, geht sonst leicht unter`;
  }
  if (own.trend === 'rising') return `${what} – läuft bei dir gerade oft`;
  if (own.trend === 'core') return `${what} – seit Langem einer deiner Favoriten`;
  if (own.trend === 'fading') return `${what} – früher oft gehört, Zeit fürs Wiederhören`;
  if (own.loved >= 2) return `${what} – ${own.loved} Lieblingssongs von ${own.name} auf Last.fm`;
  return own.affinity >= 0.5 ? `${what} – du hörst ${own.name} oft` : `${what} – ${own.name} hörst du ab und zu`;
}

export function scoreAlbum(a: Album, ctx: MusicContext, lookup = indexContext(ctx)) {
  const own = [a.artist_mbid, ...(a.credit_mbids ?? [])].map((id) => id && lookup.byMbid.get(id)).find(Boolean) || lookup.byKey.get(a.artist_key);
  const similar = own ? null : (a.artist_mbid && lookup.similarByMbid.get(a.artist_mbid)) || lookup.similarByKey.get(a.artist_key);
  if (!own && !similar) return null;
  const upcoming = a.release_date > ctx.today;
  const small = Boolean(own && (own.niche ?? 0) >= MUSIC.small);
  // Similar artists: released albums and EPs only. My artists: singles and announcements only from
  // favourites and small artists, otherwise the big names flood the list.
  if (similar && (upcoming || a.kind === 'Single')) return null;
  if (own && (upcoming || a.kind === 'Single') && own.affinity < 0.3 && !small) return null;
  // My artists (50–95) always beat similar ones (20–50) before bonuses. Small artists get up to +10:
  // their releases are the ones you would miss.
  let score = own ? 50 + 30 * own.affinity + 10 * (own.niche ?? 0) + (own.trend ? TREND_BONUS[own.trend] : 0) : 20 + 30 * similar!.match;
  score += KIND_BONUS[a.kind];
  const fresh = !upcoming && daysBetween(a.release_date, ctx.today) <= MUSIC.freshDays;
  if (fresh) score += 6;
  const taste = a.tags.reduce((sum, t) => sum + (ctx.weights[t] ?? 0), 0);
  score += 15 * Math.max(-1, Math.min(1, taste));
  const reason = own ? ownReason(a, own) : `Weil du ${similar!.because.join(' und ')} hörst – ähnlicher Sound`;
  return {
    score: Math.round(score * 10) / 10,
    reason: reason.slice(0, 300),
    fresh,
    upcoming,
    small,
    own: Boolean(own),
    affinity: own?.affinity ?? null,
    rank: own?.rank ?? null,
  };
}

function indexContext(ctx: MusicContext) {
  return {
    byKey: new Map(ctx.artists.map((a) => [a.key, a])),
    byMbid: new Map(ctx.artists.filter((a) => a.mbid).map((a) => [a.mbid!, a])),
    similarByKey: new Map(ctx.similar.map((s) => [s.key, s])),
    similarByMbid: new Map(ctx.similar.filter((s) => s.mbid).map((s) => [s.mbid!, s])),
  };
}

// Dedupes the same release from MusicBrainz and Spotify (keeps the Spotify link and cover), scores, limits per artist.
export function rankAlbums(albums: Album[], ctx: MusicContext, n = MUSIC.topN) {
  const merged = new Map<string, Album>();
  for (const a of albums) {
    const k = releaseKey(a);
    const prev = merged.get(k);
    if (!prev) merged.set(k, { ...a });
    else if (a.source === 'spotify') Object.assign(prev, { spotify_url: a.spotify_url, image_url: a.image_url ?? prev.image_url, tags: prev.tags.length ? prev.tags : a.tags });
    else merged.set(k, { ...a, spotify_url: prev.spotify_url, image_url: prev.image_url ?? a.image_url, tags: a.tags.length ? a.tags : prev.tags });
  }
  const lookup = indexContext(ctx);
  const horizon = isoDaysAgo(ctx.today, -MUSIC.upcomingDays);
  const scored = [...merged.values()]
    .filter((a) => !ctx.excluded.has(a.key) && a.release_date <= horizon)
    .map((a) => ({ a, s: scoreAlbum(a, ctx, lookup) }))
    .filter((x): x is { a: Album; s: NonNullable<ReturnType<typeof scoreAlbum>> } => x.s !== null)
    .sort((x, y) => y.s.score - x.s.score || y.a.release_date.localeCompare(x.a.release_date));
  const perArtist = new Map<string, number>();
  const out = [];
  for (const x of scored) {
    const count = perArtist.get(x.a.artist_key) ?? 0;
    if (count >= MUSIC.perArtist) continue;
    perArtist.set(x.a.artist_key, count + 1);
    out.push({ album: x.a, ...x.s });
    if (out.length >= n) break;
  }
  return out;
}

// Worth a notification: fresh releases of real favourites, or of small artists I like.
export const notifyWorthy = (r: ReturnType<typeof rankAlbums>[number]) => r.own && r.fresh && ((r.affinity ?? 0) >= 0.6 || (r.small && (r.affinity ?? 0) >= 0.3));

// Concerts: my favourites plus small artists – they tour small venues that are easy to miss.
export function pickConcertArtists(artists: Artist[], n = MUSIC.concertArtists): Artist[] {
  const top = artists.slice(0, Math.ceil(n * 0.7));
  const small = artists.filter((a) => (a.niche ?? 0) >= MUSIC.small && a.affinity >= 0.2 && !top.includes(a));
  return [...new Set([...top, ...small.slice(0, n - top.length), ...artists])].slice(0, n);
}

// ---- Ticketmaster (concerts in Switzerland) -----------------------------------------------------

export function ticketmasterUrl(artist: string, key: string, today: string) {
  const params = new URLSearchParams({
    apikey: key,
    keyword: artist,
    countryCode: 'CH',
    classificationName: 'music',
    size: '10',
    sort: 'date,asc',
    startDateTime: `${today}T00:00:00Z`,
  });
  return `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
}

export interface Concert {
  event_id: string;
  artist: string;
  name: string;
  venue: string | null;
  city: string | null;
  local_date: string;
  starts_at: string | null;
  url: string | null;
  image_url: string | null;
}

// Keyword search is fuzzy: only events where the artist is listed as a performer count.
export function normalizeEvents(json: any, artist: Artist): Concert[] {
  return asList(json?._embedded?.events)
    .filter((e: any) => {
      const performers = asList(e?._embedded?.attractions).map((x: any) => artistKey(String(x?.name ?? '')));
      return typeof e?.id === 'string' && performers.includes(artist.key) && e?.dates?.status?.code !== 'cancelled' && /^\d{4}-\d{2}-\d{2}$/.test(e?.dates?.start?.localDate ?? '');
    })
    .map((e: any) => {
      const venue = asList(e._embedded?.venues)[0];
      return {
        event_id: e.id.slice(0, 100),
        artist: artist.name,
        name: String(e.name ?? artist.name).slice(0, 300),
        venue: venue?.name ? String(venue.name).slice(0, 200) : null,
        city: venue?.city?.name ? String(venue.city.name).slice(0, 100) : null,
        local_date: e.dates.start.localDate,
        starts_at: typeof e.dates.start.dateTime === 'string' ? e.dates.start.dateTime : null,
        url: typeof e.url === 'string' && e.url.startsWith('https://') ? e.url.slice(0, 500) : null,
        image_url: pickImage(e.images, 300),
      };
    });
}
