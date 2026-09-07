import { useCallback, useEffect, useState } from 'react';

import type { AsyncState } from '@/hooks/async-state';
import {
  daysAgoKey,
  getStepsAccess,
  readDailySteps,
  requestStepsAccess,
  todayKey,
  type StepsAccess,
} from '@/lib/steps';
import { SYNC_WINDOW_DAYS, stepsRepository } from '@/repositories';

/**
 * Los pasos del usuario tal y como los ve la app: lo que el **servidor** tiene
 * guardado, no lo que midió el teléfono.
 *
 * La diferencia importa porque el servidor recorta por `daily_step_cap()` y
 * aplica `GREATEST` por día: enseñar la lectura cruda del móvil dejaría en
 * pantalla un número que luego no decide el duelo. Ver `supabase/SCHEMA.md`
 * §16.
 */
export type StepsSummary = {
  /**
   * Estado del permiso. Va en el dato y no en el estado de error porque un
   * permiso denegado **no es un fallo**: es una pantalla que hay que pintar
   * (KAN-51). Tenerlo aquí es lo que permite distinguir «no me dejas leer» de
   * «hoy no has andado», que en iOS son indistinguibles si se le pregunta a la
   * plataforma — ver `docs/healthkit-y-health-connect.md`.
   */
  access: StepsAccess;
  /**
   * Pasos de hoy según el servidor, o `null` si no hay permiso para leerlos.
   *
   * Con el permiso concedido, un `0` sí significa cero pasos de verdad: la
   * ambigüedad que preocupa vive en `access`, no aquí.
   */
  today: number | null;
  /** Meta diaria del servidor, la misma cifra que decide la racha. */
  goal: number;
  /** `true` si el servidor recortó los pasos de hoy por el tope diario. */
  capped: boolean;
};

export type StepsState = AsyncState<StepsSummary>;

/**
 * Lee del teléfono y sincroniza con el servidor, en ese orden.
 *
 * Sube toda la ventana sincronizable y no solo hoy: el móvil puede llevar días
 * sin abrir la app, y un duelo se puntúa sobre `step_logs`, no sobre lo que se
 * viera en pantalla. Después vuelve a preguntar al servidor en vez de fiarse
 * de lo que devolvió la sincronización, porque esa respuesta trae solo los
 * días **guardados** —los que caen fuera de su ventana se saltan en silencio—
 * y hoy podría no estar entre ellos.
 */
async function loadSteps(): Promise<StepsSummary> {
  const [access, goal] = await Promise.all([getStepsAccess(), stepsRepository.getDailyStepGoal()]);

  if (access.status !== 'granted') {
    return { access, today: null, goal, capped: false };
  }

  const from = daysAgoKey(SYNC_WINDOW_DAYS);
  const to = todayKey();

  await stepsRepository.syncDailySteps(await readDailySteps(from, to));

  const stored = await stepsRepository.getStoredSteps(from, to);
  const today = stored.find((day) => day.date === to);

  return { access, today: today?.storedSteps ?? 0, goal, capped: today?.capped ?? false };
}

async function fetchStepsState(): Promise<StepsState> {
  try {
    return { status: 'ready', data: await loadSteps() };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return { status: 'error', message };
  }
}

/**
 * Pasos de hoy, ya sincronizados con el servidor (KAN-50).
 *
 * No lleva `signedOut` como `useProfile` o `useFriendships`: la mitad de lo que
 * hace —leer el podómetro o Health Connect— no necesita sesión, y las pantallas
 * que lo usan viven detrás del guard de sesión de `_layout.tsx`.
 */
export function useSteps() {
  const [state, setState] = useState<StepsState>({ status: 'loading' });

  const reload = useCallback(async () => {
    setState(await fetchStepsState());
  }, []);

  useEffect(() => {
    let subscribed = true;

    async function sync() {
      const next = await fetchStepsState();

      if (subscribed) {
        setState(next);
      }
    }

    void sync();

    return () => {
      subscribed = false;
    };
  }, []);

  /**
   * Abre el diálogo del sistema y recarga pase lo que pase: si el usuario
   * acepta hay que leer sus pasos ya, y si dice que no hay que reflejar la
   * negativa para poder mandarlo a Ajustes. `loadSteps` cubre los dos casos,
   * así que no hace falta ramificar aquí.
   */
  const requestAccess = useCallback(async () => {
    const access = await requestStepsAccess();
    await reload();

    return access;
  }, [reload]);

  return { state, reload, requestAccess };
}
