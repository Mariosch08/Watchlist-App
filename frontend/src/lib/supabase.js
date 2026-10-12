import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing (see .env.example)');

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing');

// Absolute app URL incl. GitHub Pages base path, used for e-mail links.
export const appUrl = (path = '') => new URL(import.meta.env.BASE_URL + path, window.location.origin).toString();
