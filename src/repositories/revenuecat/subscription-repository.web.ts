/**
 * Stub web de `RevenueCatSubscriptionRepository`. Existe por el mismo motivo que
 * `lib/storage.web.ts` y `organisms/app-tabs.web.tsx`: el bundle web no debe
 * cargar un módulo nativo. Además RevenueCat en web necesitaría una clave y un
 * flujo (Stripe) aparte que este proyecto no tiene, así que la respuesta honesta
 * en web es «no disponible».
 *
 * Mantiene la misma firma que la versión nativa para que `repositories/index.ts`
 * la construya igual (`new RevenueCatSubscriptionRepository(gateway)`).
 */

import { RepositoryError } from '@/repositories/errors';
import type {
  PurchaseOutcome,
  SubscriptionOffering,
  SubscriptionPackage,
  SubscriptionRepository,
  SubscriptionServerGateway,
} from '@/repositories/subscription-repository';

const UNAVAILABLE = 'Las compras no están disponibles en la versión web.';

export class RevenueCatSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly gateway: SubscriptionServerGateway) {}

  isConfigured(): boolean {
    return false;
  }

  async configure(): Promise<void> {
    // No hay SDK que inicializar en web.
  }

  async identify(): Promise<void> {
    // Sin sesión de RevenueCat en web.
  }

  async signOut(): Promise<void> {
    // Sin sesión de RevenueCat en web.
  }

  async getCurrentOffering(): Promise<SubscriptionOffering | null> {
    return null;
  }

  async purchase(_pkg: SubscriptionPackage): Promise<PurchaseOutcome> {
    throw new RepositoryError(UNAVAILABLE);
  }

  async restore(): Promise<void> {
    throw new RepositoryError(UNAVAILABLE);
  }

  syncWithServer(): Promise<void> {
    return this.gateway.reconcile();
  }

  onEntitlementsChange(): () => void {
    return () => {};
  }
}
