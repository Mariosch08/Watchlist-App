// Music discovery: clients and pure helpers for Last.fm, MusicBrainz, Spotify and Ticketmaster.
// No Deno APIs, so the logic is unit-tested in node.
import { HttpError } from './tmdb.ts';

export const MB_USER_AGENT = 'WatchlistApp/1.0 ( https://github.com/mariosch08/Watchlist-App )';
export const MUSIC = {
  releaseDays: 30, // "new" = first released within this many days
  freshDays: 7,
  topN: 20,
  perArtist: 2,
  similarSeeds: 5, // top artists whose similar artists are looked up
  similarMax: 15,
  mbChunk: 25, // artist ids per MusicBrainz query
  concertArtists: 12,
};

type Fetch = typeof fetch;
type Sleep = (ms: number) => Promise<void>;
const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Artist {
  key: string;
  name: string;
  mbid: string | null;
  spotify_id: string | null;
  sources: ('lastfm' | 'spotify')[];
  rank: number; // 1 = most listened
  playcount: number | null;
  followed: boolean;
  image_url: string | null;
  genres: string[];
}

export interface Similar {
  key: string;
  name: string;
  mbid: string | null;
  match: number; // 0..1
  because: string;
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
      key: artistKey(a.name),
      name: a.name.trim().slice(0, 200),
      mbid: isMbid(a.mbid) ? a.mbid : null,
      spotify_id: null,
      sources: ['lastfm' as const],
      rank: Number(a['@attr']?.rank) || i + 1,
      playcount: Number(a.playcount) || null,
      followed: false,
      image_url: null,
      genres: [],
    }));
}

export function lastfmSimilar(json: any, because: string): Similar[] {
  return asList(json?.similarartists?.artist)
    .filter((a: any) => typeof a?.name === 'string' && a.name.trim())
    .map((a: any) => ({
      key: artistKey(a.name),
      name: a.name.trim().slice(0, 200),
      mbid: isMbid(a.mbid) ? a.mbid : null,
      match: Math.max(0, Math.min(1, Number(a.match) || 0)),
      because,
    }));
}

// Keeps the best match per artist and drops artists the user already listens to.
export function mergeSimilar(lists: Similar[][], known: Set<string>, max = MUSIC.similarMax): Similar[] {
  const best = new Map<string, Similar>();
  for (const s of lists.flat()) {
    if (!s.key || known.has(s.key)) continue;
    const prev = best.get(s.key);
    if (!prev || s.match > prev.match) best.set(s.key, s);
  }
  return [...best.values()].sort((a, b) => b.match - a.match).slice(0, max);
}

// ---- MusicBrainz --------------------------------------------------------------------------------

// One Lucene query for many artists; MusicBrainz allows one request per second.
export function releaseQuery(mbids: string[], from: string, to: string) {
  return `(${mbids.map((id) => `arid:${id}`).join(' OR ')}) AND firstreleasedate:[${from} TO ${to}] AND (primarytype:album OR primarytype:ep)`;
}

// Serializes requests with at least `gapMs` between them (shared by all users of one run).
export function musicBrainzClient(fetchImpl: Fetch = fetch, sleep: Sleep = defaultSleep, now = () => Date.now(), gapMs = 1100) {
  let last = -Infinity;
  let queue: Promise<unknown> = Promise.resolve();
  const request = async (query: string) => {
    for (let attempt = 1; ; attempt++) {
      const wait = last + gapMs - now();
      if (wait > 0) await sleep(wait);
      last = now();
      const url = `https://musicbrainz.org/ws/2/release-group?fmt=json&limit=100&query=${encodeURIComponent(query)}`;
      const res = await fetchImpl(url, { headers: { 'User-Agent': MB_USER_AGENT, Accept: 'application/json' } });
      if (res.ok) return res.json();
      if ((res.status === 503 || res.status === 429) && attempt < 3) {
        await sleep(gapMs * 2 * attempt);
        continue;
      }
      throw new HttpError(502, `MusicBrainz failed (${res.status})`, 'MUSICBRAINZ_UNAVAILABLE');
    }
  };
  return (query: string) => {
    const run = queue.then(() => request(query));
    queue = run.catch(() => undefined);
    return run as Promise<any>;
  };
}

const SKIP_SECONDARY = new Set(['compilation', 'live', 'remix', 'dj-mix', 'demo', 'interview', 'spokenword', 'audiobook', 'mixtape/street']);

