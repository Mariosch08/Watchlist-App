// Pure TMDb logic (no Deno APIs) so it can be unit-tested with vitest.
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_LANGUAGE = 'de-CH';
export const TMDB_FALLBACK_LANGUAGE = 'en-US';
export const WATCH_REGION = 'CH';
export const MEDIA_TYPES = ['movie', 'tv'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

// `code` is machine-readable; the frontend translates it into a German message.
export class HttpError extends Error {
  constructor(public status: number, message: string, public code: string = 'ERROR') {
    super(message);
  }
}

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAX_ATTEMPTS = 4;

// Accepts a v3 API key or a v4 read access token (JWT, starts with "eyJ").
// Retries on 429 (honours Retry-After) and 5xx with exponential backoff.
export async function tmdbGet(
  path: string,
  params: Record<string, unknown>,
  token: string,
  fetchImpl: Fetch,
  sleep: (ms: number) => Promise<unknown> = defaultSleep,
) {
  const url = new URL(TMDB_BASE_URL + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token.startsWith('eyJ')) headers.authorization = `Bearer ${token}`;
  else url.searchParams.set('api_key', token);
  for (let attempt = 1; ; attempt++) {
    const res = await fetchImpl(url, { headers });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) throw new HttpError(502, `TMDb request failed (${res.status})`, 'TMDB_UNAVAILABLE');
    const retryAfter = Number(res.headers?.get?.('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt);
  }
}

export function normalizeTitle(raw: Record<string, any>, mediaType: MediaType) {
  return {
    tmdb_id: raw.id,
    media_type: mediaType,
    title: raw.title ?? raw.name ?? '',
    original_title: raw.original_title ?? raw.original_name ?? null,
    poster_path: raw.poster_path ?? null,
    release_date: raw.release_date || raw.first_air_date || null,
    vote_average: raw.vote_average ?? null,
    vote_count: raw.vote_count ?? 0,
  };
}

type Title = ReturnType<typeof normalizeTitle>;

export const normalizeText = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Relevance = text match on (German or original) title + TMDb's own order + how well-known the title is.
export function relevance(t: Title, query: string, index: number, total: number) {
  const q = normalizeText(query);
  const names = [normalizeText(t.title), normalizeText(t.original_title)].filter(Boolean);
  let text = 0;
  if (names.some((n) => n === q)) text = 30;
  else if (names.some((n) => n.startsWith(q))) text = 10;
  else if (names.some((n) => n.includes(q))) text = 3;
  const tmdbOrder = total > 0 ? 25 * (1 - index / total) : 0;
  const known = 10 * Math.log10((t.vote_count ?? 0) + 1);
  return text + tmdbOrder + known;
}

// Merges movie and series results and sorts them by relevance.
export function rankResults(query: string, movies: any[], series: any[]) {
  const scored = [
    ...movies.map((r, i) => ({ t: normalizeTitle(r, 'movie'), i, n: movies.length })),
    ...series.map((r, i) => ({ t: normalizeTitle(r, 'tv'), i, n: series.length })),
  ].map(({ t, i, n }) => ({ t, score: relevance(t, query, i, n) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.t);
}

// ---- Detail page (Phase 4) ----------------------------------------------------------

export const DETAILS_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CAST = 12;
const MAX_SIMILAR = 12;
const YOUTUBE_KEY = /^[A-Za-z0-9_-]{6,20}$/;

type Provider = { id: number; name: string; logo_path: string | null };

// Best YouTube trailer: official trailers first, German before English, then teasers.
export function pickTrailer(videos: any[] | undefined) {
  const candidates = (videos ?? []).filter((v) => v?.site === 'YouTube' && YOUTUBE_KEY.test(v.key ?? ''));
  const score = (v: any) =>
    (v.type === 'Trailer' ? 100 : v.type === 'Teaser' ? 50 : 0) +
    (v.iso_639_1 === 'de' ? 20 : v.iso_639_1 === 'en' ? 10 : 0) +
    (v.official ? 5 : 0);
  const best = candidates.filter((v) => score(v) >= 50).sort((a, b) => score(b) - score(a))[0];
  return best ? { key: best.key as string, name: (best.name as string) ?? null, language: best.iso_639_1 ?? null } : null;
}

const toProviders = (...lists: any[][]): Provider[] => {
  const seen = new Set<number>();
  return lists
    .flat()
    .filter((p) => p && Number.isInteger(p.provider_id))
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
    .map((p) => ({ id: p.provider_id, name: p.provider_name ?? '', logo_path: p.logo_path ?? null }));
};

// Streaming offers in Switzerland. Free and ad-supported offers count as flatrate (nothing to pay).
export function normalizeProviders(raw: any) {
  const ch = raw?.results?.[WATCH_REGION];
  if (!ch) return { link: null, flatrate: [], rent: [], buy: [] };
  return {
    link: typeof ch.link === 'string' ? ch.link : null,
    flatrate: toProviders(ch.flatrate ?? [], ch.free ?? [], ch.ads ?? []),
    rent: toProviders(ch.rent ?? []),
    buy: toProviders(ch.buy ?? []),
  };
}

function normalizeCast(raw: Record<string, any>, mediaType: MediaType) {
  const credits = mediaType === 'tv' ? (raw.aggregate_credits ?? raw.credits) : raw.credits;
  return (credits?.cast ?? []).slice(0, MAX_CAST).map((c: any) => ({
    id: c.id,
    name: c.name ?? '',
    character: c.character ?? c.roles?.[0]?.character ?? null,
    profile_path: c.profile_path ?? null,
  }));
}

// Key people: creators/directors first, then writers. Names only, deduplicated.
function normalizeCrew(raw: Record<string, any>, mediaType: MediaType) {
  const crew: any[] = raw.credits?.crew ?? [];
  const names = (jobs: string[]) => [...new Set(crew.filter((c) => jobs.includes(c.job)).map((c) => c.name as string))].slice(0, 3);
  if (mediaType === 'tv') {
    const creators = (raw.created_by ?? []).map((c: any) => c.name as string).slice(0, 3);
    return creators.length ? [{ job: 'Idee', names: creators }] : [];
  }
  return [
    { job: 'Regie', names: names(['Director']) },
    { job: 'Drehbuch', names: names(['Screenplay', 'Writer']) },
  ].filter((g) => g.names.length > 0);
}

// Recommendations (what people also watched) are better than TMDb's genre-based "similar";
// "similar" is only the fallback for titles without recommendations.
function normalizeSimilar(raw: Record<string, any>, mediaType: MediaType) {
  const recs = raw.recommendations?.results ?? [];
  const list = recs.length > 0 ? recs : (raw.similar?.results ?? []);
  return list
    .map((r: any) => ({ r, type: MEDIA_TYPES.includes(r.media_type) ? (r.media_type as MediaType) : mediaType }))
    .filter(({ r }: any) => r && Number.isInteger(r.id) && r.id !== raw.id && !r.adult)
    .slice(0, MAX_SIMILAR)
    .map(({ r, type }: any) => normalizeTitle(r, type));
}

export function normalizeDetails(raw: Record<string, any>, mediaType: MediaType, fallbackOverview: string | null = null) {
  return {
    ...normalizeTitle(raw, mediaType),
    backdrop_path: raw.backdrop_path ?? null,
    overview: raw.overview || fallbackOverview || null,
    tagline: raw.tagline || null,
    genres: (raw.genres ?? []).map((g: any) => g.name as string).filter(Boolean),
    runtime: mediaType === 'movie' ? (raw.runtime || null) : (raw.episode_run_time?.[0] ?? null),
    number_of_seasons: raw.number_of_seasons ?? null,
    number_of_episodes: raw.number_of_episodes ?? null,
    imdb_id: raw.imdb_id ?? raw.external_ids?.imdb_id ?? null,
    cast: normalizeCast(raw, mediaType),
    crew: normalizeCrew(raw, mediaType),
    trailer: pickTrailer(raw.videos?.results),
    providers: normalizeProviders(raw['watch/providers']),
    similar: normalizeSimilar(raw, mediaType),
    ...(mediaType === 'tv' ? normalizeSeriesInfo(raw) : {}),
  };
}

export function pickEpisode(ep: any) {
  if (!ep || !Number.isInteger(ep.season_number) || !Number.isInteger(ep.episode_number)) return null;
  return { season_number: ep.season_number, episode_number: ep.episode_number, name: ep.name || null, air_date: ep.air_date || null };
}

// Series-only fields: seasons (without specials), airing status, last/next episode.
export function normalizeSeriesInfo(raw: Record<string, any>) {
  return {
    tmdb_status: raw.status || null,
    seasons: (raw.seasons ?? [])
      .filter((s: any) => Number.isInteger(s.season_number) && s.season_number >= 1)
      .map((s: any) => ({ season_number: s.season_number, name: s.name || `Staffel ${s.season_number}`, episode_count: s.episode_count ?? 0, air_date: s.air_date || null }))
      .sort((a: any, b: any) => a.season_number - b.season_number),
    last_episode_to_air: pickEpisode(raw.last_episode_to_air),
    next_episode_to_air: pickEpisode(raw.next_episode_to_air),
  };
}

export function normalizeSeason(raw: Record<string, any>) {
  return {
    season_number: raw.season_number,
    name: raw.name || `Staffel ${raw.season_number}`,
    episodes: (raw.episodes ?? [])
      .filter((e: any) => Number.isInteger(e.episode_number))
      .map((e: any) => ({
        episode_number: e.episode_number,
        name: e.name || null,
        overview: e.overview || null,
        air_date: e.air_date || null,
        runtime: e.runtime ?? null,
        still_path: e.still_path ?? null,
      })),
  };
}

export const seasonCacheKey = (id: number, season: number) => `season:tv:${id}:${season}:${TMDB_LANGUAGE}`;

// One TMDb request for the whole page (append_to_response); a second one only if there is no German overview.
export async function fetchDetails(mediaType: MediaType, id: number, token: string, fetchImpl: Fetch) {
  const credits = mediaType === 'tv' ? 'aggregate_credits' : 'credits';
  const raw = await tmdbGet(
    `/${mediaType}/${id}`,
    {
      language: TMDB_LANGUAGE,
      append_to_response: `${credits},videos,watch/providers,recommendations,similar,external_ids`,
      include_video_language: 'de,en,null',
    },
    token,
    fetchImpl,
  );
  if (!raw) return null;
  let fallback: string | null = null;
  if (!raw.overview) {
    const en = await tmdbGet(`/${mediaType}/${id}`, { language: TMDB_FALLBACK_LANGUAGE }, token, fetchImpl);
    fallback = en?.overview || null;
  }
  return normalizeDetails(raw, mediaType, fallback);
}

// Optional cache (tmdb_cache via service role). Failures never break the request.
export type DetailsCache = {
  get: (key: string) => Promise<unknown | null>;
  set: (key: string, data: unknown, ttlMs: number) => Promise<void>;
};

export const detailsCacheKey = (mediaType: MediaType, id: number) => `details:${mediaType}:${id}:${TMDB_LANGUAGE}`;

function intParam(value: unknown, name: string, min: number, max: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n) || (n as number) < min || (n as number) > max) throw new HttpError(400, `Invalid ${name}`, 'INVALID_INPUT');
  return n as number;
}

function mediaTypeParam(value: unknown): MediaType {
  if (!MEDIA_TYPES.includes(value as MediaType)) throw new HttpError(400, 'Invalid media_type', 'INVALID_INPUT');
  return value as MediaType;
}

// Request body: { action: 'search', query, page? } | { action: 'title' | 'details', media_type, tmdb_id }
export async function handleTmdbRequest(body: any, token: string | undefined, fetchImpl: Fetch, cache?: DetailsCache) {
  try {
    if (!token) throw new HttpError(500, 'TMDB_API_KEY is not configured', 'TMDB_NOT_CONFIGURED');
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body', 'INVALID_INPUT');
    switch (body.action) {
      case 'search': {
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (query.length < 2 || query.length > 100) throw new HttpError(400, 'Invalid query', 'INVALID_QUERY');
        const page = intParam(body.page, 'page', 1, 20, 1);
        const params = { query, page, language: TMDB_LANGUAGE, include_adult: false };
        const [movies, series] = await Promise.all([
          tmdbGet('/search/movie', params, token, fetchImpl),
          tmdbGet('/search/tv', params, token, fetchImpl),
        ]);
        const results = rankResults(query, movies?.results ?? [], series?.results ?? []);
        const totalPages = Math.max(movies?.total_pages ?? 0, series?.total_pages ?? 0);
        return { status: 200, body: { page, total_pages: totalPages, results } };
      }
      case 'title': {
        const mediaType = mediaTypeParam(body.media_type);
        const id = intParam(body.tmdb_id, 'tmdb_id', 1, 1e9);
        const raw = await tmdbGet(`/${mediaType}/${id}`, { language: TMDB_LANGUAGE }, token, fetchImpl);
        if (!raw) throw new HttpError(404, 'Not found', 'NOT_FOUND');
        return { status: 200, body: normalizeTitle(raw, mediaType) };
      }
      case 'details': {
        const mediaType = mediaTypeParam(body.media_type);
        const id = intParam(body.tmdb_id, 'tmdb_id', 1, 1e9);
        const key = detailsCacheKey(mediaType, id);
        const cached = await cache?.get(key).catch((err) => (console.error('cache read', err), null));
        if (cached) return { status: 200, body: cached };
        const details = await fetchDetails(mediaType, id, token, fetchImpl);
        if (!details) throw new HttpError(404, 'Not found', 'NOT_FOUND');
        await cache?.set(key, details, DETAILS_TTL_MS).catch((err) => console.error('cache write', err));
        return { status: 200, body: details };
      }
      case 'season': {
        const id = intParam(body.tmdb_id, 'tmdb_id', 1, 1e9);
        const season = intParam(body.season_number, 'season_number', 1, 500);
        const key = seasonCacheKey(id, season);
        const cached = await cache?.get(key).catch((err) => (console.error('cache read', err), null));
        if (cached) return { status: 200, body: cached };
        const raw = await tmdbGet(`/tv/${id}/season/${season}`, { language: TMDB_LANGUAGE }, token, fetchImpl);
        if (!raw) throw new HttpError(404, 'Not found', 'NOT_FOUND');
        const result = normalizeSeason(raw);
        await cache?.set(key, result, DETAILS_TTL_MS).catch((err) => console.error('cache write', err));
        return { status: 200, body: result };
      }
      default:
        throw new HttpError(400, 'Unknown action', 'INVALID_INPUT');
    }
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message, code: err.code } };
    console.error(err);
    return { status: 500, body: { error: 'Internal error', code: 'INTERNAL' } };
  }
}
