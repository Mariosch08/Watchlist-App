import { createClient } from '@supabase/supabase-js';
import { functionError } from './errors.js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing (see .env.example)');

// Auth errors from e-mail links (e.g. expired confirmation link) arrive in the URL.
// Read them before supabase-js cleans up the URL.
export function readAuthUrlError(location) {
  if (!location) return null;
  const hash = new URLSearchParams((location.hash || '').replace(/^#/, ''));
  const query = new URLSearchParams(location.search || '');
  const get = (key) => hash.get(key) ?? query.get(key);
  const code = get('error_code') ?? get('error');
  if (!code) return null;
  return { code, description: get('error_description') ?? '' };
}

export const authUrlError = typeof window === 'undefined' ? null : readAuthUrlError(window.location);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing');

// Absolute app URL incl. GitHub Pages base path, used for e-mail links and invite links.
export const appUrl = (path = '') => new URL(import.meta.env.BASE_URL + path, window.location.origin).toString();

// Calls an Edge Function and throws a readable AppError on failure.
export async function invokeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw await functionError(error);
  return data;
}
