// ============================================================================
// EDGE FUNCTION: delete-account
//
// Borra la cuenta del usuario que llama, entera y para siempre (KAN-53).
//
// POR QUÉ NO ES UNA RPC A SECAS:
//   Borrar de verdad significa borrar de `auth.users`, y eso necesita la
//   service role key — que NO puede viajar dentro de la app. La app llama
//   aquí con su sesión; aquí dentro se comprueba quién es y se borra solo a
//   esa persona. El id SIEMPRE sale del `sub` de su propio JWT, nunca del
//   body: si viniera del body, cualquiera podría borrar la cuenta de otro.
//
// Se despliega con `verify_jwt = true` (por defecto): sin sesión válida el
// gateway de Supabase rechaza antes de llegar aquí. Ver supabase/SCHEMA.md §17.
//
// EL ORDEN DE LOS TRES PASOS NO ES ARBITRARIO:
//   1. Foto de perfil (Storage). Los objetos del bucket NO cuelgan de ninguna
//      foreign key, así que el CASCADE no los toca: si se borrasen después del
//      usuario y algo fallara, quedarían huérfanos para siempre y sin nadie a
//      quien atribuirlos — dato personal abandonado en un bucket público.
//   2. Traspaso de liderazgo de clan (`prepare_account_deletion`), como el
//      usuario, para que `auth.uid()` sea él.
//   3. Borrado del usuario de Auth, que dispara el CASCADE y se lleva perfil,
//      pasos, duelos, amistades y suscripción.
//
//   Si falla el paso 3, el usuario ha perdido su foto pero conserva la cuenta
//   y puede volver a subirla. Al revés —cuenta borrada, foto huérfana— no hay
//   nada que se pueda arreglar después.
// ============================================================================

import { callerUserId } from "./auth.ts";
import { jsonResponse } from "./http.ts";
import { createServiceRoleClient, createUserClient } from "./supabase-client.ts";

const AVATAR_BUCKET = "avatars";

/**
 * Vacía la carpeta de fotos del usuario. Es la única cosa suya que no vive en
 * una tabla, así que es la única que hay que borrar a mano.
 *
 * `list` devuelve los archivos de `<uuid>/`, que hoy es siempre como mucho uno
 * (`avatar.jpg`, que se sobrescribe), pero se recorre la lista entera por si un
 * cambio de extensión dejó dos.
 */
async function deleteAvatarFolder(
  supabase: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
  if (error) throw new Error(`storage.list: ${error.message}`);
  if (!data || data.length === 0) return;

  const paths = data.map((file) => `${userId}/${file.name}`);
  const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(paths);
  if (removeError) throw new Error(`storage.remove: ${removeError.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = callerUserId(req);
  if (!userId) {
    return jsonResponse({ error: "Autenticación requerida" }, 401);
  }

  try {
    const admin = createServiceRoleClient();

    await deleteAvatarFolder(admin, userId);

    // Con la sesión del usuario, no con la service role key: la RPC se apoya en
    // `auth.uid()` para saber a quién está sacando de su clan.
    const asUser = createUserClient(req);
    const { error: prepareError } = await asUser.rpc("prepare_account_deletion");
    if (prepareError) throw new Error(`prepare_account_deletion: ${prepareError.message}`);

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) throw new Error(`auth.admin.deleteUser: ${deleteError.message}`);

    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    // El id se registra a propósito: si el borrado se queda a medias, es lo
    // único que permite terminarlo a mano. No se registra el email.
    console.error("delete-account:", userId, message);
    return jsonResponse({ error: message }, 500);
  }
});
