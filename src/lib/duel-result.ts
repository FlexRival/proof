/**
 * El resultado de un duelo ya cerrado, listo para pintarlo.
 *
 * Antes esto se leía de la URL (`/victory?opponent=…&steps=…`). Ya no: desde
 * KAN-32 el duelo existe de verdad en el servidor, así que la pantalla lo carga
 * por su id y esta capa solo deriva lo que no está guardado —el XP y si hubo
 * subida de nivel—, sin volver a preguntar.
 *
 * Nada de esto habla con el backend: es aritmética sobre un `Duel` que ya vino
 * del repositorio.
 */

import type { LevelUp } from '@/lib/level-up';
import { levelForXp, xpForDuelWin } from '@/lib/xp';
import type { Duel, DuelOutcome } from '@/repositories';

export type DuelResult = {
  duel: Duel;
  outcome: DuelOutcome;
  /** XP que se llevó el usuario. `0` si perdió o empató: solo gana el ganador. */
  xpEarned: number;
  /** `null` si el duelo no le hizo cambiar de nivel. */
  levelUp: LevelUp | null;
};

/**
 * Si este duelo hizo subir de nivel, deduciéndolo del XP que tiene el perfil
 * **ahora** menos el que acaba de ganar.
 *
 * Se deduce en vez de pasarlo por la URL porque un parámetro se puede quedar
 * viejo o falsear, y el XP del perfil ya lo escribió `resolve_duel` en el mismo
 * momento que el resultado: son el mismo hecho contado dos veces.
 *
 * Límite conocido: si el jugador cierra **dos** duelos ganados a la vez —al
 * abrir la app después de varios días—, restar solo el XP de este duelo puede
 * situar el nivel «de antes» más arriba de lo que estaba, y entonces la subida
 * no se celebra. Se prefiere callar una subida real a inventar una que no fue.
 */
function levelUpFrom(currentXp: number, xpEarned: number): LevelUp | null {
  if (xpEarned <= 0) {
    return null;
  }

  const before = levelForXp(currentXp - xpEarned);
  const after = levelForXp(currentXp);

  if (after <= before) {
    return null;
  }

  // Sin recompensa: el diseño reserva una card para ello, pero no existe el
  // sistema que la llene. Ver `LevelUp.reward` en `level-up.ts`.
  return { fromLevel: before, toLevel: after, reward: null };
}

/**
 * Traduce un duelo cerrado a lo que enseña la pantalla de resultado, o `null`
 * si ese duelo todavía no ha terminado — no hay nada que contar de un duelo en
 * marcha, y celebrarlo antes de tiempo sería mentir.
 */
export function duelResultFor(duel: Duel, currentXp: number): DuelResult | null {
  if (duel.status !== 'finished' || duel.outcome === null) {
    return null;
  }

  const xpEarned = duel.outcome === 'win' ? xpForDuelWin(duel.yourSteps) : 0;

  return {
    duel,
    outcome: duel.outcome,
    xpEarned,
    levelUp: levelUpFrom(currentXp, xpEarned),
  };
}
