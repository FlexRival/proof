import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import {
  DuelLimitReachedError,
  type Duel,
  type DuelOutcome,
  type DuelRepository,
  type DuelStatus,
  type Duels,
} from '@/repositories/duel-repository';
import { RepositoryError } from '@/repositories/errors';

import type {
  Database,
  DuelRow,
  DuelStatus as DuelStatusRow,
  ProfileRow,
} from '@/lib/database.types';

/**
 * El `ERRCODE` con el que `request_duel` rechaza a un usuario gratuito que ya
 * gastó su cupo del día. Es lo único que distingue «no puedes crear más» de un
 * error de verdad, y por eso se traduce a un tipo de dominio aquí mismo: fuera
 * de este archivo nadie debería reconocer un código de Postgres.
 */
const DUEL_LIMIT_ERRCODE = 'PRO01';

/** Los estados que se enseñan en «tus duelos». */
const LISTED_STATUSES: DuelStatusRow[] = ['PENDING', 'ACTIVE', 'FINISHED'];

const STATUS_BY_ROW: Record<DuelStatusRow, DuelStatus> = {
  PENDING: 'pending',
  ACTIVE: 'active',
  FINISHED: 'finished',
  DECLINED: 'declined',
};

/**
 * Un duelo rechazado no aparece en ninguna lista, pero `respond()` devuelve la
 * fila que acaba de escribir y esa sí puede venir `DECLINED`.
 */
function outcomeOf(row: DuelRow, me: string): DuelOutcome | null {
  if (row.status !== 'FINISHED') {
    return null;
  }
  if (row.winner_id === null) {
    return 'draw';
  }

  return row.winner_id === me ? 'win' : 'loss';
}

/**
 * Gira la fila para dejar al usuario de la sesión siempre en `yourSteps`. Es la
 * traducción que de verdad importa de este archivo: la tabla es simétrica y la
 * interfaz no.
 */
function toDuel(row: DuelRow, me: string, opponent: ProfileRow): Duel {
  const youChallenged = row.challenger_id === me;

  return {
    id: row.id,
    opponent: {
      userId: opponent.id,
      username: opponent.username,
      level: opponent.level,
      avatarUrl: opponent.avatar_url,
    },
    status: STATUS_BY_ROW[row.status],
    youChallenged,
    startDate: row.start_date,
    endDate: row.end_date,
    yourSteps: youChallenged ? row.challenger_steps : row.opponent_steps,
    theirSteps: youChallenged ? row.opponent_steps : row.challenger_steps,
    outcome: outcomeOf(row, me),
  };
}

/** En una fila de duelo el «otro» es el que no eres tú. */
function opponentIdOf(row: DuelRow, me: string): string {
  return row.challenger_id === me ? row.opponent_id : row.challenger_id;
}

function isDuelLimitError(error: PostgrestError): boolean {
  return error.code === DUEL_LIMIT_ERRCODE;
}

export class SupabaseDuelRepository implements DuelRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  private async currentUserId(): Promise<string | null> {
    const { data, error } = await this.client.auth.getUser();

