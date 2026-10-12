export const TYPE_LABEL = { movie: 'Film', tv: 'Serie' };

export const STATUS_LABEL = {
  planned: 'Geplant',
  watching: 'Am Schauen',
  completed: 'Gesehen',
  paused: 'Pausiert',
  dropped: 'Abgebrochen',
};

export const RATINGS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

export const POSTER_BASE = 'https://image.tmdb.org/t/p/w154';

export const titleKey = (item) => `${item.media_type}-${item.tmdb_id}`;

// Primary key of a watchlist row (user_id comes from the session via RLS).
export const itemKey = (item) => ({ media_type: item.media_type, tmdb_id: item.tmdb_id });

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-CH') : '');
