import { levelProgress, type LevelProgress } from '@/lib/xp';

/**
 * Datos de mentira de las pantallas.
 *
 * **Temporal y a propósito.** KAN-22 pide montar la pantalla principal con
 * datos falsos mientras el backend no está; el perfil va detrás con el mismo
 * criterio. Tenerlos aquí, y no repartidos por el JSX, hace que sustituirlos
 * sea borrar un import en vez de reescribir las pantallas.
 *
 * A qué se conectará cada campo:
 * - `username`, `rank`, `xp`, `streak` → `profileRepository.getCurrentProfile()`,
 *   que ya existe (`src/repositories/profile-repository.ts`).
 * - `steps`, `totalSteps` → `0`, no inventados: no hay HealthKit/Health
 *   Connect conectado (ver `docs/conteo-de-pasos.md`), así que no hay ningún
 *   paso real que contar todavía. `stepGoal`/`dailyStepGoal` sí quedan con un
 *   valor (10.000): es un objetivo configurable, no una medición — tiene
 *   sentido enseñarlo antes de que exista tracking, igual que cualquier app de
 *   fitness deja fijar una meta antes de conectar un dispositivo.
 * - `duel`, `wins`, `losses`, `ACTIVE_DUELS`, `INCOMING_DUELS`,
 *   `OUTGOING_DUELS` → pendientes de un `duel-repository.ts` (KAN-32). Van
 *   vacíos/`null` (no con números inventados) para que las pantallas muestren
 *   su estado vacío real en vez de duelos que no existen.
 *
 * Los amigos **ya no están aquí**: salieron a `friendshipRepository`, que
 * envuelve las RPC de `supabase/SCHEMA.md` §13. Este archivo encoge según cada
 * entidad consigue su repositorio; cuando se quede sin nada, se borra.
 */
export type DuelSide = {
  name: string;
  steps: number;
};

export type HomeData = {
  username: string;
  rank: string;
  xp: number;
  steps: number;
  stepGoal: number;
  /**
   * `null` cuando no hay ningún duelo en curso. No es un caso raro: es el
   * estado de una cuenta recién hecha, y el diseño le dedica una pantalla
   * entera. Nullable en el tipo para que la pantalla no pueda olvidarse de
   * cubrirlo.
   */
  duel: {
    /** Cuenta atrás ya formateada. La dará el servidor, no se calcula aquí. */
    endsIn: string;
    you: DuelSide;
    rival: DuelSide;
  } | null;
};

export type ProfileData = {
  username: string;
  rank: string;
  xp: number;
  wins: number;
  losses: number;
  totalSteps: number;
};

/**
 * `duel: null` porque no hay `duel-repository.ts` todavía: sin él no hay
 * ningún duelo real que enseñar, así que la pantalla cae sola en su estado
 * de "sin duelos" (`NoDuelState`) en vez de fingir uno.
 */
export const HOME_DEMO: HomeData = {
  username: '@marcodev',
  rank: 'CHALLENGER',
  xp: 11450,
  steps: 0,
  stepGoal: 10000,
  duel: null,
};

/**
 * `wins`/`losses`/`totalSteps` en `0`: sin `duel-repository.ts` ni agregación
 * de `step_logs` no hay ninguno de verdad, y dejar los números de la captura
 * (28/18/1.42M) al lado de un `duel: null` de arriba sería contradictorio —
 * una cuenta sin duelos no puede tener victorias.
 */
export const PROFILE_DEMO: ProfileData = {
  username: HOME_DEMO.username,
  rank: HOME_DEMO.rank,
  xp: HOME_DEMO.xp,
  wins: 0,
  losses: 0,
  totalSteps: 0,
};

/** Progreso de nivel de los datos de demostración, con la aritmética real. */
export function demoLevelProgress(): LevelProgress {
  return levelProgress(HOME_DEMO.xp);
}

export type ActiveDuel = {
  opponent: string;
  yourSteps: number;
  theirSteps: number;
  /** Cuenta atrás ya formateada; la dará el servidor. */
  endsIn: string;
};

export type PendingDuel = {
  opponent: string;
  level: number;
  /** Línea de contexto ya redactada («Challenged you · 3 days»). */
  note: string;
};

/**
 * Sin `duel-repository.ts` no hay duelos de verdad: todo esto va vacío para
 * que la pantalla de Duelos muestre sus estados vacíos reales en vez de un
 * cara a cara inventado.
 */
export const FEATURED_DUEL: ActiveDuel | null = null;
export const ACTIVE_DUELS: ActiveDuel[] = [];
export const INCOMING_DUELS: PendingDuel[] = [];
export const OUTGOING_DUELS: PendingDuel[] = [];

/**
 * Ajustes de demostración. Los conmutadores son estado local de la pantalla:
 * todavía no hay dónde guardarlos.
 *
 * `stepTracking` dice la verdad (`NOT CONNECTED`), no lo que rotulaba el
 * diseño (`CONNECTED`): no hay HealthKit/Health Connect todavía (ver
 * `docs/conteo-de-pasos.md`), así que afirmar que sí está conectado sería la
 * misma mentira que los pasos de hoy. `dailyStepGoal` sí queda con un valor:
 * es un objetivo configurable, no una medición.
 */
export const SETTINGS_DEMO = {
  stepTracking: 'NOT CONNECTED',
  dailyStepGoal: 10000,
};
