import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

// Service-role client for server-side writes. Callers must always scope queries to the verified user.
export function adminClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}
