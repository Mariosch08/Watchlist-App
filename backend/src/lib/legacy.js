import { userPk, watchlistSk } from './keys.js';

const TV_TYPES = new Set(['tv', 'series', 'show', 'tvseries', 'tv_series']);

function pickNumber(...values) {
  for (const v of values) {
    const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
    if (Number.isInteger(n) && n > 0) return n;
  }
  return null;
}

// Maps an item of an unknown legacy watchlist schema onto the new single-table schema.
// Returns null when no TMDb id can be determined.
export function mapLegacyItem(item, userId, now = new Date()) {
  const tmdbId = pickNumber(item.tmdb_id, item.tmdbId, item.movieId, item.id);
  if (!tmdbId) return null;
  const rawType = String(item.media_type ?? item.mediaType ?? item.type ?? 'movie').toLowerCase();
  const mediaType = TV_TYPES.has(rawType) ? 'tv' : 'movie';
  const watched = item.watched === true || item.status === 'watched' || item.status === 'completed';
  return {
    PK: userPk(userId),
    SK: watchlistSk(mediaType, tmdbId),
    entity: 'watchlist',
    tmdb_id: tmdbId,
    media_type: mediaType,
    title: item.title ?? item.name ?? '',
    poster_path: item.poster_path ?? item.posterPath ?? null,
    release_date: item.release_date ?? item.releaseDate ?? item.first_air_date ?? null,
    status: watched ? 'completed' : 'planned',
    source: 'manual',
    added_at: item.added_at ?? item.addedAt ?? item.createdAt ?? item.created_at ?? now.toISOString(),
    migrated_at: now.toISOString(),
  };
}
