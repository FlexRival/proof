import { RepositoryError } from '@/repositories/errors';

/**
 * Contrato de duelos. Ni este archivo ni quien lo consuma saben que detrás hay
 * Supabase — eso vive en `supabase/duel-repository.ts`.
 *
 * El servidor guarda un duelo como una fila simétrica: `challenger_id` contra
 * `opponent_id`, con un marcador por cada lado. La app nunca quiere eso: quiere
 * **tus** pasos contra **los suyos**, y saber si vas ganando. Girar la fila para
 * ponerte a ti en un lado fijo lo hace el repositorio, no la pantalla; si no,
 * cada pantalla tendría que acordarse de comparar su propio id con los dos de
 * la fila, y basta con equivocarse una vez para enseñar el marcador al revés.
 */

/** Estado de un duelo, en términos de la app. */
export type DuelStatus = 'pending' | 'active' | 'finished' | 'declined';

/** Cómo acabó un duelo, desde el punto de vista del usuario de la sesión. */
export type DuelOutcome = 'win' | 'loss' | 'draw';

/** El rival, con lo justo para pintar su fila. */
export type DuelOpponent = {
  userId: string;
  username: string;
  level: number;
  /** `null` si esa persona nunca subió foto de perfil. */
  avatarUrl: string | null;
};

/**
 * Un duelo **visto desde el usuario de la sesión**: `yourSteps` siempre eres
 * tú, independientemente de quién retara a quién.
 */
export type Duel = {
  id: string;
  opponent: DuelOpponent;
  status: DuelStatus;
  /** `true` si el duelo lo creaste tú. Decide quién puede responderlo. */
  youChallenged: boolean;
  /** `YYYY-MM-DD`, ambos inclusive: el duelo cuenta el día de `endDate` entero. */
  startDate: string;
  endDate: string;
  yourSteps: number;
  theirSteps: number;
  /** `null` mientras no esté `finished`. */
  outcome: DuelOutcome | null;
};

/**
 * Los duelos repartidos como los enseña la interfaz. `incoming` y `outgoing`
 * son los dos lados de `pending`: de quién partió no es un campo dentro del
 * duelo, es en qué lista aparece.
 */
export type Duels = {
  active: Duel[];
  /** Te retaron a ti: puedes aceptar o rechazar. */
  incoming: Duel[];
  /** Retaste tú: solo queda esperar. */
  outgoing: Duel[];
  /** Ya resueltos, del más reciente al más antiguo. */
  finished: Duel[];
};

/**
 * El usuario gratis agotó su cupo de duelos del día
 * (`free_tier_daily_duel_limit()`, hoy 1).
 *
 * Es un tipo aparte y no un `RepositoryError` cualquiera porque la pantalla
 * tiene que **abrir el paywall**, no enseñar un error: es la primera puerta de
 * pago del producto (`supabase/SCHEMA.md` §6). Sigue siendo un error de
 * dominio, así que quien lo capture no necesita saber que el servidor lo marca
 * con el `ERRCODE` `PRO01`.
 */
export class DuelLimitReachedError extends RepositoryError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DuelLimitReachedError';
  }
}

/** Duración por defecto de un duelo, en días. La misma que `request_duel`. */
export const DEFAULT_DUEL_DAYS = 7;

export interface DuelRepository {
  /**
   * Todos los duelos del usuario de la sesión, o `null` si no hay sesión — el
   * mismo criterio que `getCurrentProfile()`.
   *
   * Los duelos `active` vienen con el marcador **recién sincronizado**: la fila
   * de `duels` solo se actualiza cuando alguien llama a `sync_duel_steps`, así
   * que leerla a pelo enseñaría los pasos de la última vez que alguien abrió la
   * app. Que eso sea así es un detalle del backend y se queda aquí dentro.
   */
  getDuels(): Promise<Duels | null>;

  /**
   * Un duelo suelto, o `null` si no existe o no participas en él (la policy de
   * `duels` no deja verlo, y para la app eso es lo mismo que si no estuviera).
   *
   * A diferencia de `getDuels`, **no** resincroniza el marcador: quien pide un
   * duelo por su id es la pantalla de resultado, y un duelo cerrado ya tiene el
   * marcador definitivo escrito por `resolve_duel`.
   */
  getDuel(duelId: string): Promise<Duel | null>;

  /**
   * Crea un duelo `pending`. Lanza `DuelLimitReachedError` si el usuario es
   * gratuito y ya gastó su cupo del día.
   */
  request(opponentId: string, durationDays: number): Promise<Duel>;

  /** Acepta (`true`) o rechaza (`false`) un duelo que te han mandado. */
  respond(duelId: string, accept: boolean): Promise<Duel>;

  /**
   * Cierra un duelo cuya ventana ya pasó y reparte el XP. Idempotente.
   *
   * La app no es la única que lo hace —un cron lo cierra solo cada hora
   * (`supabase/SCHEMA.md` §12)—, pero llamarlo al abrir la pantalla es lo que
   * hace que el resultado salga al momento en vez de esperar a la hora en
   * punto.
   */
  resolve(duelId: string): Promise<Duel>;
}
