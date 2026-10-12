import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchWriteCommand, DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

export const tableName = () => process.env.TABLE_NAME;

export async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new QueryCommand({ TableName: tableName(), ...params, ExclusiveStartKey }));
    items.push(...(res.Items ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

export async function batchDelete(keys) {
  for (let i = 0; i < keys.length; i += 25) {
    let requests = keys.slice(i, i + 25).map((Key) => ({ DeleteRequest: { Key } }));
    for (let attempt = 0; requests.length && attempt < 5; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 100 * 2 ** attempt));
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [tableName()]: requests } }));
      requests = res.UnprocessedItems?.[tableName()] ?? [];
    }
    if (requests.length) throw new Error('Batch delete did not complete');
  }
}

export const isConditionalFailure = (err) =>
  err?.name === 'ConditionalCheckFailedException' || err?.name === 'TransactionCanceledException';
