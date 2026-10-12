import { describe, expect, it } from 'vitest';
import { errorMessage, unwrap } from '../src/lib/errors.js';

describe('errorMessage', () => {
  it('maps auth error codes', () => {
    expect(errorMessage({ code: 'invalid_credentials', message: 'x' })).toBe('E-Mail oder Passwort ist falsch.');
  });
  it('maps postgres codes (unique username)', () => {
    expect(errorMessage({ code: '23505', message: 'duplicate key' })).toBe('Dieser Wert ist bereits vergeben.');
  });
  it('explains failed invite trigger', () => {
    expect(errorMessage({ message: 'Database error saving new user' })).toMatch(/Einladungscode/);
  });
  it('falls back to the message', () => {
    expect(errorMessage(new Error('Boom'))).toBe('Boom');
  });
});

describe('unwrap', () => {
  it('returns data or throws error', () => {
    expect(unwrap({ data: 1, error: null })).toBe(1);
    expect(() => unwrap({ data: null, error: new Error('x') })).toThrow('x');
  });
});

describe('functionError', async () => {
  const { functionError } = await import('../src/lib/errors.js');
  const ctx = (status, body) => ({ context: new Response(JSON.stringify(body), { status }) });
  it('explains a missing TMDb key', async () => {
    expect((await functionError(ctx(500, { error: 'TMDB_API_KEY is not configured' }))).message).toMatch(/TMDB_API_KEY in Supabase anlegen/);
  });
  it('includes status and server message', async () => {
    expect((await functionError(ctx(502, { error: 'TMDb request failed (401)' }))).message).toBe(
      'TMDb lehnt den Schlüssel ab – Secret TMDB_API_KEY in Supabase prüfen. (Status 502: TMDb request failed (401))',
    );
  });
  it('passes through errors without response', async () => {
    const e = new Error('offline');
    expect(await functionError(e)).toBe(e);
  });
});
