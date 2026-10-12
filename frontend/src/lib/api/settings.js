import { unwrap } from '../errors.js';
import { supabase } from '../supabase.js';

export async function fetchSettings() {
  return unwrap(await supabase.from('user_settings').select('streaming_providers, lastfm_username, email_digest, email_instant, share_ratings_with_friends, share_activity, hide_spoilers, calendar_token').single());
}

export async function updateSettings(changes) {
  return unwrap(await supabase.from('user_settings').update(changes).not('user_id', 'is', null).select().single());
}

export async function regenerateCalendarToken() {
  return unwrap(await supabase.rpc('regenerate_calendar_token'));
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
export const calendarUrl = (token) => `${SUPABASE_URL}/functions/v1/calendar?token=${token}`;
export const webcalUrl = (token) => calendarUrl(token).replace(/^https?:/, 'webcal:');
