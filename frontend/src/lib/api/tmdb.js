import { invokeFunction } from '../supabase.js';

export const MIN_QUERY_LENGTH = 2;

// Everything the detail page shows (cached for 24 h on the server).
export async function fetchTitleDetails(mediaType, tmdbId) {
  return invokeFunction('tmdb', { action: 'details', media_type: mediaType, tmdb_id: Number(tmdbId) });
}

export async function searchTitles(query, page = 1) {
  return invokeFunction('tmdb', { action: 'search', query: query.trim(), page });
}

export async function fetchTopRated() {
  return (await invokeFunction('tmdb', { action: 'top_rated' })).titles;
}
