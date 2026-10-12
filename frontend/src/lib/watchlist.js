import { unwrap } from './errors.js';
import { invokeFunction, supabase } from './supabase.js';

// Data access for the watchlist page (keeps the page component free of queries).
export async function loadWatchlist() {
  return unwrap(await supabase.from('watchlist').select().order('added_at', { ascending: false }));
}

export async function searchTitles(query) {
  return (await invokeFunction('tmdb', { action: 'search', query: query.trim() })).results;
}

export async function addToWatchlist(result) {
  const row = {
    tmdb_id: result.tmdb_id,
    media_type: result.media_type,
    title: result.title,
    original_title: result.original_title,
    poster_path: result.poster_path,
    release_date: result.release_date,
    vote_average: result.vote_average ? Math.round(result.vote_average * 10) / 10 : null,
  };
  const saved = unwrap(
    await supabase
      .from('watchlist')
      .upsert(row, { onConflict: 'user_id,media_type,tmdb_id', ignoreDuplicates: true })
      .select()
      .maybeSingle(),
  );
  return saved ?? row;
}

export async function updateWatchlistItem(item, changes) {
  return unwrap(
    await supabase.from('watchlist').update(changes).match({ media_type: item.media_type, tmdb_id: item.tmdb_id }).select().single(),
  );
}

export async function removeFromWatchlist(item) {
  unwrap(await supabase.from('watchlist').delete().match({ media_type: item.media_type, tmdb_id: item.tmdb_id }));
}
