// ============================================================================
// EDGE FUNCTION: revenuecat-reconcile
//
// Reconcilia el estado de suscripción del usuario que llama contra la REST API
// de RevenueCat (fuente de verdad). La app la invoca al arrancar: cierra la
// ventana entre que se completa una compra y llega el webhook, y cura
// cualquier desincronía si un webhook se perdió.
//
// Se despliega con `verify_jwt = true` (por defecto): solo un usuario
// autenticado puede pedir reconciliar, y solo lo suyo — el `app_user_id` que
// se consulta es SIEMPRE el `sub` de su propio JWT, nunca un parámetro del
// body. Ver supabase/SCHEMA.md §16.
// ============================================================================

import { callerUserId } from "./auth.ts";
import { jsonResponse } from "./http.ts";
import { fetchSubscriberState } from "./revenuecat-api.ts";
import { createServiceRoleClient } from "./supabase-client.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const userId = callerUserId(req);
  if (!userId) {
    return jsonResponse({ error: "Autenticación requerida" }, 401);
  }

  try {
    // El App User ID de RevenueCat === el uuid de Supabase (la app llama a
    // `Purchases.logIn(user.id)` tras el login).
    const state = await fetchSubscriberState(userId);

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.rpc("reconcile_subscription", {
      p_user_id: userId,
      p_rc_app_user_id: userId,
      p_entitlement: "pro",
      p_status: state.status,
      p_store: state.store,
      p_product_id: state.productId,
      p_period_end: state.currentPeriodEnd,
      p_will_renew: state.willRenew,
      p_environment: state.environment,
    });
    if (error) throw new Error(`reconcile_subscription: ${error.message}`);

    return jsonResponse(
      { ok: true, is_pro: data, status: state.status, current_period_end: state.currentPeriodEnd },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("revenuecat-reconcile:", message);
    return jsonResponse({ error: message }, 500);
  }
});
