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
  return unwrap(
    await supabase
      .from('music_artists')
      .select('artist_key, name, sources, rank, playcount, followed, image_url, affinity, trend, niche, listeners, popularity, loved, genres, updated_at')
      .order('rank')
      .limit(300),
  );
}

export async function fetchConcerts() {
  const today = new Date().toISOString().slice(0, 10);
  return unwrap(
    await supabase.from('concerts').select('event_id, artist, name, venue, city, local_date, starts_at, url, image_url').gte('local_date', today).order('local_date'),
  );
}

// Concerts I go to or went to (Life Reel, calendar).
export async function fetchConcertLog() {
  return unwrap(await supabase.from('concert_log').select('id, event_id, artist, local_date, venue, city, note, created_at').order('local_date', { ascending: false }));
}

export async function logConcert({ event_id = null, artist, local_date, venue = null, city = null, note = null }) {
  return unwrap(await supabase.from('concert_log').insert({ event_id, artist, local_date, venue, city, note }).select('id, event_id, artist, local_date, venue, city, note, created_at').single());
}

export async function unlogConcert(id) {
  unwrap(await supabase.from('concert_log').delete().eq('id', id));
}

export async function fetchConcertBuddies() {
  return unwrap(await supabase.rpc('concert_buddies'));
}

export async function fetchMusicMonths() {
  return unwrap(await supabase.from('music_months').select('month, plays, minutes, minutes_estimated, top_artist, top_artist_plays, top_track, top_track_artist, source').order('month'));
}

export async function fetchMusicStats() {
  return unwrap(await supabase.from('music_stats').select('streams, minutes, tracks, artists, albums, updated_at').maybeSingle());
}

export async function fetchSpotifyConnection() {
  return unwrap(await supabase.from('spotify_connections').select('display_name, connected_at').maybeSingle());
}

// Tonight's mood from the last hours of listening ({ mood: null } if there is too little or it is switched off).
export async function fetchListeningMood() {
  return invokeFunction('discovery-music', { action: 'mood' });
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
