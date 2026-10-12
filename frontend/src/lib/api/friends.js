import { unwrap } from '../errors.js';
import { supabase } from '../supabase.js';

export async function fetchFriends() {
  return unwrap(await supabase.rpc('friends_overview'));
}

export async function sendFriendRequest(handle) {
  return unwrap(await supabase.rpc('send_friend_request', { p_handle: handle }));
}

export async function respondFriendRequest(requester, accept) {
  unwrap(await supabase.rpc('respond_friend_request', { p_requester: requester, p_accept: accept }));
}

// Removes a friendship or withdraws/declines a request (RLS limits it to my own rows).
export async function removeFriend(otherId) {
  unwrap(await supabase.from('friendships').delete().or(`requester_id.eq.${otherId},addressee_id.eq.${otherId}`));
}

export async function fetchFriendsOnTitle(mediaType, tmdbId) {
  return unwrap(await supabase.rpc('friends_on_title', { p_media_type: mediaType, p_tmdb_id: Number(tmdbId) }));
}

export async function fetchActivity() {
  return unwrap(await supabase.rpc('friend_activity', { p_limit: 30 }));
}

export async function recommendTitle(friendId, t, message) {
  unwrap(
    await supabase.rpc('recommend_title', {
      p_friend: friendId,
      p_media_type: t.media_type,
      p_tmdb_id: t.tmdb_id,
      p_title: t.title,
      p_poster_path: t.poster_path ?? null,
      p_release_date: t.release_date ?? null,
      p_message: message ?? null,
    }),
  );
}

export async function fetchReceivedRecommendations(userId) {
  return unwrap(
    await supabase
      .from('friend_recommendations')
      .select('id, from_user, media_type, tmdb_id, title, poster_path, release_date, message, created_at')
      .eq('to_user', userId)
      .eq('status', 'new')
      .order('created_at', { ascending: false }),
  );
}

export async function answerRecommendation(id, status) {
  unwrap(await supabase.from('friend_recommendations').update({ status }).eq('id', id));
}
