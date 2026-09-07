import { router } from 'expo-router';
import { useCallback } from 'react';

import { ROUTES } from '@/constants/routes';
import { useProfile } from '@/hooks/use-profile';

export type SubscriptionStatus = 'loading' | 'free' | 'pro';

/**
 * El estado Pro del usuario, para bloquear o desbloquear una función en la UI en
 * una línea.
 *
 * La verdad es `profiles.is_pro` (lo mueve solo el servidor, ver
 * `supabase/SCHEMA.md` §15). Este hook la lee del perfil y no habla con el SDK
 * de RevenueCat: comprar, restaurar y sincronizar son otra capa
 * (`use-subscription-sync.ts`, el paywall).
 *
 * Formas de uso:
 *
 * ```tsx
 * // Enseñar u ocultar / habilitar o no:
 * const { isPro } = useSubscription();
 * <Button label="Export" disabled={!isPro} onPress={exportData} />
 *
 * // Puerta sobre una acción: corre la función si es Pro, si no abre el paywall:
 * const { requirePro } = useSubscription();
 * <Button label="Export" onPress={() => requirePro(exportData)} />
 *
 * // Pantalla entera solo-Pro:
 * const { status, isPro } = useSubscription();
 * if (status === 'loading') return <Splash />;
 * if (!isPro) return <Redirect href={ROUTES.paywall.href} />;
 * ```
 *
 * Mientras el perfil carga, `isPro` es `false` a propósito: así una función Pro
 * nunca parpadea desbloqueada antes de saber si de verdad lo está. Usa `status`
 * si necesitas distinguir «cargando» de «gratis».
 */
export function useSubscription() {
  const { state } = useProfile();

  const status: SubscriptionStatus =
    state.status === 'loading'
      ? 'loading'
      : state.status === 'ready' && state.data.isPro
        ? 'pro'
        : 'free';

  const isPro = status === 'pro';

  /**
   * Si el usuario es Pro, corre `action` (si se pasa) y devuelve `true`. Si no,
   * abre el paywall y devuelve `false`. Pensado para el `onPress` de un control
   * que dispara una función Pro.
   */
  const requirePro = useCallback(
    (action?: () => void): boolean => {
      if (isPro) {
        action?.();
        return true;
      }

      router.push(ROUTES.paywall.href);
      return false;
    },
    [isPro],
  );

  return { isPro, status, requirePro };
}
