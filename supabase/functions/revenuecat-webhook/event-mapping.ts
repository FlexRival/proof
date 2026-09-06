// Traduce un evento del webhook de RevenueCat a los parámetros de la RPC
// `apply_subscription_event` (ver supabase/migrations/20260906120000_*).
//
// Toda la lógica de "¿esto deja al usuario como Pro?" vive en SQL
// (`refresh_is_pro`): aquí solo se normaliza el evento. El `status` que se
// deduce es una pista para la UI; el cache `is_pro` lo recalcula el servidor
// a partir de `status` + `current_period_end`.
//
// Referencia de tipos de evento:
// https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields

// El único entitlement del proyecto. Si algún día hay más, esto se amplía.
const ENTITLEMENT = "pro";

export type SubscriptionStatus =
  | "ACTIVE"
  | "IN_GRACE_PERIOD"
  | "CANCELLED"
  | "EXPIRED"
  | "PAUSED";

export type SubscriptionStore = "APP_STORE" | "PLAY_STORE" | "STRIPE" | "PROMOTIONAL";

export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  environment?: string; // "PRODUCTION" | "SANDBOX"
  store?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  auto_resume_at_ms?: number | null; // pausa de Google Play
  transferred_from?: string[];
  transferred_to?: string[];
}

export interface WebhookPayload {
  api_version?: string;
  event: RevenueCatEvent;
}

export interface MappedEvent {
  eventId: string;
  eventType: string;
  environment: "PRODUCTION" | "SANDBOX";
  /** uuid del perfil, o null si el app_user_id no es un uuid mapeable. */
  userId: string | null;
  rcAppUserId: string;
  /** null => solo registrar el evento, no tocar `subscriptions` (TRANSFER, TEST…). */
  status: SubscriptionStatus | null;
  store: SubscriptionStore | null;
  productId: string | null;
  /** ISO-8601 o null. */
  currentPeriodEnd: string | null;
  willRenew: boolean;
  entitlement: string;
  /** Para TRANSFER: uuids que PIERDEN el entitlement y hay que expirar. */
  transferredFrom: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstUuid(...candidates: (string | undefined)[]): string | null {
  for (const c of candidates) {
    if (c && UUID_RE.test(c)) return c;
  }
  return null;
}

function mapStore(store: string | undefined): SubscriptionStore | null {
  switch (store) {
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "APP_STORE";
    case "PLAY_STORE":
      return "PLAY_STORE";
    case "STRIPE":
    case "RC_BILLING":
      return "STRIPE";
    case "PROMOTIONAL":
      return "PROMOTIONAL";
    default:
      return null;
  }
}

// Tipos que representan una suscripción viva y renovable.
const ACTIVE_TYPES = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);

function deriveStatus(
  type: string,
  expired: boolean,
): SubscriptionStatus | null {
  if (ACTIVE_TYPES.has(type)) return expired ? "EXPIRED" : "ACTIVE";
  switch (type) {
    case "NON_RENEWING_PURCHASE":
      return expired ? "EXPIRED" : "ACTIVE";
    case "CANCELLATION":
      // Auto-renovado desactivado o reembolso. Si ya venció -> EXPIRED;
      // si no, sigue siendo Pro hasta el fin del periodo -> CANCELLED.
      return expired ? "EXPIRED" : "CANCELLED";
    case "BILLING_ISSUE":
      return expired ? "EXPIRED" : "IN_GRACE_PERIOD";
    case "SUBSCRIPTION_PAUSED":
      return "PAUSED";
    case "EXPIRATION":
      return "EXPIRED";
    default:
      // TRANSFER, TEST, INVOICE_ISSUANCE… -> solo registrar.
      return null;
  }
}

export function mapEvent(payload: WebhookPayload): MappedEvent {
  const e = payload.event;
  const environment = e.environment === "SANDBOX" ? "SANDBOX" : "PRODUCTION";

  const expirationMs = e.expiration_at_ms ?? null;
  const expired = expirationMs !== null && expirationMs <= Date.now();
  const status = deriveStatus(e.type, expired);

  const willRenew = status === "ACTIVE" && e.type !== "NON_RENEWING_PURCHASE";

  const transferredFrom = (e.transferred_from ?? []).filter((id) => UUID_RE.test(id));

  return {
    eventId: e.id,
    eventType: e.type,
    environment,
    userId: firstUuid(e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])),
    rcAppUserId: e.app_user_id ?? e.original_app_user_id ?? "",
    status,
    store: mapStore(e.store),
    productId: e.product_id ?? null,
    currentPeriodEnd: expirationMs !== null ? new Date(expirationMs).toISOString() : null,
    willRenew,
    entitlement: ENTITLEMENT,
    transferredFrom,
  };
}

// Si el evento trae `entitlement_ids` y NO incluye el nuestro, no nos afecta.
export function touchesOurEntitlement(payload: WebhookPayload): boolean {
  const ids = payload.event.entitlement_ids;
  if (ids === undefined || ids === null) return true; // sin info -> asumimos que sí
  return ids.includes(ENTITLEMENT);
}
