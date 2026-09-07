// esm.sh en vez de jsr: — mismo motivo que en las otras Edge Functions del
// proyecto (el bundler de `supabase functions deploy` no puede aplanar las
// deps npm transitivas de jsr:@supabase/supabase-js).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Para lo que la app no puede hacer por sí misma: borrar de `auth.users`. */
export function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
}

/**
 * Cliente que actúa **como el usuario que llama**, reenviando su cabecera
 * `Authorization`.
 *
 * Existe porque `prepare_account_deletion()` decide a quién saca del clan con
 * `auth.uid()`. Con la service role key `auth.uid()` sería NULL y la RPC
 * fallaría; la alternativa —pasarle el id como parámetro— convertiría una
 * función `SECURITY DEFINER` concedida a `authenticated` en algo que cualquiera
 * podría apuntar contra otra persona. Reenviar el token deja que Postgres
 * mismo garantice que solo se toca al que llama.
 */
export function createUserClient(req: Request): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}
