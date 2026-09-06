// esm.sh en vez de jsr: — mismo motivo que en resolve-expired-competitions:
// `jsr:@supabase/supabase-js` arrastra deps npm transitivas que el bundler
// local de `supabase functions deploy` intenta aplanar en un node_modules
// real y falla porque monta supabase/functions en solo lectura.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase en toda Edge
// Function del proyecto — no hace falta darlos de alta a mano.
export function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
}
