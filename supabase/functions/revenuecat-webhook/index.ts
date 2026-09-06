// ============================================================================
// EDGE FUNCTION: revenuecat-webhook
//
// Recibe los webhooks de RevenueCat y mantiene sincronizado el estado de
// suscripción en Supabase (tabla `subscriptions` + cache `profiles.is_pro`).
// Ver supabase/SCHEMA.md §16.
//
// RevenueCat es la fuente de verdad; esta función NO decide quién es Pro, solo
// traduce el evento y llama a la RPC `apply_subscription_event`, que aplica el
// cambio de forma idempotente (RevenueCat reintenta los webhooks) y recalcula
// `is_pro` en el servidor.
//
// Se despliega con `verify_jwt = false` (supabase/config.toml): el webhook no
// manda un JWT de Supabase, manda un header `Authorization` de valor fijo que
// se valida en auth.ts contra el secreto `REVENUECAT_WEBHOOK_AUTH`.
//
// Alta manual (una vez por proyecto):
//   supabase secrets set REVENUECAT_WEBHOOK_AUTH='<valor del dashboard de RC>'
// y en RevenueCat: Project → Integrations → Webhooks → URL de esta función +
// ese mismo valor en "Authorization header value".
// ============================================================================

import { isAuthorized } from "./auth.ts";
import { mapEvent, touchesOurEntitlement, type WebhookPayload } from "./event-mapping.ts";
import { jsonResponse } from "./http.ts";
import { createServiceRoleClient } from "./supabase-client.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Body no es JSON válido" }, 400);
  }
  if (!payload?.event?.id || !payload.event.type) {
    return jsonResponse({ error: "Falta event.id / event.type" }, 400);
  }

  // Ping de prueba del dashboard de RevenueCat.
  if (payload.event.type === "TEST") {
    return jsonResponse({ ok: true, test: true }, 200);
  }

  const mapped = mapEvent(payload);
  const supabase = createServiceRoleClient();

  try {
    // TRANSFER: el entitlement se mueve entre app_user_ids. Se registra el
    // evento (idempotencia) y se expira a cada usuario que lo pierde. El que
    // lo gana recibirá su propio RENEWAL, o lo cura el reconcile del cliente.
    if (mapped.eventType === "TRANSFER") {
      await applyEvent(supabase, mapped, null, payload);
      for (const lostUserId of mapped.transferredFrom) {
        const { error } = await supabase.rpc("expire_subscription", { p_user_id: lostUserId });
        if (error) throw new Error(`expire_subscription(${lostUserId}): ${error.message}`);
      }
      return jsonResponse({ ok: true, handled: "TRANSFER", expired: mapped.transferredFrom }, 200);
    }

    // Evento que no toca nuestro entitlement (otro producto): se ignora.
    if (!touchesOurEntitlement(payload)) {
      return jsonResponse({ ok: true, ignored: "otro entitlement" }, 200);
    }

    const result = await applyEvent(supabase, mapped, mapped.status, payload);
    return jsonResponse(
      { ok: true, applied: result.applied, is_pro: result.is_pro, status: mapped.status },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("revenuecat-webhook:", message);
    return jsonResponse({ error: message }, 500);
  }
});

async function applyEvent(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  mapped: ReturnType<typeof mapEvent>,
  status: string | null,
  payload: WebhookPayload,
): Promise<{ applied: boolean; is_pro: boolean | null }> {
  const { data, error } = await supabase.rpc("apply_subscription_event", {
    p_event_id: mapped.eventId,
    p_user_id: mapped.userId,
    p_rc_app_user_id: mapped.rcAppUserId,
    p_event_type: mapped.eventType,
    p_environment: mapped.environment,
    p_status: status,
    p_store: mapped.store,
    p_product_id: mapped.productId,
    p_period_end: mapped.currentPeriodEnd,
    p_will_renew: mapped.willRenew,
    p_entitlement: mapped.entitlement,
    p_payload: payload as unknown as Record<string, unknown>,
  });
  if (error) throw new Error(`apply_subscription_event: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { applied: row?.applied ?? false, is_pro: row?.is_pro ?? null };
}
