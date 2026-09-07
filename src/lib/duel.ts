/**
 * Aritmética de duelos: cuánto queda y quién va ganando.
 *
 * Es lógica de negocio pura, sin backend, así que vive en `lib/` y no en
 * `repositories/` (skill `repository-pattern`, «qué NO es un repositorio»).
 *
 * Las fechas se leen en **hora local**, con los mismos ayudantes que la capa de
 * pasos: `duels.end_date` es un `DATE` y el duelo cuenta ese día entero, así
 * que interpretarlo en UTC adelantaría o atrasaría el final un día para casi
 * todo el mundo — y en un duelo que se decide por márgenes pequeños, eso es la
 * diferencia entre ganar y perder.
 */

import { startOfLocalDay, todayKey } from '@/lib/steps/local-date';
import type { Duel } from '@/repositories';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Días que le quedan al duelo contando hoy: `0` significa «acaba hoy» y un
 * número negativo, que la ventana ya pasó.
 *
 * Se redondea porque la diferencia entre dos medianoches locales no siempre son
 * 24 horas exactas: la noche en que cambia la hora tiene 23 o 25.
 */
export function daysRemaining(endDate: string): number {
  const end = startOfLocalDay(endDate).getTime();
  const today = startOfLocalDay(todayKey()).getTime();

  return Math.round((end - today) / MS_PER_DAY);
}

/**
 * `true` si al duelo ya no le quedan días. No implica que esté resuelto: el
 * servidor lo sigue teniendo `active` hasta que alguien llama a `resolve_duel`
 * (la app al abrir, o el cron horario).
 */
export function hasEnded(duel: Duel): boolean {
  return daysRemaining(duel.endDate) < 0;
}

/** Duración total del duelo en días, ambos extremos incluidos. */
export function durationInDays(duel: Duel): number {
  const start = startOfLocalDay(duel.startDate).getTime();
  const end = startOfLocalDay(duel.endDate).getTime();

  return Math.round((end - start) / MS_PER_DAY) + 1;
}

export type DuelStanding = 'leading' | 'behind' | 'tied';

/** Quién va por delante, desde el punto de vista del usuario de la sesión. */
export function standingOf(duel: Duel): DuelStanding {
  if (duel.yourSteps === duel.theirSteps) {
    return 'tied';
  }

  return duel.yourSteps > duel.theirSteps ? 'leading' : 'behind';
}

/** Diferencia de pasos entre los dos lados, siempre positiva. */
export function stepGap(duel: Duel): number {
  return Math.abs(duel.yourSteps - duel.theirSteps);
}

/**
 * El duelo que manda en la pantalla principal: el que está más cerca de acabar,
 * porque es el que exige actuar hoy.
 */
export function mostUrgent(duels: Duel[]): Duel | null {
  return duels.reduce<Duel | null>((soonest, duel) => {
    if (!soonest) return duel;

    return daysRemaining(duel.endDate) < daysRemaining(soonest.endDate) ? duel : soonest;
  }, null);
}
