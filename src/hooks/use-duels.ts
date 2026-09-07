import { useCallback, useEffect, useState } from 'react';

import type { AsyncState, AuthedAsyncState } from '@/hooks/async-state';
import { hasEnded } from '@/lib/duel';
import { duelRepository, profileRepository, type Duel, type Duels } from '@/repositories';

export type DuelsState = AuthedAsyncState<Duels>;

/**
 * `null` cuando ese duelo no existe o no es tuyo. No es un error: se llega
 * aquí por un enlace, y un enlace puede apuntar a cualquier cosa.
 */
export type DuelState = AsyncState<Duel | null>;

/**
 * Cierra los duelos a los que ya se les pasó la ventana.
 *
 * No es imprescindible —un cron llama a `resolve_duel` cada hora para todo lo
 * vencido (`supabase/SCHEMA.md` §12)—, pero sin esto quien abre la app a las
 * 00:05 vería su duelo de ayer todavía «activo» hasta la siguiente hora en
 * punto, que es justo el momento en el que quiere saber si ganó.
 *
 * Los fallos se ignoran a propósito: `resolve_duel` es idempotente y el cron va
 * a reintentarlo igualmente, así que un error aquí solo significa «se enseña un
 * rato más como activo», no un dato perdido. Tumbar la pantalla entera por eso
 * sería peor.
 */
async function resolveExpired(duels: Duels): Promise<boolean> {
  const expired = duels.active.filter(hasEnded);

  if (expired.length === 0) {
    return false;
  }

  await Promise.allSettled(expired.map((duel) => duelRepository.resolve(duel.id)));

  return true;
}

async function fetchDuelsState(): Promise<DuelsState> {
  try {
    const duels = await duelRepository.getDuels();

    if (!duels) {
      return { status: 'signedOut' };
    }

    // Una sola pasada: si tras cerrar los vencidos siguiera habiendo alguno,
    // sería un duelo que el servidor se negó a resolver, y reintentar en bucle
    // no lo arreglaría.
    if (!(await resolveExpired(duels))) {
      return { status: 'ready', data: duels };
    }

    const settled = await duelRepository.getDuels();

    return settled ? { status: 'ready', data: settled } : { status: 'signedOut' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return { status: 'error', message };
  }
}

/**
 * Duelos del usuario actual, con las acciones que los cambian (KAN-32).
 *
 * Mismo esquema que `useFriendships`: estado discriminado, resuscripción a los
 * cambios de sesión, y acciones que **no capturan sus errores** —los dejan
 * salir para que la pantalla decida dónde enseñarlos— pero que sí garantizan
 * que, si la mutación salió bien, la lista ya está recargada cuando la promesa
 * resuelve.
 *
 * `request` es la excepción a lo de no devolver nada: el asistente de
 * `new-duel` necesita el duelo recién creado, y además esa llamada puede lanzar
 * `DuelLimitReachedError`, que la pantalla traduce a abrir el paywall en vez de
 * a un mensaje de error.
 */
export function useDuels() {
  const [state, setState] = useState<DuelsState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState(await fetchDuelsState());
  }, []);

  useEffect(() => {
    let subscribed = true;

    async function sync() {
      const next = await fetchDuelsState();

      if (subscribed) {
        setState(next);
      }
    }

    void sync();

    const unsubscribe = profileRepository.onSessionChange(() => {
      void sync();
    });

    return () => {
      subscribed = false;
      unsubscribe();
    };
  }, []);

  const request = useCallback(
    async (opponentId: string, durationDays: number): Promise<Duel> => {
      const duel = await duelRepository.request(opponentId, durationDays);
      await reload();

      return duel;
    },
    [reload],
  );

  const respond = useCallback(
    async (duelId: string, accept: boolean) => {
      await duelRepository.respond(duelId, accept);
      await reload();
    },
    [reload],
  );

  return { state, reload, request, respond };
}

/**
 * Un duelo suelto, por su id (KAN-31).
 *
 * Existe aparte de `useDuels` porque la pantalla de resultado llega por enlace
 * con un id y no necesita —ni debe pagar— la carga entera: `getDuels`
 * resincroniza el marcador de **todos** los duelos activos, y para enseñar uno
 * ya cerrado eso son varias peticiones tiradas.
 */
export function useDuel(duelId: string | undefined) {
  const [state, setState] = useState<DuelState>({ status: 'loading' });

  useEffect(() => {
    let subscribed = true;

    async function load() {
      if (!duelId) {
        setState({ status: 'ready', data: null });
        return;
      }

      try {
        const duel = await duelRepository.getDuel(duelId);

        if (subscribed) {
          setState({ status: 'ready', data: duel });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error desconocido.';

        if (subscribed) {
          setState({ status: 'error', message });
        }
      }
    }

    void load();

    return () => {
      subscribed = false;
    };
  }, [duelId]);

  return { state };
}
