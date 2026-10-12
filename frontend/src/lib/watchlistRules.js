// Mirrors the database trigger watchlist_before_write so optimistic updates show what the server will store.
export function applyChange(item, changes, now = new Date().toISOString()) {
  const next = { ...item, ...changes };
  if ('my_rating' in changes && changes.my_rating !== item.my_rating) {
    next.rated_at = changes.my_rating == null ? null : (changes.rated_at ?? now);
    // Rating a planned title means it was watched.
    if (item.my_rating == null && changes.my_rating != null && item.status === 'planned' && next.status === 'planned') {
      next.status = 'completed';
    }
  }
  if (next.status === 'completed' && !next.watched_at) next.watched_at = now;
  if (next.status === 'planned' && item.status !== 'planned') next.watched_at = null;
  return next;
}

// Fields an update may touch (directly or through the trigger); used to roll back one row.
export const DERIVED_FIELDS = ['status', 'my_rating', 'rated_at', 'watched_at'];
