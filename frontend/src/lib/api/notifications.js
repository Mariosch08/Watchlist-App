import { unwrap } from '../errors.js';
import { supabase } from '../supabase.js';

export async function fetchNotifications() {
  return unwrap(
    await supabase.from('notifications').select('id, type, title, body, data, read_at, created_at').order('created_at', { ascending: false }).limit(100),
  );
}

export async function markAllRead() {
  unwrap(await supabase.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null));
}

export async function deleteNotification(id) {
  unwrap(await supabase.from('notifications').delete().eq('id', id));
}
