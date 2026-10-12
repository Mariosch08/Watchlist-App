import { unwrap } from '../errors.js';
import { appUrl, supabase } from '../supabase.js';

const INVITE_COLUMNS = 'code, created_at, expires_at, max_uses, uses, used_by, note';

export async function fetchInvites() {
  return unwrap(await supabase.from('invites').select(INVITE_COLUMNS).order('created_at', { ascending: false }));
}

export async function createInvite({ maxUses, note }) {
  return unwrap(
    await supabase
      .from('invites')
      .insert({ max_uses: maxUses, note: note || null })
      .select(INVITE_COLUMNS)
      .single(),
  );
}

export async function revokeInvite(code) {
  unwrap(await supabase.from('invites').delete().eq('code', code));
}

export const inviteLink = (code) => appUrl(`register?invite=${encodeURIComponent(code)}`);

export function inviteState(invite, now = new Date()) {
  if (invite.uses >= invite.max_uses) return 'used';
  if (new Date(invite.expires_at) <= now) return 'expired';
  return 'active';
}
