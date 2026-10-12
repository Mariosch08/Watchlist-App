import { HttpError } from './http.js';

export function optionalString(value, name, { min = 0, max = 200, pattern } = {}) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${name} must be a string`);
  const v = value.trim();
  if (v.length < min || v.length > max) throw new HttpError(400, `${name} must be ${min}-${max} characters`);
  if (pattern && !pattern.test(v)) throw new HttpError(400, `${name} has an invalid format`);
  return v;
}

export function requiredString(value, name, opts) {
  const v = optionalString(value, name, { min: 1, ...opts });
  if (v === undefined) throw new HttpError(400, `${name} is required`);
  return v;
}

export function integer(value, name, { min, max, defaultValue } = {}) {
  if (value === undefined || value === null || value === '') {
    if (defaultValue !== undefined) return defaultValue;
    throw new HttpError(400, `${name} is required`);
  }
  const n = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
    throw new HttpError(400, `${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) throw new HttpError(400, `${name} must be one of: ${allowed.join(', ')}`);
  return value;
}
