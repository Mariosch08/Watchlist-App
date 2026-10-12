import { HttpError } from './http.js';
import { getSecret } from './ssm.js';

const BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_LANGUAGE = 'de-CH';
export const TMDB_FALLBACK_LANGUAGE = 'en-US';
export const WATCH_REGION = 'CH';

// Supports both a v3 API key and a v4 read access token (JWT, starts with "eyJ").
export async function tmdbGet(path, params = {}, { fetchImpl = fetch } = {}) {
  const key = await getSecret(process.env.TMDB_SECRET_PARAM);
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers = { accept: 'application/json' };
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set('api_key', key);
  const res = await fetchImpl(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `TMDb request failed (${res.status})`);
  return res.json();
}

export function normalizeTitle(raw, mediaType) {
  return {
    tmdb_id: raw.id,
    media_type: mediaType,
    title: raw.title ?? raw.name ?? '',
    original_title: raw.original_title ?? raw.original_name ?? null,
    poster_path: raw.poster_path ?? null,
    release_date: raw.release_date ?? raw.first_air_date ?? null,
    vote_average: raw.vote_average ?? null,
  };
}
