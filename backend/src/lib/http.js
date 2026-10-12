export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function json(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    body: JSON.stringify(body),
  };
}

const MAX_BODY_BYTES = 100_000;

export function parseBody(event) {
  if (!event?.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'JSON body must be an object');
  }
  return value;
}
