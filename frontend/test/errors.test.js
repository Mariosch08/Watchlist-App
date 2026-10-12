import { describe, expect, it } from 'vitest';
import { AppError, errorMessage, functionError, isRetryable, NETWORK_MESSAGE, unwrap } from '../src/lib/errors.js';
import { readAuthUrlError } from '../src/lib/supabase.js';
import { safeReturnPath } from '../src/auth/guards.jsx';

const ctx = (status, body) => ({ context: new Response(JSON.stringify(body), { status }) });

describe('errorMessage', () => {
  it('maps auth, postgres and PostgREST codes', () => {
    expect(errorMessage({ code: 'invalid_credentials', message: 'x' })).toBe('E-Mail oder Passwort ist falsch.');
    expect(errorMessage({ code: '23505', message: 'duplicate key' })).toBe('Dieser Wert ist bereits vergeben.');
    expect(errorMessage({ code: 'PGRST116', message: 'x' })).toMatch(/existiert nicht mehr/);
  });
  it('explains a failed invite trigger', () => {
    expect(errorMessage({ message: 'Database error saving new user' })).toMatch(/Einladungscode/);
  });
  it('translates network errors from all browsers', () => {
    for (const m of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'TypeError: Failed to send a request']) {
      expect(errorMessage(new Error(m))).toBe(NETWORK_MESSAGE);
    }
  });
  it('falls back to the message', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
  });
});

describe('functionError', () => {
  it('uses machine-readable codes', async () => {
    const err = await functionError(ctx(400, { error: 'x', code: 'NOT_IMDB_CSV' }));
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toMatch(/keine IMDb-CSV/);
    expect(err.retryable).toBe(false);
  });
  it('derives codes from older responses and never shows admin hints to friends for outages', async () => {
    expect((await functionError(ctx(500, { error: 'TMDB_API_KEY is not configured' }))).message).toMatch(/noch nicht eingerichtet/);
    const outage = await functionError(ctx(502, { error: 'TMDb request failed (503)' }));
    expect(outage.message).toMatch(/nicht erreichbar/);
    expect(outage.retryable).toBe(true);
  });
  it('treats fetch failures as network errors', async () => {
    const err = await functionError({ name: 'FunctionsFetchError', message: 'Failed to send a request' });
    expect(err.message).toBe(NETWORK_MESSAGE);
    expect(isRetryable(err)).toBe(true);
  });
  it('passes through errors without response', async () => {
    const e = new Error('offline');
    expect(await functionError(e)).toBe(e);
  });
});

describe('helpers', () => {
  it('unwrap returns data or throws', () => {
    expect(unwrap({ data: 1, error: null })).toBe(1);
    expect(() => unwrap({ data: null, error: new Error('x') })).toThrow('x');
  });
  it('reads auth errors from e-mail links', () => {
    expect(readAuthUrlError({ hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid', search: '' })).toEqual({
      code: 'otp_expired',
      description: 'Email link is invalid',
    });
    expect(readAuthUrlError({ hash: '#access_token=abc', search: '' })).toBeNull();
  });
  it('only accepts same-app return paths', () => {
    expect(safeReturnPath('/import?x=1')).toBe('/import?x=1');
    expect(safeReturnPath('//evil.example')).toBe('/');
    expect(safeReturnPath('https://evil.example')).toBe('/');
    expect(safeReturnPath(undefined)).toBe('/');
  });
});
