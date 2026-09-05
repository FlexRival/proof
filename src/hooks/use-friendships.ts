import { useCallback, useEffect, useState } from 'react';

import { friendshipRepository, profileRepository, type Friendships } from '@/repositories';

import type { AuthedAsyncState } from '@/hooks/async-state';

export type FriendshipsState = AuthedAsyncState<Friendships>;

async function fetchFriendshipsState(): Promise<FriendshipsState> {
  try {
    const friendships = await friendshipRepository.getFriendships();
    return friendships ? { status: 'ready', data: friendships } : { status: 'signedOut' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return { status: 'error', message };
  }
}

/**
 * Amigos y solicitudes del usuario actual, con las acciones que los cambian.
 *
 * Mismo esquema que `useProfile`: estado discriminado (para distinguir
 * «cargando» de «sin sesión» de «falló», que en la interfaz son tres cosas
 * distintas) y resuscripción a los cambios de sesión.
 *
 * Las acciones **no capturan sus errores**: dejan salir el `RepositoryError`
 * para que la pantalla decida dónde enseñarlo, igual que hace Ajustes con
 * `updateAvatar`. Lo que sí garantizan es que, si la mutación salió bien, la
 * lista ya está recargada cuando la promesa resuelve — así ninguna pantalla
 * tiene que acordarse de refrescar a mano después de aceptar una solicitud.
 */
export function useFriendships() {
  const [state, setState] = useState<FriendshipsState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState(await fetchFriendshipsState());
  }, []);

  useEffect(() => {
    let subscribed = true;

    async function sync() {
      const next = await fetchFriendshipsState();

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

  const sendRequest = useCallback(
    async (userId: string) => {
      await friendshipRepository.sendRequest(userId);
      await reload();
    },
    [reload],
  );

  const respondToRequest = useCallback(
    async (friendshipId: string, accept: boolean) => {
      await friendshipRepository.respondToRequest(friendshipId, accept);
      await reload();
    },
    [reload],
  );

  const cancelRequest = useCallback(
    async (friendshipId: string) => {
      await friendshipRepository.cancelRequest(friendshipId);
      await reload();
    },
    [reload],
  );

  const removeFriend = useCallback(
    async (friendshipId: string) => {
      await friendshipRepository.removeFriend(friendshipId);
      await reload();
    },
    [reload],
  );

  return { state, reload, sendRequest, respondToRequest, cancelRequest, removeFriend };
}
