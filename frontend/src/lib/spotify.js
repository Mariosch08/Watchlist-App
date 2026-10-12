import { AppError } from './errors.js';
import { appUrl } from './supabase.js';

// Spotify login with OAuth PKCE: no client secret, the code is exchanged by the discovery-music function.
const SCOPES = 'user-top-read user-follow-read';
const STORE = 'spotify-pkce';
export const spotifyClientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';
export const spotifyRedirectUri = () => appUrl('music/callback');

const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const randomString = (bytes = 48) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function codeChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

export async function spotifyAuthorizeUrl({ clientId = spotifyClientId, redirectUri = spotifyRedirectUri(), storage = sessionStorage } = {}) {
  const verifier = randomString(48);
  const state = randomString(16);
  storage.setItem(STORE, JSON.stringify({ verifier, state }));
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: await codeChallenge(verifier),
    state,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

// Validates the redirect from Spotify (state must match) and returns what the server needs; usable once.
export function readSpotifyCallback(search, storage = sessionStorage) {
  const params = new URLSearchParams(search);
  let saved = null;
  try {
    saved = JSON.parse(storage.getItem(STORE) ?? 'null');
  } catch {
    saved = null;
  }
  storage.removeItem(STORE);
  if (params.get('error')) {
    throw new AppError(params.get('error') === 'access_denied' ? 'Du hast die Verbindung mit Spotify abgebrochen.' : 'Spotify hat die Anmeldung abgelehnt.', { code: 'SPOTIFY_DENIED' });
  }
  if (!saved?.verifier || !params.get('code') || params.get('state') !== saved.state) {
    throw new AppError('Die Spotify-Anmeldung ist abgelaufen oder ungültig. Bitte starte sie nochmals.', { code: 'SPOTIFY_STATE' });
  }
  return { code: params.get('code'), verifier: saved.verifier };
}
