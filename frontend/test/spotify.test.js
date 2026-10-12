import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { codeChallenge, readSpotifyCallback, spotifyAuthorizeUrl } from '../src/lib/spotify.js';

const memoryStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};

describe('Spotify PKCE', () => {
  it('derives the S256 challenge as base64url', async () => {
    const verifier = 'dBjftJeZ4CVP-mJ92IFnfKbPwRPiEJYsYkWyFOHI8NKThuSq';
    expect(await codeChallenge(verifier)).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('builds the authorize URL and accepts only the matching callback, once', async () => {
    const storage = memoryStorage();
    const url = new URL(await spotifyAuthorizeUrl({ clientId: 'client123', redirectUri: 'https://app.example/music/callback', storage }));
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'client123',
      response_type: 'code',
      redirect_uri: 'https://app.example/music/callback',
      scope: 'user-top-read user-follow-read',
      code_challenge_method: 'S256',
    });
    const { verifier, state } = JSON.parse(storage.getItem('spotify-pkce'));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(url.searchParams.get('code_challenge')).toBe(await codeChallenge(verifier));
    expect(url.searchParams.get('state')).toBe(state);

    expect(readSpotifyCallback(`?code=abc&state=${state}`, storage)).toEqual({ code: 'abc', verifier });
    expect(() => readSpotifyCallback(`?code=abc&state=${state}`, storage)).toThrow(/abgelaufen/);
  });

  it('rejects a foreign state and explains a cancelled login', async () => {
    const storage = memoryStorage();
    await spotifyAuthorizeUrl({ clientId: 'c', redirectUri: 'https://x/cb', storage });
    expect(() => readSpotifyCallback('?code=abc&state=forged', storage)).toThrow(/abgelaufen oder ungültig/);
    await spotifyAuthorizeUrl({ clientId: 'c', redirectUri: 'https://x/cb', storage });
    expect(() => readSpotifyCallback('?error=access_denied', storage)).toThrow(/abgebrochen/);
  });
});
