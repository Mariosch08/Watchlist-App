import { describe, expect, it } from 'vitest';
import { getAuth, parseGroups, requireAdmin } from '../src/lib/auth.js';
import { apiEvent } from './helpers.js';

describe('parseGroups', () => {
  it.each([
    [undefined, []],
    ['[admins]', ['admins']],
    ['[admins friends]', ['admins', 'friends']],
    ['admins,friends', ['admins', 'friends']],
    [['admins'], ['admins']],
  ])('%j -> %j', (input, expected) => expect(parseGroups(input)).toEqual(expected));
});

describe('getAuth', () => {
  it('reads identity from JWT claims', () => {
    const auth = getAuth(apiEvent({ sub: 'abc', groups: '[admins]' }));
    expect(auth).toMatchObject({ userId: 'abc', username: 'abc', email: 'a@example.com', groups: ['admins'] });
  });
  it('rejects requests without claims', () => {
    expect(() => getAuth(apiEvent({ sub: null }))).toThrow(/Unauthorized/);
  });
  it('requireAdmin only passes admins', () => {
    expect(() => requireAdmin({ groups: [] })).toThrow(/Forbidden/);
    expect(() => requireAdmin({ groups: ['admins'] })).not.toThrow();
  });
});
