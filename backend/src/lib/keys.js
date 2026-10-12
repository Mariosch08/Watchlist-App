// Single-table key schema. Every user-owned item lives under PK = USER#<sub>.
export const userPk = (userId) => `USER#${userId}`;
export const PROFILE_SK = 'PROFILE';
export const WATCHLIST_PREFIX = 'WL#';
export const watchlistSk = (mediaType, tmdbId) => `${WATCHLIST_PREFIX}${mediaType}#${tmdbId}`;
export const invitePk = (code) => `INVITE#${code}`;
export const INVITE_SK = 'INVITE';
export const INVITES_GSI_PK = 'INVITES';
export const usernamePk = (username) => `USERNAME#${username}`;
export const USERNAME_SK = 'USERNAME';

const INTERNAL_KEYS = ['PK', 'SK', 'GSI1PK', 'GSI1SK'];

export function stripKeys(item) {
  const out = { ...item };
  for (const k of INTERNAL_KEYS) delete out[k];
  return out;
}
