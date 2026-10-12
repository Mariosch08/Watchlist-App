import { AdminDeleteUserCommand, CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { GetCommand, PutCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ADMIN_GROUP } from '../lib/auth.js';
import { batchDelete, ddb, isConditionalFailure, queryAll, tableName } from '../lib/db.js';
import { HttpError, json, parseBody } from '../lib/http.js';
import { PROFILE_SK, stripKeys, USERNAME_SK, userPk, usernamePk } from '../lib/keys.js';
import { optionalString } from '../lib/validate.js';

const cognito = new CognitoIdentityProviderClient({});
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

function toPublicProfile(profile, auth) {
  return { ...stripKeys(profile), is_admin: auth.groups.includes(ADMIN_GROUP) };
}

async function loadProfile(userId) {
  const res = await ddb.send(new GetCommand({ TableName: tableName(), Key: { PK: userPk(userId), SK: PROFILE_SK } }));
  return res.Item ?? null;
}

export async function getMe({ auth }) {
  let profile = await loadProfile(auth.userId);
  if (!profile) {
    profile = {
      PK: userPk(auth.userId),
      SK: PROFILE_SK,
      entity: 'profile',
      user_id: auth.userId,
      email: auth.email,
      display_name: auth.email ? auth.email.split('@')[0].slice(0, 50) : 'Neuer Nutzer',
      username: null,
      created_at: new Date().toISOString(),
    };
    try {
      await ddb.send(new PutCommand({ TableName: tableName(), Item: profile, ConditionExpression: 'attribute_not_exists(PK)' }));
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
      profile = await loadProfile(auth.userId);
    }
  }
  return { profile: toPublicProfile(profile, auth) };
}

export async function updateMe({ auth, event }) {
  const body = parseBody(event);
  const displayName = optionalString(body.display_name, 'display_name', { min: 1, max: 50 });
  const username =
    body.username === undefined ? undefined : optionalString(String(body.username).toLowerCase(), 'username', { pattern: USERNAME_PATTERN, max: 20 });
  if (displayName === undefined && username === undefined) throw new HttpError(400, 'Nothing to update');

  const { profile: current } = await getMe({ auth });
  const pk = userPk(auth.userId);
  const now = new Date().toISOString();
  const sets = ['updated_at = :now'];
  const values = { ':now': now };
  if (displayName !== undefined) {
    sets.push('display_name = :dn');
    values[':dn'] = displayName;
  }

  const transact = [];
  if (username !== undefined && username !== current.username) {
    sets.push('username = :un');
    values[':un'] = username;
    // Username uniqueness via a lock item owned by this user.
    transact.push({
      Put: {
        TableName: tableName(),
        Item: { PK: usernamePk(username), SK: USERNAME_SK, entity: 'username', owner: auth.userId },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    });
    if (current.username) {
      transact.push({
        Delete: {
          TableName: tableName(),
          Key: { PK: usernamePk(current.username), SK: USERNAME_SK },
          ConditionExpression: '#owner = :me',
          ExpressionAttributeNames: { '#owner': 'owner' },
          ExpressionAttributeValues: { ':me': auth.userId },
        },
      });
    }
  }
  transact.push({
    Update: {
      TableName: tableName(),
      Key: { PK: pk, SK: PROFILE_SK },
      UpdateExpression: `SET ${sets.join(', ')}`,
      ExpressionAttributeValues: values,
    },
  });
  try {
    await ddb.send(new TransactWriteCommand({ TransactItems: transact }));
  } catch (err) {
    if (isConditionalFailure(err)) throw new HttpError(409, 'Username already taken');
    throw err;
  }
  return getMe({ auth });
}

async function loadAllUserItems(userId) {
  return queryAll({ KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': userPk(userId) } });
}

export async function exportMe({ auth }) {
  const items = await loadAllUserItems(auth.userId);
  const data = {
    format: 'watchlist-app-export',
    version: 1,
    exported_at: new Date().toISOString(),
    user: { id: auth.userId, email: auth.email },
    items: items.map((i) => ({ kind: i.SK, ...stripKeys(i) })),
  };
  return json(200, data, { 'content-disposition': 'attachment; filename="watchlist-export.json"' });
}

export async function deleteMe({ auth }) {
  const items = await loadAllUserItems(auth.userId);
  const keys = items.map((i) => ({ PK: i.PK, SK: i.SK }));
  const profile = items.find((i) => i.SK === PROFILE_SK);
  if (profile?.username) keys.push({ PK: usernamePk(profile.username), SK: USERNAME_SK });
  // Data first: if the Cognito call fails, the user can still log in and retry.
  await batchDelete(keys);
  await cognito.send(new AdminDeleteUserCommand({ UserPoolId: process.env.USER_POOL_ID, Username: auth.username }));
  return json(204, {});
}
