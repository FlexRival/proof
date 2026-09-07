/**
 * Contrato de la suscripción Pro. Ni este archivo ni quien lo consuma saben que
 * detrás hay RevenueCat (la compra, vía `react-native-purchases`) y Supabase (la
 * verdad del entitlement): eso vive en `revenuecat/subscription-repository.ts` y
 * `supabase/subscription-repository.ts`.
 *
 * Regla del proyecto (`supabase/SCHEMA.md` §15): el cliente **nunca** decide si
 * eres Pro. La compra ocurre contra la store a través del SDK, pero el flag que
 * la app mira sigue siendo `profiles.is_pro`, que solo mueve el servidor. Por
 * eso toda operación que pueda cambiar el entitlement termina con un
 * `syncWithServer()`, y la pantalla recarga el perfil después.
 */

/** Un plan comprable, ya traducido de la store a lo que el paywall necesita. */
export type SubscriptionPackage = {
  /** Identificador del paquete en RevenueCat — lo que se pasa a `purchase()`. */
  id: string;
  /** Nombre corto del plan: `Monthly`, `Annual`… Sale del tipo de paquete. */
  name: string;
  /** Precio completo ya formateado por la store en su moneda: `$69.99`. */
  priceLabel: string;
  /**
   * Coste mensual equivalente, ya formateado por la store: `$5.83`. `null` para
   * un plan que ya se cobra al mes (ahí `priceLabel` ya es el precio mensual).
   */
  monthlyPriceLabel: string | null;
  /**
   * Coste mensual equivalente como número, en la moneda de la store. Solo sirve
   * para calcular el ahorro de un plan frente a otro; nunca se pinta. `null` si
   * la store no lo da.
   */
  monthlyPrice: number | null;
  /** Meses que cubre cada cobro (`1`, `12`…). `null` si no es una suscripción. */
  periodMonths: number | null;
};

export type SubscriptionOffering = {
  identifier: string;
  packages: SubscriptionPackage[];
};

/**
 * Cómo acabó un intento de compra. Cancelar **no es un error**: es una salida
 * válida del flujo, así que va como valor de retorno y no como excepción.
 */
export type PurchaseOutcome = 'purchased' | 'cancelled';

/**
 * El lado servidor de la suscripción: reconcilia `profiles.is_pro` contra la
 * fuente de verdad (RevenueCat) bajo demanda. Lo implementa
 * `SupabaseSubscriptionGateway` (Edge Function `revenuecat-reconcile`).
 */
export interface SubscriptionServerGateway {
  reconcile(): Promise<void>;
}

export interface SubscriptionRepository {
  /** `true` cuando el SDK tiene claves y se pudo inicializar. */
  isConfigured(): boolean;

  /**
   * Inicializa el SDK. Idempotente y seguro de llamar al arrancar. Si faltan las
   * claves públicas, no lanza: deja `isConfigured()` en `false` y avisa por
   * consola, para que el paywall enseñe «no disponible» en vez de reventar.
   */
  configure(): Promise<void>;

  /** Asocia la sesión de RevenueCat al usuario de Supabase (`Purchases.logIn`). */
  identify(userId: string): Promise<void>;

  /** Vuelve a una sesión anónima de RevenueCat (`Purchases.logOut`). */
  signOut(): Promise<void>;

  /**
   * La oferta activa del dashboard de RevenueCat, con sus planes ya traducidos.
   * `null` si el SDK no está configurado o no hay ninguna oferta.
   */
  getCurrentOffering(): Promise<SubscriptionOffering | null>;

  /** Lanza el flujo de compra de la store. Ver `PurchaseOutcome`. */
  purchase(pkg: SubscriptionPackage): Promise<PurchaseOutcome>;

  /** Restaura compras anteriores de la store para esta cuenta. */
  restore(): Promise<void>;

  /** Pide al servidor que recalcule `profiles.is_pro` desde RevenueCat. */
  syncWithServer(): Promise<void>;

  /**
   * Se dispara cuando el SDK detecta un cambio en el estado del cliente
   * (renovación, expiración, compra desde otro dispositivo). Devuelve la función
   * para cancelar la suscripción.
   */
  onEntitlementsChange(listener: () => void): () => void;
}
