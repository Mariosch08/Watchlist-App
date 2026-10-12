import { invokeFunction } from '../supabase.js';

export const MIN_QUERY_LENGTH = 2;

export async function searchTitles(query, page = 1) {
  return invokeFunction('tmdb', { action: 'search', query: query.trim(), page });
}
