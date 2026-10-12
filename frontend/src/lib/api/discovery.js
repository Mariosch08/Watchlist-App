import { unwrap } from '../errors.js';
import { invokeFunction, supabase } from '../supabase.js';

export async function fetchFeed() {
  return unwrap(
    await supabase
      .from('feed')
      .select('id, type, external_id, title, subtitle, image_url, release_date, source, score, reason, data, status, created_at')
      .in('type', ['movie', 'tv'])
      .in('status', ['new', 'liked'])
      .order('score', { ascending: false }),
  );
}

export async function sendFeedback(id, action) {
  return unwrap(await supabase.rpc('feed_feedback', { p_id: id, p_action: action }));
}

export async function refreshFeed() {
  return invokeFunction('discovery-media', { action: 'refresh' });
}

export async function fetchProviders() {
  return (await invokeFunction('tmdb', { action: 'providers' })).providers;
}

export async function fetchGenres() {
  return invokeFunction('tmdb', { action: 'genres' });
}

export async function fetchTaste() {
  return unwrap(await supabase.from('taste_profile').select('genre_weights_movie, genre_weights_tv, rejected_ids').single());
}

export async function updateTaste(changes) {
  return unwrap(await supabase.from('taste_profile').update(changes).not('user_id', 'is', null).select('genre_weights_movie, genre_weights_tv, rejected_ids').single());
}

// Feed rows look like watchlist items for the shared TitleRow component.
export const feedToTitle = (f) => ({
  media_type: f.data?.media_type ?? f.type,
  tmdb_id: f.data?.tmdb_id ?? Number(f.external_id),
  title: f.title,
  original_title: f.subtitle,
  poster_path: f.image_url,
  release_date: f.release_date,
  vote_average: f.data?.vote_average ?? null,
  genre_ids: f.data?.genre_ids ?? [],
});
