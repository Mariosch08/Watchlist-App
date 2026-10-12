import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { requireAdmin } from '../lib/auth.js';
import { ddb, queryAll, tableName } from '../lib/db.js';
import { HttpError, json, parseBody } from '../lib/http.js';
import { buildInvite, normalizeInviteCode } from '../lib/invites.js';
import { INVITE_SK, invitePk, INVITES_GSI_PK, stripKeys } from '../lib/keys.js';
import { integer, optionalString } from '../lib/validate.js';

export async function createInvite({ auth, event }) {
  requireAdmin(auth);
  const body = parseBody(event);
  const invite = buildInvite({
    createdBy: auth.userId,
    maxUses: integer(body.max_uses, 'max_uses', { min: 1, max: 50, defaultValue: 1 }),
    expiresInDays: integer(body.expires_in_days, 'expires_in_days', { min: 1, max: 90, defaultValue: 14 }),
    note: optionalString(body.note, 'note', { max: 100 }),
  });
  await ddb.send(new PutCommand({ TableName: tableName(), Item: invite, ConditionExpression: 'attribute_not_exists(PK)' }));
  return json(201, { invite: stripKeys(invite) });
}

export async function listInvites({ auth }) {
  requireAdmin(auth);
  const items = await queryAll({
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': INVITES_GSI_PK },
    ScanIndexForward: false,
  });
  return { invites: items.map(stripKeys) };
}

export async function revokeInvite({ auth, params }) {
  requireAdmin(auth);
  const code = normalizeInviteCode(params.code);
  if (!code) throw new HttpError(400, 'Invalid invite code');
  await ddb.send(new DeleteCommand({ TableName: tableName(), Key: { PK: invitePk(code), SK: INVITE_SK } }));
  return json(204, {});
}
