import { HttpError } from './http.js';

export const ADMIN_GROUP = 'admins';

// HTTP API JWT authorizer passes arrays as strings like "[admins other]".
export function parseGroups(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  let s = String(raw).trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  return s.split(/[\s,]+/).filter(Boolean);
}

// The user identity is taken exclusively from the verified JWT claims, never from the request.
export function getAuth(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) throw new HttpError(401, 'Unauthorized');
  return {
    userId: String(claims.sub),
    username: String(claims['cognito:username'] ?? claims.sub),
    email: claims.email ? String(claims.email) : null,
    groups: parseGroups(claims['cognito:groups']),
  };
}

export function requireAdmin(auth) {
  if (!auth.groups.includes(ADMIN_GROUP)) throw new HttpError(403, 'Forbidden');
}
