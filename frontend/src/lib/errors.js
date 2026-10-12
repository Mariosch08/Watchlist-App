// Maps Supabase/Postgres errors to German UI messages.
const AUTH_CODES = {
  invalid_credentials: 'E-Mail oder Passwort ist falsch.',
  email_not_confirmed: 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Mail).',
  user_already_exists: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
  weak_password: 'Das Passwort ist zu schwach (mind. 10 Zeichen).',
  same_password: 'Das neue Passwort muss sich vom alten unterscheiden.',
  over_email_send_rate_limit: 'Zu viele E-Mails in kurzer Zeit. Bitte später erneut versuchen.',
  over_request_rate_limit: 'Zu viele Versuche. Bitte kurz warten.',
  validation_failed: 'Ungültige Eingabe.',
};

const PG_CODES = {
  23505: 'Dieser Wert ist bereits vergeben.',
  23514: 'Ungültige Eingabe.',
  42501: 'Keine Berechtigung.',
};

export function errorMessage(err) {
  if (!err) return '';
  if (err.code && AUTH_CODES[err.code]) return AUTH_CODES[err.code];
  if (err.code && PG_CODES[err.code]) return PG_CODES[err.code];
  // A failing sign-up trigger surfaces as a generic database error.
  if (/Database error saving new user/i.test(err.message ?? '')) {
    return 'Der Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.';
  }
  if (/Failed to fetch|NetworkError/i.test(err.message ?? '')) return 'Keine Verbindung zum Server.';
  return err.message || 'Unbekannter Fehler.';
}

// Throws the error of a supabase-js result, returns its data otherwise.
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

const FUNCTION_STATUS = {
  401: 'Nicht angemeldet – bitte ab- und wieder anmelden.',
  404: 'Server-Funktion nicht gefunden (Deploy prüfen).',
  502: 'TMDb lehnt den Schlüssel ab – Secret TMDB_API_KEY in Supabase prüfen.',
};

// Turns a failed supabase.functions.invoke() into a readable error (status + server message).
export async function functionError(error) {
  const res = error?.context;
  if (!res || typeof res.status !== 'number') return error;
  let detail = '';
  try {
    detail = (await res.clone().json()).error ?? '';
  } catch {
    detail = await res.text().catch(() => '');
  }
  if (/TMDB_API_KEY/.test(detail)) return new Error('TMDb-Schlüssel fehlt – Secret TMDB_API_KEY in Supabase anlegen.');
  return new Error(`${FUNCTION_STATUS[res.status] ?? 'Server-Fehler'} (Status ${res.status}${detail ? `: ${detail}` : ''})`);
}
