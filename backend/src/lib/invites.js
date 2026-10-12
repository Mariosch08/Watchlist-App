import { randomInt } from 'node:crypto';
import { INVITE_SK, invitePk, INVITES_GSI_PK } from './keys.js';

// No ambiguous characters (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DAY_MS = 86_400_000;

export function generateInviteCode(length = 10) {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function normalizeInviteCode(raw) {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{6,32}$/.test(code) ? code : null;
}

export function buildInvite({ createdBy, maxUses = 1, expiresInDays = 14, note, now = new Date() }) {
  const code = generateInviteCode();
  const expiresAt = new Date(now.getTime() + expiresInDays * DAY_MS);
  return {
    PK: invitePk(code),
    SK: INVITE_SK,
    GSI1PK: INVITES_GSI_PK,
    GSI1SK: now.toISOString(),
    entity: 'invite',
    code,
    created_by: createdBy,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    max_uses: maxUses,
    uses: 0,
    note: note || undefined,
    // DynamoDB TTL cleans up expired invites 30 days after expiry.
    ttl: Math.floor(expiresAt.getTime() / 1000) + 30 * 86_400,
  };
}
