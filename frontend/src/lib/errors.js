// Maps Supabase, Postgres and Edge Function errors to German UI messages.
const AUTH_CODES = {
  invalid_credentials: 'E-Mail oder Passwort ist falsch.',
  email_not_confirmed: 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in der Mail).',
  user_already_exists: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
  weak_password: 'Das Passwort ist zu schwach (mind. 10 Zeichen).',
  same_password: 'Das neue Passwort muss sich vom alten unterscheiden.',
  over_email_send_rate_limit: 'Zu viele E-Mails in kurzer Zeit. Bitte später erneut versuchen.',
  over_request_rate_limit: 'Zu viele Versuche. Bitte kurz warten.',
  validation_failed: 'Ungültige Eingabe.',
  otp_expired: 'Der Link ist abgelaufen oder wurde schon verwendet.',
};

const PG_CODES = {
  23505: 'Dieser Wert ist bereits vergeben.',
  23514: 'Ungültige Eingabe.',
  42501: 'Keine Berechtigung.',
  PGRST116: 'Dieser Eintrag existiert nicht mehr. Lade die Seite neu.',
};

// Raised by our own SQL functions (raise exception '<CODE>').
const DB_RAISES = {
  USER_NOT_FOUND: 'Niemand mit diesem Benutzernamen oder dieser E-Mail gefunden.',
  TOO_MANY_REQUESTS: 'Zu viele Anfragen in kurzer Zeit. Bitte versuche es später nochmals.',
  NOT_FRIENDS: 'Ihr seid noch nicht befreundet.',
  REQUEST_NOT_FOUND: 'Diese Anfrage gibt es nicht mehr.',
  FEED_NOT_FOUND: 'Dieser Vorschlag existiert nicht mehr.',
};

// Machine-readable codes returned by our Edge Functions ({ error, code }).
const FUNCTION_CODES = {
  NOT_IMDB_CSV: 'Das ist keine IMDb-CSV-Datei (die Spalte „Const“ fehlt).',
  UNSUPPORTED_FILE: 'Diese Datei kenne ich nicht. Unterstützt werden Exporte von IMDb (CSV), Letterboxd (CSV) und Trakt (JSON).',
  CSV_TOO_LARGE: 'Die Datei ist zu gross (max. 5 MB).',
  TOO_MANY_ROWS: 'Die Datei hat zu viele Zeilen (max. 20 000).',
  TMDB_NOT_CONFIGURED: 'Die Filmdatenbank ist noch nicht eingerichtet (TMDb-Schlüssel fehlt).',
  TMDB_UNAVAILABLE: 'Die Filmdatenbank (TMDb) ist gerade nicht erreichbar. Versuche es gleich nochmals.',
  BATCH_FAILED: 'Ein Teil des Imports ist fehlgeschlagen. Er wird automatisch wiederholt.',
  JOB_NOT_FOUND: 'Dieser Import existiert nicht mehr.',
  NOT_IN_LIST: 'Dieser Titel ist nicht mehr in der Liste der nicht gefundenen Titel.',
  NOT_FOUND: 'Diesen Titel gibt es auf TMDb nicht (mehr).',
  INVALID_QUERY: 'Bitte gib mindestens 2 Zeichen ein.',
  INVALID_INPUT: 'Ungültige Eingabe.',
  UNAUTHORIZED: 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an.',
  RATE_LIMITED: 'Gerade erst aktualisiert. Versuch es in ein paar Minuten nochmals.',
  MAIL_NOT_CONFIGURED: 'Der E-Mail-Versand ist noch nicht eingerichtet (Brevo-Schlüssel fehlt).',
  NO_MUSIC_SOURCE: 'Verbinde zuerst Last.fm oder Spotify.',
  LASTFM_USER_NOT_FOUND: 'Diesen Last.fm-Benutzernamen gibt es nicht. Prüfe die Schreibweise.',
  LASTFM_NOT_CONFIGURED: 'Last.fm ist noch nicht eingerichtet (API-Schlüssel fehlt).',
  LASTFM_UNAVAILABLE: 'Last.fm ist gerade nicht erreichbar. Versuche es später nochmals.',
  MUSICBRAINZ_UNAVAILABLE: 'Die Musikdatenbank ist gerade überlastet. Versuche es später nochmals.',
  SPOTIFY_NOT_CONFIGURED: 'Spotify ist noch nicht eingerichtet.',
  SPOTIFY_AUTH_FAILED: 'Die Verbindung mit Spotify hat nicht geklappt. Bitte versuche es nochmals.',
  SPOTIFY_REVOKED: 'Spotify hat den Zugriff entzogen. Bitte verbinde dich neu.',
  SPOTIFY_UNAVAILABLE: 'Spotify ist gerade nicht erreichbar. Versuche es später nochmals.',
};

