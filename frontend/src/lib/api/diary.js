import { unwrap } from '../errors.js';
import { supabase } from '../supabase.js';
import { fetchAllPages } from './watchlist.js';

const COLUMNS = 'id, media_type, tmdb_id, title, poster_path, watched_on, place, with_whom, note, rating, rewatch, import_ref, created_at';

export const diaryKeys = {
  all: (userId) => ['diary', userId],
  title: (userId, mediaType, tmdbId) => ['diary', userId, 'title', mediaType, String(tmdbId)],
};

export function fetchDiary() {
  return fetchAllPages(() => supabase.from('diary_entries').select(COLUMNS).order('watched_on', { ascending: false }).order('created_at', { ascending: false }));
}

export async function fetchTitleDiary(mediaType, tmdbId) {
  return unwrap(
    await supabase.from('diary_entries').select(COLUMNS).match({ media_type: mediaType, tmdb_id: Number(tmdbId) }).order('watched_on', { ascending: false }),
  );
}

export async function addDiaryEntry(entry) {
  return unwrap(await supabase.from('diary_entries').insert(entry).select(COLUMNS).single());
}

export async function deleteDiaryEntry(id) {
  unwrap(await supabase.from('diary_entries').delete().eq('id', id));
}
