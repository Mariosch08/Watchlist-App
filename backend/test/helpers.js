export function apiEvent({ method = 'GET', path = '/', sub = 'user-a', groups, email = 'a@example.com', body, query } = {}) {
  const claims = sub ? { sub, email, 'cognito:username': sub } : undefined;
  if (claims && groups) claims['cognito:groups'] = groups;
  return {
    rawPath: path,
    requestContext: { http: { method }, authorizer: claims ? { jwt: { claims } } : undefined },
    queryStringParameters: query,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  };
}
export const parse = (res) => (res.body ? JSON.parse(res.body) : undefined);
