import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler, matchRoute } from '../src/handlers/api.js';
import { clearSecretCache } from '../src/lib/ssm.js';
import { apiEvent, parse } from './helpers.js';

const ddbMock = mockClient(DynamoDBDocumentClient);
const cognitoMock = mockClient(CognitoIdentityProviderClient);
const ssmMock = mockClient(SSMClient);

beforeEach(() => {
  ddbMock.reset();
  cognitoMock.reset();
  ssmMock.reset();
  clearSecretCache();
  process.env.TABLE_NAME = 'test-table';
  process.env.USER_POOL_ID = 'pool-1';
  process.env.TMDB_SECRET_PARAM = '/watchlist/test/tmdb';
  ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'v3key' } });
});
afterEach(() => vi.unstubAllGlobals());

const allPks = () =>
  ddbMock.calls().flatMap((c) => {
    const i = c.args[0].input;
    const out = [];
    if (i.Key) out.push(i.Key.PK);
    if (i.Item) out.push(i.Item.PK);
    if (i.ExpressionAttributeValues?.[':pk']) out.push(i.ExpressionAttributeValues[':pk']);
    for (const reqs of Object.values(i.RequestItems ?? {})) for (const r of reqs) out.push(r.DeleteRequest.Key.PK);
    for (const t of i.TransactItems ?? []) out.push((t.Put?.Item ?? t.Update?.Key ?? t.Delete?.Key).PK);
    return out;
  });

describe('router', () => {
  it('matches path parameters', () => {
    const m = matchRoute('DELETE', '/watchlist/tv/1399');
    expect(m.params).toEqual({ media_type: 'tv', tmdb_id: '1399' });
    expect(matchRoute('PATCH', '/watchlist')).toBeNull();
  });
  it('returns 404 for unknown routes and 401 without token', async () => {
    expect((await handler(apiEvent({ path: '/nope' }))).statusCode).toBe(404);
    expect((await handler(apiEvent({ path: '/me', sub: null }))).statusCode).toBe(401);
  });
  it('hides internal errors', async () => {
    ddbMock.on(GetCommand).rejects(new Error('boom secret detail'));
    const res = await handler(apiEvent({ path: '/me' }));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret detail');
  });
});

describe('profile', () => {
  it('creates a profile lazily from token claims', async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock.on(PutCommand).resolves({});
    const res = await handler(apiEvent({ path: '/me', groups: '[admins]' }));
    expect(parse(res).profile).toMatchObject({ user_id: 'user-a', email: 'a@example.com', display_name: 'a', is_admin: true });
    expect(parse(res).profile.PK).toBeUndefined();
  });

  it('rejects invalid usernames', async () => {
    const res = await handler(apiEvent({ method: 'PUT', path: '/me', body: { username: 'no spaces!' } }));
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when username is taken', async () => {
    ddbMock.on(GetCommand).resolves({ Item: { PK: 'USER#user-a', SK: 'PROFILE', username: null } });
    ddbMock.on(TransactWriteCommand).rejects(new TransactionCanceledException({ message: 'x', $metadata: {} }));
    const res = await handler(apiEvent({ method: 'PUT', path: '/me', body: { username: 'Mario' } }));
    expect(res.statusCode).toBe(409);
    const tx = ddbMock.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems;
    expect(tx[0].Put.Item).toMatchObject({ PK: 'USERNAME#mario', owner: 'user-a' });
  });
});

describe('data isolation (user A never touches user B)', () => {
  it('export only queries the token user even if another user_id is supplied', async () => {
    ddbMock.on(QueryCommand).resolves({ Items: [{ PK: 'USER#user-a', SK: 'PROFILE', email: 'a@example.com' }] });
    const res = await handler(apiEvent({ path: '/me/export', query: { user_id: 'user-b' }, body: { user_id: 'user-b' } }));
    expect(res.statusCode).toBe(200);
    expect(parse(res).items).toEqual([{ kind: 'PROFILE', email: 'a@example.com' }]);
    expect(allPks()).toEqual(['USER#user-a']);
  });

  it('delete account removes only own items, username lock and own Cognito user', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { PK: 'USER#user-a', SK: 'PROFILE', username: 'alice' },
        { PK: 'USER#user-a', SK: 'WL#movie#1' },
      ],
    });
    ddbMock.on(BatchWriteCommand).resolves({});
    cognitoMock.on(AdminDeleteUserCommand).resolves({});
    const res = await handler(apiEvent({ method: 'DELETE', path: '/me', body: { user_id: 'user-b' } }));
    expect(res.statusCode).toBe(204);
    expect(new Set(allPks())).toEqual(new Set(['USER#user-a', 'USERNAME#alice']));
    expect(cognitoMock.commandCalls(AdminDeleteUserCommand)[0].args[0].input).toEqual({ UserPoolId: 'pool-1', Username: 'user-a' });
  });

  it('watchlist add writes under the token user, ignoring body user_id and title', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 603, title: 'Matrix', release_date: '1999-03-31' }) });
    vi.stubGlobal('fetch', fetchMock);
    ddbMock.on(PutCommand).resolves({});
    const res = await handler(
      apiEvent({ method: 'POST', path: '/watchlist', body: { tmdb_id: 603, media_type: 'movie', user_id: 'user-b', title: 'Hacked' } }),
    );
    expect(res.statusCode).toBe(201);
    const item = ddbMock.commandCalls(PutCommand)[0].args[0].input.Item;
    expect(item).toMatchObject({ PK: 'USER#user-a', SK: 'WL#movie#603', title: 'Matrix', status: 'planned', source: 'manual' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/movie/603');
  });

  it('watchlist delete is scoped to the token user', async () => {
    ddbMock.on(DeleteCommand).resolves({});
    const res = await handler(apiEvent({ method: 'DELETE', path: '/watchlist/movie/603', sub: 'user-b' }));
    expect(res.statusCode).toBe(204);
    expect(allPks()).toEqual(['USER#user-b']);
  });

  it('rejects invalid watchlist input', async () => {
    const res = await handler(apiEvent({ method: 'POST', path: '/watchlist', body: { tmdb_id: 'abc', media_type: 'book' } }));
    expect(res.statusCode).toBe(400);
  });
});

describe('admin invites', () => {
  it('forbids non-admins', async () => {
    const res = await handler(apiEvent({ method: 'POST', path: '/admin/invites', body: {} }));
    expect(res.statusCode).toBe(403);
    expect(ddbMock.calls()).toHaveLength(0);
  });
  it('lets admins create invites', async () => {
    ddbMock.on(PutCommand).resolves({});
    const res = await handler(apiEvent({ method: 'POST', path: '/admin/invites', groups: '[admins]', body: { max_uses: 2 } }));
    expect(res.statusCode).toBe(201);
    expect(parse(res).invite).toMatchObject({ max_uses: 2, uses: 0, created_by: 'user-a' });
  });
});

describe('search', () => {
  it('filters to movies and series', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total_pages: 1, results: [{ id: 1, media_type: 'movie', title: 'A' }, { id: 2, media_type: 'person', name: 'P' }] }),
      }),
    );
    const res = await handler(apiEvent({ path: '/search', query: { q: 'a' } }));
    expect(parse(res).results).toEqual([expect.objectContaining({ tmdb_id: 1, media_type: 'movie', title: 'A' })]);
  });
});
