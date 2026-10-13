import { unwrap } from '../errors.js';
import { invokeFunction, supabase } from '../supabase.js';

export async function scanAvailability() {
  return invokeFunction('availability', { action: 'scan' });
}

export async function fetchAlerts() {
  return unwrap(await supabase.from('availability_alerts').select('media_type, tmdb_id, title, provider_ids, created_at, notified_at').order('created_at', { ascending: false }));
}

export async function createAlert({ media_type, tmdb_id, title }) {
  unwrap(await supabase.from('availability_alerts').upsert({ media_type, tmdb_id, title }, { onConflict: 'user_id,media_type,tmdb_id', ignoreDuplicates: true }));
}

export async function fetchRotationPlan() {
  return unwrap(await supabase.from('rotation_plans').select('months, saved_at').maybeSingle());
}

export async function saveRotationPlan(months) {
  unwrap(await supabase.rpc('save_rotation_plan', { p_months: months }));
}

export async function deleteRotationPlan() {
  unwrap(await supabase.from('rotation_plans').delete().not('user_id', 'is', null));
}

export async function deleteAlert({ media_type, tmdb_id }) {
  unwrap(await supabase.from('availability_alerts').delete().match({ media_type, tmdb_id }));
}
