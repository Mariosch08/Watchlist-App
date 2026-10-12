import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Verifies the caller's Supabase session (works with legacy and new JWT signing keys).
export async function requireUser(req: Request) {
  const header = req.headers.get('Authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  return error ? null : data.user;
}
