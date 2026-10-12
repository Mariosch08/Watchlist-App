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
export const POSTER_LARGE_BASE = 'https://image.tmdb.org/t/p/w342';
export const BACKDROP_BASE = 'https://image.tmdb.org/t/p/w780';
export const PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';
export const LOGO_BASE = 'https://image.tmdb.org/t/p/w92';

export const MEDIA_TYPES = ['movie', 'tv'];

// Route of a title's detail page.
export const detailPath = (item) => `/title/${item.media_type}/${item.tmdb_id}`;

// 155 → "2 Std. 35 Min."
export function formatRuntime(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} Min.`;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

export const titleKey = (item) => `${item.media_type}-${item.tmdb_id}`;

// Primary key of a watchlist row (user_id comes from the session via RLS).
export const itemKey = (item) => ({ media_type: item.media_type, tmdb_id: item.tmdb_id });

export const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('de-CH') : '');
