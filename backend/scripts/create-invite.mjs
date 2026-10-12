// Usage: TABLE_NAME=watchlist-dev node scripts/create-invite.mjs [maxUses] [expiresInDays]
// Bootstraps the first invite code (before any admin account exists).
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tableName } from '../src/lib/db.js';
import { buildInvite } from '../src/lib/invites.js';

if (!tableName()) throw new Error('TABLE_NAME is required');
const invite = buildInvite({
  createdBy: 'cli',
  maxUses: Number(process.argv[2] ?? 1),
  expiresInDays: Number(process.argv[3] ?? 14),
  note: 'created via CLI',
});
await ddb.send(new PutCommand({ TableName: tableName(), Item: invite, ConditionExpression: 'attribute_not_exists(PK)' }));
console.log(`Invite code: ${invite.code} (max uses ${invite.max_uses}, expires ${invite.expires_at})`);
