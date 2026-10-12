// Pure TMDb logic (no Deno APIs) so it can be unit-tested with vitest.
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_LANGUAGE = 'de-CH';
export const TMDB_FALLBACK_LANGUAGE = 'en-US';
export const WATCH_REGION = 'CH';
export const MEDIA_TYPES = ['movie', 'tv'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

type Fetch = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
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
    if (!retryable || attempt >= MAX_ATTEMPTS) throw new HttpError(502, `TMDb request failed (${res.status})`);
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

function intParam(value: unknown, name: string, min: number, max: number, fallback?: number): number {
  if (value === undefined && fallback !== undefined) return fallback;
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n) || (n as number) < min || (n as number) > max) throw new HttpError(400, `Invalid ${name}`);
  return n as number;
}

function mediaTypeParam(value: unknown): MediaType {
  if (!MEDIA_TYPES.includes(value as MediaType)) throw new HttpError(400, 'Invalid media_type');
  return value as MediaType;
}

// Request body: { action: 'search', query, page? } | { action: 'title', media_type, tmdb_id }
export async function handleTmdbRequest(body: any, token: string | undefined, fetchImpl: Fetch) {
  try {
    if (!token) throw new HttpError(500, 'TMDB_API_KEY is not configured');
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Invalid body');
    switch (body.action) {
      case 'search': {
        const query = typeof body.query === 'string' ? body.query.trim() : '';
        if (!query || query.length > 100) throw new HttpError(400, 'Invalid query');
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
        if (!raw) throw new HttpError(404, 'Not found');
        return { status: 200, body: normalizeTitle(raw, mediaType) };
      }
      default:
        throw new HttpError(400, 'Unknown action');
    }
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: { error: err.message } };
    console.error(err);
    return { status: 500, body: { error: 'Internal error' } };
  }
}
