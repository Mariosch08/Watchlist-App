import { describe, expect, it, vi } from 'vitest';
import { CognitoError, createCognitoClient, decodeJwt, errorMessage } from '../src/auth/cognito.js';

const ok = (data) => ({ ok: true, json: async () => data });
const fail = (type, message) => ({ ok: false, json: async () => ({ __type: type, message }) });

describe('cognito client', () => {
  it('sends the invite code as validation data on sign-up', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok({}));
    const c = createCognitoClient({ region: 'eu-central-1', clientId: 'cid', fetchImpl });
    await c.signUp('a@b.ch', 'secret12345', 'CODE123');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://cognito-idp.eu-central-1.amazonaws.com/');
    expect(init.headers['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.SignUp');
    expect(JSON.parse(init.body).ValidationData).toEqual([{ Name: 'invite_code', Value: 'CODE123' }]);
  });

  it('returns tokens on sign-in and keeps refresh token on refresh', async () => {
    const result = { IdToken: 'id', AccessToken: 'acc', RefreshToken: 'ref', ExpiresIn: 3600 };
    const fetchImpl = vi.fn().mockResolvedValueOnce(ok({ AuthenticationResult: result })).mockResolvedValueOnce(ok({ AuthenticationResult: { ...result, RefreshToken: undefined } }));
    const c = createCognitoClient({ region: 'r', clientId: 'cid', fetchImpl });
    expect(await c.signIn('a@b.ch', 'pw')).toMatchObject({ idToken: 'id', refreshToken: 'ref' });
    expect(await c.refresh('ref')).toMatchObject({ idToken: 'id', refreshToken: 'ref' });
  });

  it('maps errors to German messages', async () => {
    const c = createCognitoClient({ region: 'r', clientId: 'cid', fetchImpl: vi.fn().mockResolvedValue(fail('com.amazon#NotAuthorizedException', 'x')) });
    const err = await c.signIn('a', 'b').catch((e) => e);
    expect(err).toBeInstanceOf(CognitoError);
    expect(errorMessage(err)).toBe('E-Mail oder Passwort ist falsch.');
    expect(errorMessage(new CognitoError('UserLambdaValidationException', 'PreSignUp failed with error INVITE_INVALID.'))).toMatch(/Einladungscode ist ungültig/);
  });

  it('decodes JWT payloads including unicode', () => {
    const payload = Buffer.from(JSON.stringify({ sub: '1', name: 'Zürich' })).toString('base64url');
    expect(decodeJwt(`h.${payload}.s`)).toEqual({ sub: '1', name: 'Zürich' });
  });
});
