// RevenueCat firma sus webhooks con un header `Authorization` de valor fijo
// que se configura en el dashboard (Project → Integrations → Webhooks →
// "Authorization header value"). NO es un JWT: es un secreto compartido. La
// función se despliega con `verify_jwt = false` (ver supabase/config.toml)
// para que el gateway de Supabase no exija un JWT propio, y aquí se comprueba
// el secreto a mano.
//
// Alta del secreto (una vez por proyecto):
//   supabase secrets set REVENUECAT_WEBHOOK_AUTH='<el mismo valor del dashboard>'

// Comparación en tiempo (casi) constante para no filtrar la longitud del
// secreto por temporización.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  if (!expected) {
    // Sin secreto configurado no se puede validar nada: rechaza todo.
    console.error("REVENUECAT_WEBHOOK_AUTH no está configurado");
    return false;
  }
  const got = req.headers.get("Authorization") ?? "";
  return timingSafeEqual(got, expected);
}
