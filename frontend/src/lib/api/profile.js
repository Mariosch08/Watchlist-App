import { unwrap } from '../errors.js';
import { supabase } from '../supabase.js';

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
const PROFILE_COLUMNS = 'id, email, display_name, username, is_admin, created_at';

export async function fetchProfile(userId) {
  return unwrap(await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).single());
}

export async function updateProfile(userId, { display_name, username }) {
  return unwrap(
    await supabase.from('profiles').update({ display_name, username }).eq('id', userId).select(PROFILE_COLUMNS).single(),
  );
}
