import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, isConditionalFailure, tableName } from '../lib/db.js';
import { normalizeInviteCode } from '../lib/invites.js';
import { INVITE_SK, invitePk } from '../lib/keys.js';

// Cognito shows these messages to the client as "PreSignUp failed with error <message>".
export const ERR_MISSING = 'INVITE_REQUIRED';
export const ERR_INVALID = 'INVITE_INVALID';

function readInviteCode(request = {}) {
  return request.validationData?.invite_code ?? request.clientMetadata?.invite_code;
}

// Self sign-up is only possible with a valid invite code. Admin-created users are always allowed.
export async function handler(event) {
  if (event.triggerSource === 'PreSignUp_AdminCreateUser') return event;
  if (event.triggerSource !== 'PreSignUp_SignUp') throw new Error(ERR_INVALID);

  const code = normalizeInviteCode(readInviteCode(event.request));
  if (!code) throw new Error(ERR_MISSING);
  const email = String(event.request?.userAttributes?.email ?? '').toLowerCase();

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName(),
        Key: { PK: invitePk(code), SK: INVITE_SK },
        UpdateExpression: 'SET uses = uses + :one, used_by = list_append(if_not_exists(used_by, :empty), :email)',
        ConditionExpression: 'attribute_exists(PK) AND uses < max_uses AND expires_at > :now',
        ExpressionAttributeValues: { ':one': 1, ':empty': [], ':email': [email], ':now': new Date().toISOString() },
      }),
    );
  } catch (err) {
    if (isConditionalFailure(err)) throw new Error(ERR_INVALID);
    throw err;
  }
  return event;
}
