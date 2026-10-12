import { unwrap } from '../errors.js';
import { itemKey } from '../labels.js';
import { supabase } from '../supabase.js';

// Columns the list, filters and undo need. The detail page loads the full row itself.
export const LIST_COLUMNS =
  'media_type,tmdb_id,title,original_title,poster_path,release_date,vote_average,status,my_rating,rated_at,watched_at,runtime,imdb_id,source,added_at';

const PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows per request

// Reads all pages of a query. The builder must apply a total, stable ordering.
export async function fetchAllPages(buildQuery, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const page = unwrap(await buildQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export function fetchWatchlist() {
  return fetchAllPages(() =>
    supabase
      .from('watchlist')
      .select(LIST_COLUMNS)
      .order('added_at', { ascending: false })
      .order('media_type')
      .order('tmdb_id'),
  );
}

// Row for a new watchlist entry, built from a TMDb search result.
export function toWatchlistRow(result, status = 'planned') {
  return {
    tmdb_id: result.tmdb_id,
    media_type: result.media_type,
    title: result.title,
    original_title: result.original_title ?? null,
    poster_path: result.poster_path ?? null,
    release_date: result.release_date ?? null,
    vote_average: result.vote_average ? Math.round(result.vote_average * 10) / 10 : null,
    status,
  };
}

// Adds a title. Returns the stored row and whether it already existed (never a client-built row).
export async function addTitle(result, { status = 'planned' } = {}) {
  const row = toWatchlistRow(result, status);
  const inserted = unwrap(
    await supabase
      .from('watchlist')
      .upsert(row, { onConflict: 'user_id,media_type,tmdb_id', ignoreDuplicates: true })
      .select(LIST_COLUMNS)
      .maybeSingle(),
  );
  if (inserted) return { item: inserted, existed: false };
  const existing = unwrap(await supabase.from('watchlist').select(LIST_COLUMNS).match(itemKey(row)).maybeSingle());
  return { item: existing, existed: true };
}

// Returns the updated row, or null when the row no longer exists.
export async function updateItem(item, changes) {
  return unwrap(await supabase.from('watchlist').update(changes).match(itemKey(item)).select(LIST_COLUMNS).maybeSingle());
}

export async function removeItem(item) {
  unwrap(await supabase.from('watchlist').delete().match(itemKey(item)));
}

const RESTORE_FIELDS = LIST_COLUMNS.split(',');

// Undo for removeItem: re-inserts the snapshot (incl. rating and dates) and lifts the tombstone.
export async function restoreItem(snapshot) {
  const row = Object.fromEntries(RESTORE_FIELDS.filter((f) => snapshot[f] !== undefined).map((f) => [f, snapshot[f]]));
  const restored = unwrap(
    await supabase
      .from('watchlist')
      .upsert(row, { onConflict: 'user_id,media_type,tmdb_id', ignoreDuplicates: true })
      .select(LIST_COLUMNS)
      .maybeSingle(),
  );
  // Manual inserts lift the tombstone by trigger, imported ones (source 'imdb') do not.
  unwrap(await supabase.from('watchlist_tombstones').delete().match(itemKey(row)));
  return restored ?? snapshot;
}
