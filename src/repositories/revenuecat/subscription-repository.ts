/**
 * Implementación de `SubscriptionRepository` contra el SDK de RevenueCat. Es el
 * **único** archivo de la app que importa `react-native-purchases` (regla 1 del
 * patrón repositorio) — su variante `.web.ts` lo sustituye por un stub para que
 * el bundle web ni siquiera cargue el módulo nativo.
 *
 * El lado servidor (reconciliar `profiles.is_pro`) no vive aquí: llega inyectado
 * como `SubscriptionServerGateway`, que este archivo no sabe que es Supabase.
 */

import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

import { RepositoryError } from '@/repositories/errors';
import type {
  PurchaseOutcome,
  SubscriptionOffering,
  SubscriptionPackage,
  SubscriptionRepository,
  SubscriptionServerGateway,
} from '@/repositories/subscription-repository';

/**
 * Claves **públicas** del SDK (una por plataforma), de RevenueCat → Project →
 * API keys. No son secretas — igual que la publishable key de Supabase, quien
 * protege el estado es el servidor. La «Secret API key» es otra cosa y vive en
 * los secretos de Supabase para las Edge Functions.
 */
const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
});

/** `P1M` → 1, `P1Y` → 12, `P3M` → 3. `null` para semanas/días o formato raro. */
function periodToMonths(iso: string | null): number | null {
  if (!iso) return null;

  const match = /^P(\d+)([MY])$/.exec(iso);
  if (!match) return null;

  const value = Number(match[1]);
  return match[2] === 'Y' ? value * 12 : value;
}

/** Nombre corto del plan a partir del tipo de paquete de RevenueCat. */
const PACKAGE_NAMES: Record<string, string> = {
  MONTHLY: 'Monthly',
  ANNUAL: 'Annual',
  SIX_MONTH: '6 months',
  THREE_MONTH: '3 months',
  TWO_MONTH: '2 months',
  WEEKLY: 'Weekly',
  LIFETIME: 'Lifetime',
};

function toPackage(pkg: PurchasesPackage): SubscriptionPackage {
  const { product } = pkg;

  return {
    id: pkg.identifier,
    name: PACKAGE_NAMES[pkg.packageType] ?? product.title,
    priceLabel: product.priceString,
    monthlyPriceLabel: product.pricePerMonthString,
    monthlyPrice: product.pricePerMonth,
    periodMonths: periodToMonths(product.subscriptionPeriod),
  };
}

/** El SDK lanza esto cuando el usuario cierra la hoja de pago de la store. */
function isUserCancelled(error: unknown): boolean {
  const candidate = error as Partial<PurchasesError> | null;

  return (
    candidate?.userCancelled === true ||
    candidate?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
  );
}

function purchaseErrorMessage(error: unknown): string {
  const code = (error as Partial<PurchasesError> | null)?.code;

  switch (code) {
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return 'Ya tienes este plan. Prueba a restaurar tus compras.';
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return 'El pago está pendiente de confirmación por la store.';
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return 'Sin conexión con la store. Inténtalo de nuevo.';
    default:
      return 'No se pudo completar la compra.';
  }
}

export class RevenueCatSubscriptionRepository implements SubscriptionRepository {
  private configured = false;

  /** La última oferta traída, para resolver `purchase()` sin volver a pedirla. */
  private lastOffering: PurchasesOffering | null = null;

  constructor(private readonly gateway: SubscriptionServerGateway) {}

  isConfigured(): boolean {
    return this.configured;
  }

  async configure(): Promise<void> {
    if (this.configured) return;

    if (!API_KEY) {
      console.warn(
        '[subscriptions] Falta EXPO_PUBLIC_REVENUECAT_*_API_KEY: el paywall se mostrará como no disponible.',
      );
      return;
    }

    if (__DEV__) {
      await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    Purchases.configure({ apiKey: API_KEY });
    this.configured = true;
  }

  async identify(userId: string): Promise<void> {
    if (!this.configured) return;

    try {
      await Purchases.logIn(userId);
    } catch (error) {
      throw new RepositoryError('No se pudo identificar la suscripción.', { cause: error });
    }
  }

  async signOut(): Promise<void> {
    if (!this.configured) return;

    try {
      await Purchases.logOut();
    } catch (error) {
      // Cerrar la sesión de alguien que ya era anónimo no es un fallo real.
      if (
        (error as Partial<PurchasesError> | null)?.code ===
        PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR
      ) {
        return;
      }

      throw new RepositoryError('No se pudo cerrar la sesión de la suscripción.', {
        cause: error,
      });
    }
  }

  async getCurrentOffering(): Promise<SubscriptionOffering | null> {
    if (!this.configured) return null;

    let current: PurchasesOffering | null;
    try {
      current = (await Purchases.getOfferings()).current;
    } catch (error) {
      throw new RepositoryError('No se pudieron cargar los planes.', { cause: error });
    }

    if (!current || current.availablePackages.length === 0) {
      return null;
    }

    this.lastOffering = current;

    return {
      identifier: current.identifier,
      packages: current.availablePackages.map(toPackage),
    };
  }

  async purchase(pkg: SubscriptionPackage): Promise<PurchaseOutcome> {
    if (!this.configured) {
      throw new RepositoryError('Las compras no están disponibles ahora mismo.');
    }

    const target = await this.resolvePackage(pkg.id);

    try {
      await Purchases.purchasePackage(target);
      return 'purchased';
    } catch (error) {
      if (isUserCancelled(error)) {
        return 'cancelled';
      }

      throw new RepositoryError(purchaseErrorMessage(error), { cause: error });
    }
  }

  async restore(): Promise<void> {
    if (!this.configured) {
      throw new RepositoryError('Las compras no están disponibles ahora mismo.');
    }

    try {
      await Purchases.restorePurchases();
    } catch (error) {
      throw new RepositoryError('No se pudieron restaurar las compras.', { cause: error });
    }
  }

  syncWithServer(): Promise<void> {
    return this.gateway.reconcile();
  }

  onEntitlementsChange(listener: () => void): () => void {
    if (!this.configured) return () => {};

    const wrapped = () => listener();
    Purchases.addCustomerInfoUpdateListener(wrapped);

    return () => {
      Purchases.removeCustomerInfoUpdateListener(wrapped);
    };
  }

  /**
   * De un id de paquete al objeto del SDK. Usa la última oferta cargada; si el
   * paywall se saltó `getCurrentOffering()` por lo que sea, la vuelve a pedir.
   */
  private async resolvePackage(id: string): Promise<PurchasesPackage> {
    const cached = this.lastOffering?.availablePackages.find((p) => p.identifier === id);
    if (cached) return cached;

    const current = (await Purchases.getOfferings()).current;
    const found = current?.availablePackages.find((p) => p.identifier === id);
    if (!found) {
      throw new RepositoryError('Ese plan ya no está disponible.');
    }

    this.lastOffering = current;
    return found;
  }
}
