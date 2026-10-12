import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, isConditionalFailure, queryAll, tableName } from '../lib/db.js';
import { HttpError, json, parseBody } from '../lib/http.js';
import { stripKeys, userPk, WATCHLIST_PREFIX, watchlistSk } from '../lib/keys.js';
import { normalizeTitle, tmdbGet, TMDB_LANGUAGE } from '../lib/tmdb.js';
import { integer, oneOf, requiredString } from '../lib/validate.js';

export const MEDIA_TYPES = ['movie', 'tv'];

export async function list({ auth }) {
  const items = await queryAll({
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: { ':pk': userPk(auth.userId), ':prefix': WATCHLIST_PREFIX },
  });
  items.sort((a, b) => String(b.added_at).localeCompare(String(a.added_at)));
  return { items: items.map(stripKeys) };
}

export async function add({ auth, event }) {
  const body = parseBody(event);
  const mediaType = oneOf(body.media_type, 'media_type', MEDIA_TYPES);
  const tmdbId = integer(body.tmdb_id, 'tmdb_id', { min: 1, max: 1e9 });
  // Title data is always fetched from TMDb, never trusted from the client.
  const raw = await tmdbGet(`/${mediaType}/${tmdbId}`, { language: TMDB_LANGUAGE });
  if (!raw) throw new HttpError(404, 'Title not found on TMDb');
  const item = {
    PK: userPk(auth.userId),
    SK: watchlistSk(mediaType, tmdbId),
    entity: 'watchlist',
    ...normalizeTitle(raw, mediaType),
    status: 'planned',
    source: 'manual',
    added_at: new Date().toISOString(),
  };
  try {
    await ddb.send(new PutCommand({ TableName: tableName(), Item: item, ConditionExpression: 'attribute_not_exists(PK)' }));
  } catch (err) {
    if (isConditionalFailure(err)) return json(200, { item: stripKeys(item), already_exists: true });
    throw err;
  }
  return json(201, { item: stripKeys(item) });
}

export async function remove({ auth, params }) {
  const mediaType = oneOf(params.media_type, 'media_type', MEDIA_TYPES);
  const tmdbId = integer(params.tmdb_id, 'tmdb_id', { min: 1, max: 1e9 });
  await ddb.send(new DeleteCommand({ TableName: tableName(), Key: { PK: userPk(auth.userId), SK: watchlistSk(mediaType, tmdbId) } }));
  return json(204, {});
}

export async function search({ query }) {
  const q = requiredString(query.q, 'q', { max: 100 });
  const page = integer(query.page, 'page', { min: 1, max: 20, defaultValue: 1 });
  const res = await tmdbGet('/search/multi', { query: q, page, language: TMDB_LANGUAGE, include_adult: 'false' });
  const results = (res?.results ?? [])
    .filter((r) => MEDIA_TYPES.includes(r.media_type))
    .map((r) => normalizeTitle(r, r.media_type));
  return { page, total_pages: res?.total_pages ?? 0, results };
}