    return error || !data.user ? null : data.user.id;
  }

  private async requireUserId(): Promise<string> {
    const me = await this.currentUserId();

    if (!me) {
      throw new RepositoryError('Necesitas iniciar sesión para eso.');
    }

    return me;
  }

  async getDuels(): Promise<Duels | null> {
    const me = await this.currentUserId();
    if (!me) {
      return null;
    }

    // Sin filtro por usuario: la policy de `duels` ya deja ver solo los duelos
    // en los que participas. Repetir la condición aquí no daría más seguridad y
    // se desincronizaría de la policy en cuanto una de las dos cambiara.
    const { data: rows, error } = await this.client
      .from('duels')
      .select('*')
      .in('status', LISTED_STATUSES)
      .order('created_at', { ascending: false });

    if (error) {
      throw new RepositoryError('No se pudieron cargar tus duelos.', { cause: error });
    }

    const scored = await this.withFreshScores(rows);
    const profiles = await this.profilesById(scored.map((row) => opponentIdOf(row, me)));

    const duels: Duels = { active: [], incoming: [], outgoing: [], finished: [] };

    for (const row of scored) {
      const opponent = profiles.get(opponentIdOf(row, me));

      // Un perfil que falta significa que esa cuenta desapareció entre las dos
      // consultas. Se salta la fila en vez de pintar un duelo sin rival.
      if (!opponent) continue;

      const duel = toDuel(row, me, opponent);

      if (duel.status === 'active') {
        duels.active.push(duel);
      } else if (duel.status === 'finished') {
        duels.finished.push(duel);
      } else if (duel.youChallenged) {
        duels.outgoing.push(duel);
      } else {
        duels.incoming.push(duel);
      }
    }

    return duels;
  }

  async getDuel(duelId: string): Promise<Duel | null> {
    const me = await this.currentUserId();
    if (!me) {
      return null;
    }

    const { data, error } = await this.client
      .from('duels')
      .select('*')
      .eq('id', duelId)
      .maybeSingle();

    if (error) {
      throw new RepositoryError('No se pudo cargar ese duelo.', { cause: error });
    }

    // `null` también cuando la policy lo esconde por no participar en él: desde
    // la app las dos cosas son «ese duelo no es tuyo».
    return data ? this.toDuelWithOpponent(data, me) : null;
  }

  /**
   * Recalcula el marcador de los duelos activos.
   *
   * `duels.challenger_steps` / `opponent_steps` no se mueven solos: los escribe
   * `sync_duel_steps`, que suma `step_logs` de los dos jugadores. Sin esta
   * llamada la pantalla enseñaría el marcador de la última vez que alguien la
   * abrió, y además es el único modo de ver los pasos del rival sin poder leer
   * sus filas.
   *
   * Un duelo que falla al sincronizar **no tumba la carga**: entre el `SELECT`
   * de arriba y esta llamada el cron horario pudo cerrarlo, y entonces la RPC
   * se queja de que ya no está activo. En ese caso vale la fila que ya se
   * leyó — es el último marcador bueno conocido, que es justo lo que la
   * pantalla iba a pintar de todas formas.
   */
  private async withFreshScores(rows: DuelRow[]): Promise<DuelRow[]> {
    return Promise.all(
      rows.map(async (row) => {
        if (row.status !== 'ACTIVE') {
          return row;
        }

        const { data, error } = await this.client.rpc('sync_duel_steps', { p_duel_id: row.id });

        return error || !data ? row : data;
      }),
    );
  }

  private async profilesById(userIds: string[]): Promise<Map<string, ProfileRow>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client.from('profiles').select('*').in('id', unique);

    if (error) {
      throw new RepositoryError('No se pudieron cargar los perfiles de tus rivales.', {
        cause: error,
      });
    }

    return new Map(data.map((row) => [row.id, row]));
  }

  /**
   * Las mutaciones devuelven la fila del duelo, así que necesitan además el
   * perfil del rival para poder construir un `Duel` de dominio completo.
   */
  private async toDuelWithOpponent(row: DuelRow, me: string): Promise<Duel> {
    const opponentId = opponentIdOf(row, me);
    const opponent = (await this.profilesById([opponentId])).get(opponentId);

    if (!opponent) {
      throw new RepositoryError('El rival de ese duelo ya no existe.');
    }

    return toDuel(row, me, opponent);
  }

  async request(opponentId: string, durationDays: number): Promise<Duel> {
    const me = await this.requireUserId();

    const { data, error } = await this.client.rpc('request_duel', {
      p_opponent_id: opponentId,
      p_duration_days: durationDays,
    });

    if (error) {
      if (isDuelLimitError(error)) {
        throw new DuelLimitReachedError('Has agotado tus duelos gratis de hoy.', { cause: error });
      }

      throw new RepositoryError('No se pudo crear el duelo.', { cause: error });
    }

    return this.toDuelWithOpponent(data, me);
  }

  async respond(duelId: string, accept: boolean): Promise<Duel> {
    const me = await this.requireUserId();

    const { data, error } = await this.client.rpc('respond_to_duel', {
      p_duel_id: duelId,
      p_accept: accept,
    });

    if (error) {
      throw new RepositoryError(
        accept ? 'No se pudo aceptar el duelo.' : 'No se pudo rechazar el duelo.',
        { cause: error },
      );
    }

    return this.toDuelWithOpponent(data, me);
  }

  async resolve(duelId: string): Promise<Duel> {
    const me = await this.requireUserId();

    const { data, error } = await this.client.rpc('resolve_duel', { p_duel_id: duelId });

    if (error) {
      throw new RepositoryError('No se pudo cerrar el duelo.', { cause: error });
    }

    return this.toDuelWithOpponent(data, me);
  }
}
