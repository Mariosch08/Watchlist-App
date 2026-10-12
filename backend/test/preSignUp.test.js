import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { ERR_INVALID, ERR_MISSING, handler } from '../src/handlers/preSignUp.js';

const ddbMock = mockClient(DynamoDBDocumentClient);
const signUp = (validationData) => ({
  triggerSource: 'PreSignUp_SignUp',
  request: { userAttributes: { email: 'Friend@Example.com' }, validationData },
  response: {},
});

beforeEach(() => {
  ddbMock.reset();
  process.env.TABLE_NAME = 'test-table';
});

describe('preSignUp', () => {
  it('rejects sign-up without invite code', async () => {
    await expect(handler(signUp({}))).rejects.toThrow(ERR_MISSING);
    expect(ddbMock.calls()).toHaveLength(0);
  });

  it('consumes a valid invite code (normalised)', async () => {
    ddbMock.on(UpdateCommand).resolves({});
    const event = signUp({ invite_code: 'abcd-efgh-23' });
    await expect(handler(event)).resolves.toBe(event);
    const input = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(input.Key).toEqual({ PK: 'INVITE#ABCDEFGH23', SK: 'INVITE' });
    expect(input.ConditionExpression).toContain('uses < max_uses');
    expect(input.ExpressionAttributeValues[':email']).toEqual(['friend@example.com']);
  });

  it('rejects unknown, used up or expired codes', async () => {
    ddbMock.on(UpdateCommand).rejects(new ConditionalCheckFailedException({ message: 'x', $metadata: {} }));
    await expect(handler(signUp({ invite_code: 'ABCDEFGH23' }))).rejects.toThrow(ERR_INVALID);
  });

  it('allows admin-created users without code', async () => {
    const event = { triggerSource: 'PreSignUp_AdminCreateUser', request: {}, response: {} };
    await expect(handler(event)).resolves.toBe(event);
  });

  it('rejects external providers', async () => {
    await expect(handler({ triggerSource: 'PreSignUp_ExternalProvider', request: {} })).rejects.toThrow(ERR_INVALID);
  });
});
