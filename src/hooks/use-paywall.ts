import { useCallback, useEffect, useState } from 'react';

import type { AsyncState } from '@/hooks/async-state';
import {
  profileRepository,
  subscriptionRepository,
  type PurchaseOutcome,
  type SubscriptionOffering,
  type SubscriptionPackage,
} from '@/repositories';

/**
 * La oferta activa de la store.
 *
 * `{ status: 'ready', data: null }` **no es un fallo**: es «aquí no se puede
 * comprar» — SDK sin claves, bundle web, o un proyecto de RevenueCat sin
 * offering por defecto. La pantalla lo dice con sus palabras en vez de enseñar
 * un error rojo por algo que no ha ido mal.
 */
export type OfferingState = AsyncState<SubscriptionOffering | null>;

async function fetchOfferingState(): Promise<OfferingState> {
  try {
    // `configure()` es idempotente, y aquí no sobra: los efectos de React
    // corren de hijo a padre, así que esta pantalla se monta **antes** de que
    // `useSubscriptionSync` (en el layout raíz) haya configurado el SDK. Sin
    // esta línea, abrir el paywall recién arrancada la app enseñaría «no
    // disponible» aunque las claves estén puestas.
    await subscriptionRepository.configure();

    return { status: 'ready', data: await subscriptionRepository.getCurrentOffering() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return { status: 'error', message };
  }
}

/**
 * Los planes comprables y las dos acciones que cambian el entitlement (KAN-9).
 *
 * No confundir con `useSubscription()` (`use-subscription.ts`): aquel solo
 * dice si el usuario **es** Pro, para abrir o cerrar una puerta en la UI.
 * Este es el lado de **comprar** — la oferta de la store y sus acciones.
 *
 * Recibe el `reload` del perfil de quien lo monta, igual que
 * `useSubscriptionSync`: tras comprar o restaurar hay que **reconciliar contra
 * el servidor y repintar el perfil**, porque quien decide si eres Pro es
 * `profiles.is_pro`, nunca el `customerInfo` local del SDK
 * (`docs/revenuecat.md` §1). `useProfile` no es estado global, así que el
 * `reload` del layout raíz no repinta esta pantalla: hace falta el suyo.
 *
 * Como en `useDuels`, las acciones **no capturan sus errores** — los dejan
 * salir para que la pantalla decida dónde enseñarlos.
 */
export function usePaywall(reloadProfile: () => Promise<void>) {
  const [state, setState] = useState<OfferingState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState({ status: 'loading' });
    setState(await fetchOfferingState());
  }, []);

  useEffect(() => {
    let subscribed = true;

    void (async () => {
      const next = await fetchOfferingState();

      if (subscribed) {
        setState(next);
      }
    })();

    return () => {
      subscribed = false;
    };
  }, []);

  /**
   * Pide al servidor que recalcule `profiles.is_pro` desde RevenueCat y repinta
   * el perfil. Mismo trío que `syncFromServer()` en `use-subscription-sync.ts`:
   * el reconcile cambia `is_pro` por fuera del repositorio de perfil, así que
   * hay que caducar su caché o `reloadProfile()` traería el valor viejo.
   *
   * **Los fallos se tragan a propósito.** Llegar aquí significa que la compra
   * ya está cobrada: el webhook de RevenueCat pondrá `is_pro` igualmente, y el
   * arranque siguiente vuelve a reconciliar. Convertir eso en «no se pudo
   * completar la compra» sería mentirle a alguien a quien ya se le ha cobrado.
   */
  const syncEntitlement = useCallback(async () => {
    try {
      await subscriptionRepository.syncWithServer();
      profileRepository.invalidate();
      await reloadProfile();
    } catch (error) {
      console.warn('[subscriptions] no se pudo confirmar el entitlement:', error);
    }
  }, [reloadProfile]);

  const purchase = useCallback(
    async (pkg: SubscriptionPackage): Promise<PurchaseOutcome> => {
      const outcome = await subscriptionRepository.purchase(pkg);

      if (outcome === 'purchased') {
        await syncEntitlement();
      }

      return outcome;
    },
    [syncEntitlement],
  );

  const restore = useCallback(async () => {
    await subscriptionRepository.restore();
    await syncEntitlement();
  }, [syncEntitlement]);

  return { state, reload, purchase, restore };
}
