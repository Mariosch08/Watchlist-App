import { unwrap } from '../errors.js';
import { supabase } from '../supabase.js';

export const listKeys = {
  all: (userId) => ['lists', userId],
  one: (id) => ['list', id],
  people: (id) => ['list', id, 'people'],
  items: (id) => ['list', id, 'items'],
  nights: (id) => ['list', id, 'nights'],
};

export async function fetchLists() {
  return unwrap(await supabase.from('shared_lists').select('id, name, description, owner_id, created_at, list_items(count), list_members(count)').order('created_at', { ascending: false }));
}

export async function createList({ name, description }) {
  return unwrap(await supabase.from('shared_lists').insert({ name, description: description || null }).select('id').single());
}

export async function deleteList(id) {
  unwrap(await supabase.from('shared_lists').delete().eq('id', id));
}

export async function fetchList(id) {
  return unwrap(await supabase.from('shared_lists').select('id, name, description, owner_id, created_at').eq('id', id).maybeSingle());
}

export async function fetchListPeople(id) {
  return unwrap(await supabase.rpc('list_people', { p_list_id: id }));
}

export async function addMember(listId, userId, role) {
  unwrap(await supabase.from('list_members').insert({ list_id: listId, user_id: userId, role }));
}

export async function changeRole(listId, userId, role) {
  unwrap(await supabase.from('list_members').update({ role }).match({ list_id: listId, user_id: userId }));
}

export async function removeMember(listId, userId) {
  unwrap(await supabase.from('list_members').delete().match({ list_id: listId, user_id: userId }));
}

export async function fetchListItems(id) {
  const [items, votes] = await Promise.all([
    supabase.from('list_items').select('media_type, tmdb_id, title, poster_path, release_date, added_by, added_at').eq('list_id', id).order('added_at'),
    supabase.from('list_votes').select('media_type, tmdb_id, user_id, vote').eq('list_id', id),
  ]);
  return { items: unwrap(items), votes: unwrap(votes) };
}

export async function addItems(listId, titles) {
  const rows = titles.map((t) => ({
    list_id: listId,
    media_type: t.media_type,
    tmdb_id: t.tmdb_id,
    title: (t.title ?? '').slice(0, 300),
    poster_path: t.poster_path ?? null,
    release_date: t.release_date ?? null,
  }));
  unwrap(await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,media_type,tmdb_id', ignoreDuplicates: true }));
}

export async function removeItem(listId, t) {
  unwrap(await supabase.from('list_items').delete().match({ list_id: listId, media_type: t.media_type, tmdb_id: t.tmdb_id }));
}

// vote: 1, -1 or 0 (withdraw).
export async function castVote(listId, t, vote) {
  unwrap(await supabase.rpc('cast_vote', { p_list_id: listId, p_media_type: t.media_type, p_tmdb_id: t.tmdb_id, p_vote: vote }));
}

export async function fetchNights(listId) {
  return unwrap(
    await supabase
      .from('movie_nights')
      .select('id, title, options, chosen_option, chosen_media_type, chosen_tmdb_id, created_by, created_at, movie_night_votes(user_id, option_index, available)')
      .eq('list_id', listId)
      .order('created_at', { ascending: false }),
  );
}

export async function createNight(listId, title, options) {
  unwrap(await supabase.from('movie_nights').insert({ list_id: listId, title, options }));
}

export async function setAvailability(nightId, optionIndex, available) {
  unwrap(await supabase.rpc('set_availability', { p_night_id: nightId, p_option: optionIndex, p_available: available }));
}

export async function fixNight(nightId, { option, item }) {
  unwrap(
    await supabase
      .from('movie_nights')
      .update({ chosen_option: option, chosen_media_type: item?.media_type ?? null, chosen_tmdb_id: item?.tmdb_id ?? null })
      .eq('id', nightId),
  );
}

export async function deleteNight(nightId) {
  unwrap(await supabase.from('movie_nights').delete().eq('id', nightId));
}
