import { unwrap } from '../errors.js';
import { spotifyRedirectUri } from '../spotify.js';
import { invokeFunction, supabase } from '../supabase.js';

export async function fetchMusicFeed() {
  return unwrap(
    await supabase
      .from('feed')
      .select('id, type, external_id, title, subtitle, image_url, release_date, source, score, reason, data, status, created_at')
      .eq('type', 'album')
      .in('status', ['new', 'liked'])
      .order('score', { ascending: false }),
  );
}

export async function fetchArtists() {
  return unwrap(await supabase.from('music_artists').select('artist_key, name, sources, rank, playcount, followed, image_url, updated_at').order('rank').limit(30));
}

export async function fetchConcerts() {
  const today = new Date().toISOString().slice(0, 10);
  return unwrap(
    await supabase.from('concerts').select('event_id, artist, name, venue, city, local_date, starts_at, url, image_url').gte('local_date', today).order('local_date'),
  );
}

export async function fetchMusicStats() {
  return unwrap(await supabase.from('music_stats').select('streams, minutes, tracks, artists, albums, updated_at').maybeSingle());
}

export async function fetchSpotifyConnection() {
  return unwrap(await supabase.from('spotify_connections').select('display_name, connected_at').maybeSingle());
}

export async function refreshMusic() {
  return invokeFunction('discovery-music', { action: 'refresh' });
}

export async function connectSpotify({ code, verifier }) {
  return invokeFunction('discovery-music', { action: 'spotify-connect', code, verifier, redirect_uri: spotifyRedirectUri() });
}

export async function disconnectSpotify() {
  unwrap(await supabase.from('spotify_connections').delete().not('user_id', 'is', null));
}
