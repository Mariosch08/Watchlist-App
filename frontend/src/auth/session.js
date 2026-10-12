import { config } from '../config.js';
import { createCognitoClient, decodeJwt } from './cognito.js';

const STORAGE_KEY = 'watchlist.session';
export const cognito = createCognitoClient({ region: config.region, clientId: config.userPoolClientId });

const listeners = new Set();
let session = load();
let refreshing = null;

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? null;
  } catch {
    return null;
  }
}

function save(next) {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable: session stays in memory only
  }
  listeners.forEach((fn) => fn(currentUser()));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentUser() {
  if (!session?.idToken) return null;
  const c = decodeJwt(session.idToken);
  const groups = c['cognito:groups'] ?? [];
  return { sub: c.sub, email: c.email, isAdmin: groups.includes('admins') };
}

export async function signIn(email, password) {
  save(await cognito.signIn(email.trim().toLowerCase(), password));
}

export async function signOut() {
  const token = session?.refreshToken;
  save(null);
  if (token) await cognito.revoke(token).catch(() => {});
}

export const clearSession = () => save(null);

async function freshSession() {
  if (!session) return null;
  if (session.expiresAt - 60_000 > Date.now()) return session;
  refreshing ??= cognito
    .refresh(session.refreshToken)
    .then(save.bind(null))
    .then(() => session)
    .catch(() => (save(null), null))
    .finally(() => (refreshing = null));
  return refreshing;
}

export async function getIdToken() {
  return (await freshSession())?.idToken ?? null;
}

export async function getAccessToken() {
  return (await freshSession())?.accessToken ?? null;
}
