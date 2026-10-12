// Minimal Cognito User Pools client using the public (unsigned) JSON API. No SDK needed.
export class CognitoError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createCognitoClient({ region, clientId, fetchImpl = (...a) => fetch(...a) }) {
  async function call(target, body) {
    const res = await fetchImpl(`https://cognito-idp.${region}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new CognitoError(String(data.__type ?? 'Unknown').split('#').pop(), data.message ?? '');
    return data;
  }

  const tokens = (r) => ({
    idToken: r.IdToken,
    accessToken: r.AccessToken,
    refreshToken: r.RefreshToken,
    expiresAt: Date.now() + r.ExpiresIn * 1000,
  });

  return {
    signUp: (email, password, inviteCode) =>
      call('SignUp', {
        ClientId: clientId,
        Username: email,
        Password: password,
        UserAttributes: [{ Name: 'email', Value: email }],
        ValidationData: [{ Name: 'invite_code', Value: inviteCode }],
      }),
    confirmSignUp: (email, code) => call('ConfirmSignUp', { ClientId: clientId, Username: email, ConfirmationCode: code }),
    resendCode: (email) => call('ResendConfirmationCode', { ClientId: clientId, Username: email }),
    async signIn(email, password) {
      const r = await call('InitiateAuth', {
        ClientId: clientId,
        AuthFlow: 'USER_PASSWORD_AUTH',
        AuthParameters: { USERNAME: email, PASSWORD: password },
      });
      if (!r.AuthenticationResult) throw new CognitoError(r.ChallengeName ?? 'ChallengeRequired', 'Unsupported challenge');
      return tokens(r.AuthenticationResult);
    },
    async refresh(refreshToken) {
      const r = await call('InitiateAuth', {
        ClientId: clientId,
        AuthFlow: 'REFRESH_TOKEN_AUTH',
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      });
      return { ...tokens(r.AuthenticationResult), refreshToken };
    },
    forgotPassword: (email) => call('ForgotPassword', { ClientId: clientId, Username: email }),
    confirmForgotPassword: (email, code, password) =>
      call('ConfirmForgotPassword', { ClientId: clientId, Username: email, ConfirmationCode: code, Password: password }),
    changePassword: (accessToken, oldPassword, newPassword) =>
      call('ChangePassword', { AccessToken: accessToken, PreviousPassword: oldPassword, ProposedPassword: newPassword }),
    revoke: (refreshToken) => call('RevokeToken', { ClientId: clientId, Token: refreshToken }),
  };
}

const MESSAGES = {
  UsernameExistsException: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
  InvalidPasswordException: 'Das Passwort erfüllt die Anforderungen nicht (mind. 10 Zeichen, Kleinbuchstaben und Zahlen).',
  CodeMismatchException: 'Der Code ist falsch.',
  ExpiredCodeException: 'Der Code ist abgelaufen. Fordere einen neuen an.',
  NotAuthorizedException: 'E-Mail oder Passwort ist falsch.',
  UserNotConfirmedException: 'Bitte bestätige zuerst deine E-Mail-Adresse.',
  LimitExceededException: 'Zu viele Versuche. Bitte warte kurz.',
  TooManyRequestsException: 'Zu viele Versuche. Bitte warte kurz.',
  InvalidParameterException: 'Ungültige Eingabe.',
  NEW_PASSWORD_REQUIRED: 'Für dieses Konto muss ein neues Passwort gesetzt werden. Nutze „Passwort vergessen“.',
};

export function errorMessage(err) {
  if (err?.code === 'UserLambdaValidationException') {
    if (err.message.includes('INVITE_REQUIRED')) return 'Bitte gib einen Einladungscode ein.';
    return 'Der Einladungscode ist ungültig, abgelaufen oder bereits verbraucht.';
  }
  return MESSAGES[err?.code] ?? err?.message ?? 'Unbekannter Fehler.';
}

export function decodeJwt(token) {
  const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(
    Array.from(atob(part), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''),
  );
  return JSON.parse(json);
}
