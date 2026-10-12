// Copies items from a legacy watchlist table into the new table under the given user.
// Usage: TABLE_NAME=watchlist-dev node scripts/migrate-legacy.mjs <legacyTable> <cognitoSub> [--apply]
// Without --apply it only prints what would be written (dry run). Re-running is safe (no overwrite).
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, isConditionalFailure, tableName } from '../src/lib/db.js';
import { mapLegacyItem } from '../src/lib/legacy.js';

const [legacyTable, userId] = process.argv.slice(2);
const apply = process.argv.includes('--apply');
if (!tableName() || !legacyTable || !userId) {
  console.error('Usage: TABLE_NAME=... node scripts/migrate-legacy.mjs <legacyTable> <cognitoSub> [--apply]');
  process.exit(1);
}

const stats = { scanned: 0, mapped: 0, written: 0, skipped: 0, existing: 0 };
let ExclusiveStartKey;
do {
  const res = await ddb.send(new ScanCommand({ TableName: legacyTable, ExclusiveStartKey }));
  for (const raw of res.Items ?? []) {
    stats.scanned++;
    const item = mapLegacyItem(raw, userId);
    if (!item) {
      stats.skipped++;
      console.warn('Skipped (no TMDb id):', JSON.stringify(raw));
      continue;
    }
    stats.mapped++;
    if (!apply) continue;
    try {
      await ddb.send(new PutCommand({ TableName: tableName(), Item: item, ConditionExpression: 'attribute_not_exists(PK)' }));
      stats.written++;
    } catch (err) {
      if (!isConditionalFailure(err)) throw err;
      stats.existing++;
    }
  }
  ExclusiveStartKey = res.LastEvaluatedKey;
} while (ExclusiveStartKey);
console.log(apply ? 'Migration done:' : 'Dry run (use --apply to write):', stats);
