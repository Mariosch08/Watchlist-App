// TMDb proxy: keeps the TMDb key server-side. Only for logged-in users.
import { requireUser } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { handleTmdbRequest } from '../_shared/tmdb.ts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!(await requireUser(req))) return json(401, { error: 'Unauthorized' });
  const body = await req.json().catch(() => null);
  const result = await handleTmdbRequest(body, Deno.env.get('TMDB_API_KEY'), fetch);
  return json(result.status, result.body);
});
