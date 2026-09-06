// esm.sh en vez de jsr: — mismo motivo que en las otras Edge Functions del
// proyecto (el bundler de `supabase functions deploy` no puede aplanar las
// deps npm transitivas de jsr:@supabase/supabase-js).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
}
