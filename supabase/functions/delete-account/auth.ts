// Esta función la llama la app con la sesión del usuario. Se despliega con
// `verify_jwt = true` (el valor por defecto), así que el gateway de Supabase
// ya rechaza cualquier llamada sin un JWT válido antes de llegar aquí. Solo
// hace falta sacar el `sub` (uuid del usuario) del token.
//
// Aquí importa más que en ninguna otra Edge Function del proyecto: este `sub`
// es lo que decide QUÉ CUENTA SE BORRA. No se acepta un id por el body.

function base64UrlDecode(segment: string): string {
  const padded = segment.padEnd(segment.length + ((4 - (segment.length % 4)) % 4), "=");
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}

export function callerUserId(req: Request): string | null {
  const bearer = req.headers.get("Authorization") ?? "";
  const token = bearer.replace(/^Bearer\s+/i, "");
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(payloadSegment)) as {
      sub?: unknown;
      role?: unknown;
    };
    if (payload.role !== "authenticated") return null;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
