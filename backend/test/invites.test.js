import { describe, expect, it } from 'vitest';
import { buildInvite, generateInviteCode, normalizeInviteCode } from '../src/lib/invites.js';

describe('invites', () => {
  it('generates codes without ambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(generateInviteCode()).toMatch(/^[A-HJKMNP-Z2-9]{10}$/);
  });
  it('normalises user input', () => {
    expect(normalizeInviteCode(' ab12-cd34 ')).toBe('AB12CD34');
    expect(normalizeInviteCode('x')).toBeNull();
    expect(normalizeInviteCode(undefined)).toBeNull();
  });
  it('builds an invite with expiry and ttl', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const inv = buildInvite({ createdBy: 'admin', maxUses: 3, expiresInDays: 2, now });
    expect(inv).toMatchObject({ PK: `INVITE#${inv.code}`, SK: 'INVITE', uses: 0, max_uses: 3, expires_at: '2026-01-03T00:00:00.000Z' });
    expect(inv.ttl).toBe(Date.parse('2026-01-03T00:00:00Z') / 1000 + 30 * 86400);
  });
});