export function normalizeReleaseGroups(json: any, from: string): Album[] {
  const out: Album[] = [];
  for (const rg of asList(json?.['release-groups'])) {
    const kind: ReleaseKind | null = rg?.['primary-type'] === 'Album' ? 'Album' : rg?.['primary-type'] === 'EP' ? 'EP' : null;
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

export function spotifyArtists(json: any, opts: { followed?: boolean } = {}): Artist[] {
  const items = asList(json?.items ?? json?.artists?.items);
  return items
    .filter((a: any) => typeof a?.name === 'string' && /^[A-Za-z0-9]{1,40}$/.test(a?.id ?? ''))
    .map((a: any, i: number) => ({
      key: artistKey(a.name),
      name: a.name.trim().slice(0, 200),
      mbid: null,
      spotify_id: a.id,
      sources: ['spotify' as const],
      rank: i + 1,
      playcount: null,
      followed: Boolean(opts.followed),
      image_url: pickImage(a.images, 160),
      genres: asList(a.genres).map((g: any) => String(g).toLowerCase().slice(0, 40)).slice(0, 3),
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

// Same artist from Last.fm and Spotify → one entry with the better rank and both ids.
export function mergeArtists(lists: Artist[][]): Artist[] {
  const byKey = new Map<string, Artist>();
  for (const a of lists.flat()) {
    if (!a.key) continue;
    const prev = byKey.get(a.key);
    if (!prev) {
      byKey.set(a.key, { ...a, sources: [...a.sources], genres: [...a.genres] });
      continue;
    }
    prev.rank = Math.min(prev.rank, a.rank);
    prev.mbid ??= a.mbid;
    prev.spotify_id ??= a.spotify_id;
    prev.playcount ??= a.playcount;
    prev.image_url ??= a.image_url;
    prev.followed ||= a.followed;
    for (const s of a.sources) if (!prev.sources.includes(s)) prev.sources.push(s);
    for (const g of a.genres) if (!prev.genres.includes(g) && prev.genres.length < 3) prev.genres.push(g);
  }
  return [...byKey.values()]
    .sort((a, b) => a.rank - b.rank || b.sources.length - a.sources.length || Number(b.followed) - Number(a.followed))
    .map((a, i) => ({ ...a, rank: i + 1 }));
}

// ---- Scoring ------------------------------------------------------------------------------------

export interface MusicContext {
  artists: Artist[];
  similar: Similar[];
  weights: Record<string, number>; // tag → [-1, 1] from 👍/👎
  excluded: Set<string>; // feed external ids already answered or rejected
  today: string;
}

const KIND_BONUS: Record<ReleaseKind, number> = { Album: 8, EP: 3, Single: 0 };
const KIND_NEW: Record<ReleaseKind, string> = { Album: 'Neues Album', EP: 'Neue EP', Single: 'Neue Single' };

export function scoreAlbum(a: Album, ctx: MusicContext, lookup = indexContext(ctx)) {
  const own = (a.artist_mbid && lookup.byMbid.get(a.artist_mbid)) || lookup.byKey.get(a.artist_key);
  const similar = own ? null : (a.artist_mbid && lookup.similarByMbid.get(a.artist_mbid)) || lookup.similarByKey.get(a.artist_key);
  if (!own && !similar) return null;
  // Own artists (55–80) always beat similar ones (20–50) before bonuses.
  let score = own ? 55 + 25 * (1 - (own.rank - 1) / Math.max(ctx.artists.length, own.rank)) : 20 + 30 * similar!.match;
  score += KIND_BONUS[a.kind];
  const fresh = daysBetween(a.release_date, ctx.today) <= MUSIC.freshDays;
  if (fresh) score += 6;
  const taste = a.tags.reduce((sum, t) => sum + (ctx.weights[t] ?? 0), 0);
  score += 15 * Math.max(-1, Math.min(1, taste));
  const name = own ? own.name : a.artist;
  const reason = own
    ? own.followed && own.sources.includes('spotify') && !own.sources.includes('lastfm')
      ? `${KIND_NEW[a.kind]} – du folgst ${name} auf Spotify`
      : `${KIND_NEW[a.kind]} von ${name} – du hörst ${name} oft`
    : `Weil du ${similar!.because} hörst – ähnlicher Sound`;
  return { score: Math.round(score * 10) / 10, reason: reason.slice(0, 300), fresh, own: Boolean(own), rank: own?.rank ?? null };
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
  const scored = [...merged.values()]
    .filter((a) => !ctx.excluded.has(a.key) && a.release_date <= ctx.today)
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
