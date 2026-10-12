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

// Accepts a v3 API key or a v4 read access token (JWT, starts with "eyJ").
export async function tmdbGet(path: string, params: Record<string, unknown>, token: string, fetchImpl: Fetch) {
  const url = new URL(TMDB_BASE_URL + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { accept: 'application/json' };
  if (token.startsWith('eyJ')) headers.authorization = `Bearer ${token}`;
  else url.searchParams.set('api_key', token);
  const res = await fetchImpl(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `TMDb request failed (${res.status})`);
  return res.json();
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
  };
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
        const res = await tmdbGet('/search/multi', { query, page, language: TMDB_LANGUAGE, include_adult: false }, token, fetchImpl);
        const results = (res?.results ?? [])
          .filter((r: any) => MEDIA_TYPES.includes(r.media_type))
          .map((r: any) => normalizeTitle(r, r.media_type));
        return { status: 200, body: { page, total_pages: res?.total_pages ?? 0, results } };
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
