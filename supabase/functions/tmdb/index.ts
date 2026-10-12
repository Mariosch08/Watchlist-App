// TMDb proxy: keeps the TMDb key server-side. Only for logged-in users.
import { adminClient } from '../_shared/admin.ts';
import { requireUser } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { type DetailsCache, handleTmdbRequest } from '../_shared/tmdb.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

// Detail pages are cached in tmdb_cache (shared by all users, no personal data).
function detailsCache(): DetailsCache {
  const db = adminClient();
  return {
    async get(key) {
      const { data, error } = await db.from('tmdb_cache').select('data, expires_at').eq('cache_key', key).maybeSingle();
      if (error) throw error;
      return data && (!data.expires_at || new Date(data.expires_at) > new Date()) ? data.data : null;
    },
    async set(key, data, ttlMs) {
      const { error } = await db.from('tmdb_cache').upsert({
        cache_key: key,
        kind: 'details',
        data,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
      });
      if (error) throw error;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!(await requireUser(req))) return json(401, { error: 'Unauthorized' });
  const body = await req.json().catch(() => null);
  const cache = body?.action === 'details' ? detailsCache() : undefined;
  const result = await handleTmdbRequest(body, Deno.env.get('TMDB_API_KEY'), fetch, cache);
  return json(result.status, result.body);
});
