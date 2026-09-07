import { useEffect, useRef } from 'react';

import type { ProfileState } from '@/hooks/use-profile';
import { profileRepository, subscriptionRepository } from '@/repositories';

/**
 * Conecta el SDK de suscripción al ciclo de vida de la sesión. Se monta una vez,
 * en el layout raíz.
 *
 * - Al arrancar: inicializa el SDK y se suscribe a sus avisos.
 * - Al iniciar sesión: `identify(userId)` + reconcilia con el servidor + recarga
 *   el perfil. Cierra la ventana entre una compra y su webhook, y cura cualquier
 *   webhook perdido (`supabase/SCHEMA.md` §15).
 * - Al cerrar sesión: devuelve el SDK a una sesión anónima.
 * - Mientras está montado: si el SDK avisa de un cambio (renovación, expiración,
 *   compra en otro dispositivo), vuelve a reconciliar y recargar.
 *
 * Los fallos se tragan con `console.warn` a propósito, igual que `resolveExpired`
 * en `use-duels.ts`: un reconcile fallido solo significa que `is_pro` se pondrá
 * al día en el próximo arranque o webhook, no una pantalla rota.
 */
export function useSubscriptionSync(
  profileState: ProfileState,
  reloadProfile: () => Promise<void>,
) {
  const userId = profileState.status === 'ready' ? profileState.data.id : null;
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    void (async () => {
      await safely('inicializar el SDK', () => subscriptionRepository.configure());
      if (cancelled) return;

      unsubscribe = subscriptionRepository.onEntitlementsChange(() => {
        void syncFromServer(reloadProfile);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [reloadProfile]);

  useEffect(() => {
    if (userId && userId !== syncedUserId.current) {
      syncedUserId.current = userId;

      void (async () => {
        await safely('identificar la suscripción', async () => {
          await subscriptionRepository.configure();
          await subscriptionRepository.identify(userId);
        });
        await syncFromServer(reloadProfile);
      })();

      return;
    }

    if (!userId && syncedUserId.current) {
      syncedUserId.current = null;
      void safely('cerrar la sesión del SDK', () => subscriptionRepository.signOut());
    }
  }, [userId, reloadProfile]);
}

/**
 * Pide al servidor que recalcule `profiles.is_pro` desde RevenueCat y repinta el
 * perfil. El reconcile cambia `is_pro` por fuera del repositorio de perfil, así
 * que hay que caducar su caché o `reloadProfile()` traería el valor viejo.
 */
async function syncFromServer(reloadProfile: () => Promise<void>): Promise<void> {
  await safely('sincronizar la suscripción', async () => {
    await subscriptionRepository.syncWithServer();
    profileRepository.invalidate();
    await reloadProfile();
  });
}

async function safely(what: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.warn(`[subscriptions] no se pudo ${what}:`, error);
  }
}
