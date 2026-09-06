// Cliente mínimo de la REST API v1 de RevenueCat, fuente de verdad del estado
// de suscripción. Se usa para reconciliar bajo demanda (al abrir la app) por
// si se perdió un webhook.
//
// Alta manual del secreto (una vez por proyecto):
//   supabase secrets set REVENUECAT_SECRET_API_KEY='<Secret API key (v1) de RC>'
// Dashboard de RevenueCat: Project → API keys → "Secret" (NO la public SDK key).

export type SubscriptionStatus =
  | "ACTIVE"
  | "IN_GRACE_PERIOD"
  | "CANCELLED"
  | "EXPIRED"
  | "PAUSED";

export type SubscriptionStore = "APP_STORE" | "PLAY_STORE" | "STRIPE" | "PROMOTIONAL";

const ENTITLEMENT = "pro";
const API_BASE = "https://api.revenuecat.com/v1";

interface RcEntitlement {
  expires_date: string | null;
  product_identifier?: string;
}

interface RcSubscription {
  expires_date: string | null;
  store?: string;
  is_sandbox?: boolean;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  auto_resume_date?: string | null;
}

interface RcSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, RcEntitlement>;
    subscriptions?: Record<string, RcSubscription>;
    original_app_user_id?: string;
  };
}

export interface ReconciledState {
  status: SubscriptionStatus;
  store: SubscriptionStore | null;
  productId: string | null;
  currentPeriodEnd: string | null;
  willRenew: boolean;
  environment: "PRODUCTION" | "SANDBOX";
}

function mapStore(store: string | undefined): SubscriptionStore | null {
  switch ((store ?? "").toLowerCase()) {
    case "app_store":
    case "mac_app_store":
      return "APP_STORE";
    case "play_store":
      return "PLAY_STORE";
    case "stripe":
    case "rc_billing":
      return "STRIPE";
    case "promotional":
      return "PROMOTIONAL";
    default:
      return null;
  }
}

function inFuture(iso: string | null): boolean {
  return iso !== null && new Date(iso).getTime() > Date.now();
}

export async function fetchSubscriberState(appUserId: string): Promise<ReconciledState> {
  const apiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
  if (!apiKey) throw new Error("REVENUECAT_SECRET_API_KEY no está configurado");

  const res = await fetch(`${API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`RevenueCat API ${res.status}: ${await res.text()}`);
  }
  const body = (await res.json()) as RcSubscriberResponse;
  const sub = body.subscriber ?? {};

  const ent = sub.entitlements?.[ENTITLEMENT];
  const productId = ent?.product_identifier ?? null;
  const detail = productId ? sub.subscriptions?.[productId] : undefined;
  const periodEnd = ent?.expires_date ?? detail?.expires_date ?? null;

  // Sin entitlement activo -> EXPIRED (o nunca tuvo).
  if (!ent || !inFuture(periodEnd)) {
    return {
      status: "EXPIRED",
      store: mapStore(detail?.store),
      productId,
      currentPeriodEnd: periodEnd,
      willRenew: false,
      environment: detail?.is_sandbox ? "SANDBOX" : "PRODUCTION",
    };
  }

  let status: SubscriptionStatus = "ACTIVE";
  if (detail?.billing_issues_detected_at) status = "IN_GRACE_PERIOD";
  else if (detail?.auto_resume_date) status = "PAUSED";
  else if (detail?.unsubscribe_detected_at) status = "CANCELLED";

  return {
    status,
    store: mapStore(detail?.store),
    productId,
    currentPeriodEnd: periodEnd,
    willRenew: status === "ACTIVE",
    environment: detail?.is_sandbox ? "SANDBOX" : "PRODUCTION",
  };
}
