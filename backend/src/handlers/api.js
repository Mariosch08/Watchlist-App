import { getAuth } from '../lib/auth.js';
import { HttpError, json } from '../lib/http.js';
import * as admin from '../routes/admin.js';
import * as me from '../routes/me.js';
import * as watchlist from '../routes/watchlist.js';

const ROUTES = [
  ['GET', '/me', me.getMe],
  ['PUT', '/me', me.updateMe],
  ['DELETE', '/me', me.deleteMe],
  ['GET', '/me/export', me.exportMe],
  ['GET', '/watchlist', watchlist.list],
  ['POST', '/watchlist', watchlist.add],
  ['DELETE', '/watchlist/{media_type}/{tmdb_id}', watchlist.remove],
  ['GET', '/search', watchlist.search],
  ['GET', '/admin/invites', admin.listInvites],
  ['POST', '/admin/invites', admin.createInvite],
  ['DELETE', '/admin/invites/{code}', admin.revokeInvite],
].map(([method, pattern, fn]) => {
  const names = [];
  const regex = new RegExp(
    '^' + pattern.replace(/\{(\w+)\}/g, (_, n) => (names.push(n), '([^/]+)')) + '/?$',
  );
  return { method, regex, names, fn };
});

export function matchRoute(method, path) {
  for (const r of ROUTES) {
    if (r.method !== method) continue;
    const m = r.regex.exec(path);
    if (m) return { fn: r.fn, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export async function handler(event) {
  try {
    const method = event?.requestContext?.http?.method;
    const route = matchRoute(method, event?.rawPath ?? '');
    if (!route) throw new HttpError(404, 'Not found');
    const auth = getAuth(event);
    const result = await route.fn({ event, auth, params: route.params, query: event.queryStringParameters ?? {} });
    return result?.statusCode ? result : json(200, result);
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message });
    console.error('Unhandled error', err);
    return json(500, { error: 'Internal server error' });
  }
}