const NETWORK_PATTERN = /Failed to fetch|NetworkError|Load failed|Failed to send a request|fetch failed|Network request failed/i;
export const NETWORK_MESSAGE = 'Keine Verbindung zum Server. Prüfe deine Internetverbindung und versuche es erneut.';

// An error whose message is already translated for the UI.
export class AppError extends Error {
  constructor(message, { code = null, status = null, retryable = false } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export const isNetworkError = (err) =>
  err?.name === 'FunctionsFetchError' || err?.code === 'NETWORK' || NETWORK_PATTERN.test(err?.message ?? '');

export function isRetryable(err) {
  if (!err) return false;
  if (err instanceof AppError) return err.retryable;
  return isNetworkError(err) || (typeof err.status === 'number' && err.status >= 500);
}

export function errorMessage(err) {
  if (!err) return '';
  if (err instanceof AppError) return err.message;
  if (isNetworkError(err)) return NETWORK_MESSAGE;
  if (err.code && AUTH_CODES[err.code]) return AUTH_CODES[err.code];
  if (DB_RAISES[err.message]) return DB_RAISES[err.message];
  if (err.code && PG_CODES[err.code]) return PG_CODES[err.code];
  // A failing sign-up trigger surfaces as a generic database error.
  if (/Database error saving new user/i.test(err.message ?? '')) {
    return 'Der Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.';
  }
  return err.message || 'Unbekannter Fehler.';
}

// Older function versions only send a text; derive a code from it so messages stay friendly.
function legacyCode(detail, status) {
  if (/TMDB_API_KEY/.test(detail)) return 'TMDB_NOT_CONFIGURED';
  if (/NOT_IMDB_CSV/.test(detail)) return 'NOT_IMDB_CSV';
  if (/Job not found/i.test(detail)) return 'JOB_NOT_FOUND';
  if (/Invalid query/i.test(detail)) return 'INVALID_QUERY';
  if (/Batch failed/i.test(detail)) return 'BATCH_FAILED';
  if (status === 413) return /rows/i.test(detail) ? 'TOO_MANY_ROWS' : 'CSV_TOO_LARGE';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 502) return 'TMDB_UNAVAILABLE';
  return null;
}

const STATUS_FALLBACK = {
  400: 'Ungültige Anfrage.',
  404: 'Nicht gefunden.',
};

// Turns a failed supabase.functions.invoke() into an AppError with a friendly message.
export async function functionError(error) {
  if (error?.name === 'FunctionsFetchError') return new AppError(NETWORK_MESSAGE, { code: 'NETWORK', retryable: true });
  const res = error?.context;
  if (!res || typeof res.status !== 'number') return error;
  let body = {};
  try {
    body = await res.clone().json();
  } catch {
    body = { error: await res.text().catch(() => '') };
  }
  const detail = String(body?.error ?? '');
  const code = body?.code ?? legacyCode(detail, res.status);
  const message =
    FUNCTION_CODES[code] ?? STATUS_FALLBACK[res.status] ?? 'Der Server hat einen Fehler gemeldet. Bitte versuche es erneut.';
  console.warn(`Edge Function error ${res.status}`, body);
  return new AppError(message, { code, status: res.status, retryable: res.status >= 500 || res.status === 429 });
}

// Throws the error of a supabase-js result, returns its data otherwise.
export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
