import { describe, expect, it } from 'vitest';
import { parseBody } from '../src/lib/http.js';
import { integer, oneOf, optionalString } from '../src/lib/validate.js';

describe('validation', () => {
  it('parses integers from strings and enforces bounds', () => {
    expect(integer('42', 'x', { min: 1, max: 100 })).toBe(42);
    expect(() => integer('4.2', 'x', { min: 1, max: 100 })).toThrow();
    expect(() => integer(0, 'x', { min: 1, max: 100 })).toThrow();
    expect(integer(undefined, 'x', { min: 1, max: 2, defaultValue: 1 })).toBe(1);
  });
  it('trims strings and checks length/pattern', () => {
    expect(optionalString('  hi ', 'x', { max: 5 })).toBe('hi');
    expect(() => optionalString('toolong', 'x', { max: 3 })).toThrow();
    expect(() => optionalString('A!', 'x', { pattern: /^[a-z]+$/ })).toThrow();
    expect(() => optionalString(5, 'x')).toThrow();
  });
  it('oneOf rejects unknown values', () => {
    expect(() => oneOf('book', 'media_type', ['movie', 'tv'])).toThrow();
  });
  it('parseBody rejects invalid JSON and non-objects', () => {
    expect(() => parseBody({ body: '{' })).toThrow(/Invalid JSON/);
    expect(() => parseBody({ body: '[1]' })).toThrow(/object/);
    expect(parseBody({ body: Buffer.from('{"a":1}').toString('base64'), isBase64Encoded: true })).toEqual({ a: 1 });
  });
});
