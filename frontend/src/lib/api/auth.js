import { markSignOut } from '../authFlags.js';
import { unwrap } from '../errors.js';
import { appUrl, supabase } from '../supabase.js';

export const PASSWORD_MIN_LENGTH = 10;
export const normalizeEmail = (email) => email.trim().toLowerCase();

export async function signIn(email, password) {
  unwrap(await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password }));
}

export async function signUp({ email, password, inviteCode }) {
  const invite = inviteCode.trim();
  // The very first user needs no code; the database trigger enforces the real rule.
  if (invite && !unwrap(await supabase.rpc('check_invite', { code: invite }))) {
    const err = new Error('Der Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.');
    err.field = 'invite';
    throw err;
  }
  unwrap(
    await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: { data: { invite_code: invite }, emailRedirectTo: appUrl() },
    }),
  );
}

export async function resendConfirmation(email) {
  unwrap(await supabase.auth.resend({ type: 'signup', email: normalizeEmail(email), options: { emailRedirectTo: appUrl() } }));
}

export async function requestPasswordReset(email) {
  unwrap(await supabase.auth.resetPasswordForEmail(normalizeEmail(email), { redirectTo: appUrl('reset-password') }));
}

// Sets a new password and marks it as chosen (used for friends invited via the Supabase dashboard).
export async function setPassword(password) {
  unwrap(await supabase.auth.updateUser({ password, data: { password_set: true } }));
}

// Signs out this device only. When offline the server call fails; the local session is dropped anyway.
export async function signOutHere() {
  markSignOut('manual');
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    try {
      localStorage.removeItem(supabase.auth.storageKey);
    } catch {
      // storage unavailable
    }
    window.location.assign(import.meta.env.BASE_URL + 'login');
  }
}

export async function signOutOtherDevices() {
  unwrap(await supabase.auth.signOut({ scope: 'others' }));
}
