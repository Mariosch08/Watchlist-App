import { markSignOut } from '../authFlags.js';
import { downloadFile } from '../download.js';
import { unwrap } from '../errors.js';
import { supabase } from '../supabase.js';

export async function exportJson() {
  const data = unwrap(await supabase.rpc('export_my_data'));
  downloadFile(JSON.stringify(data, null, 2), `watchlist-export-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
}

export async function deleteAccount() {
  unwrap(await supabase.rpc('delete_my_account'));
  markSignOut('deleted');
  await supabase.auth.signOut({ scope: 'local' });
}
