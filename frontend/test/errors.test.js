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
