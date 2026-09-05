import type { SupabaseClient } from '@supabase/supabase-js';

import { RepositoryError } from '@/repositories/errors';
import type {
  Friend,
  FriendRequest,
  FriendshipRepository,
  Friendships,
  ProfileMatch,
} from '@/repositories/friendship-repository';

import type { Database, FriendshipRow, ProfileRow } from '@/lib/database.types';

/** Cuántos perfiles devuelve una búsqueda como mucho. */
const SEARCH_LIMIT = 20;

/**
 * Estados que siguen vivos. `DECLINED` y `CANCELLED` son historia: el esquema
 * deja volver a pedir amistad después de uno de esos, así que arrastrarlos a
 * la pantalla solo enseñaría relaciones que ya no existen.
 */
const LIVE_STATUSES = ['PENDING', 'ACCEPTED'] as const;

function toFriend(row: FriendshipRow, other: ProfileRow): Friend {
  return {
    friendshipId: row.id,
    userId: other.id,
    username: other.username,
    level: other.level,
    streakDays: other.streak_days,
    avatarUrl: other.avatar_url,
  };
}

function toFriendRequest(row: FriendshipRow, other: ProfileRow): FriendRequest {
  return {
    friendshipId: row.id,
    userId: other.id,
    username: other.username,
    level: other.level,
    avatarUrl: other.avatar_url,
  };
}

function toProfileMatch(row: ProfileRow): ProfileMatch {
  return {
    userId: row.id,
    username: row.username,
    level: row.level,
    avatarUrl: row.avatar_url,
  };
}

/**
 * En una fila de amistad el «otro» es el que no eres tú. La tabla no tiene una
 * columna para eso porque la relación es simétrica: se deduce comparando.
 */
function otherUserId(row: FriendshipRow, me: string): string {
  return row.requester_id === me ? row.addressee_id : row.requester_id;
}

export class SupabaseFriendshipRepository implements FriendshipRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  private async currentUserId(): Promise<string | null> {
    const { data, error } = await this.client.auth.getUser();

    return error || !data.user ? null : data.user.id;
  }

  async getFriendships(): Promise<Friendships | null> {
    const me = await this.currentUserId();
    if (!me) {
      return null;
    }

    // Sin filtro por usuario: la policy `friendships_select_involved` ya deja
    // ver solo las filas donde participas. Repetir la condición aquí no daría
    // más seguridad y se desincronizaría de la policy en cuanto una cambie.
    const { data: rows, error } = await this.client
      .from('friendships')
      .select('*')
      .in('status', LIVE_STATUSES)
      .order('created_at', { ascending: false });

    if (error) {
      throw new RepositoryError('No se pudieron cargar tus amigos.', { cause: error });
    }

    const profiles = await this.profilesById(rows.map((row) => otherUserId(row, me)));

    const friendships: Friendships = { friends: [], incoming: [], outgoing: [] };

    for (const row of rows) {
      const other = profiles.get(otherUserId(row, me));

      // Un perfil que falta significa que esa cuenta desapareció entre las dos
      // consultas. Se salta la fila en vez de pintar un amigo sin nombre.
      if (!other) continue;

      if (row.status === 'ACCEPTED') {
        friendships.friends.push(toFriend(row, other));
      } else if (row.addressee_id === me) {
        friendships.incoming.push(toFriendRequest(row, other));
      } else {
        friendships.outgoing.push(toFriendRequest(row, other));
      }
    }

    return friendships;
  }

  /**
   * Los perfiles del otro lado de todas las amistades, en una sola consulta en
   * vez de una por fila. Va aparte, y no como `select` anidado, porque
   * `friendships` tiene **dos** claves ajenas a `profiles` (`requester_id` y
   * `addressee_id`) y el embebido de PostgREST obligaría a elegir una sola.
   */
  private async profilesById(userIds: string[]): Promise<Map<string, ProfileRow>> {
    const unique = [...new Set(userIds)];
    if (unique.length === 0) {
      return new Map();
    }

    const { data, error } = await this.client.from('profiles').select('*').in('id', unique);

    if (error) {
      throw new RepositoryError('No se pudieron cargar los perfiles de tus amigos.', {
        cause: error,
      });
    }

    return new Map(data.map((row) => [row.id, row]));
  }

  async searchByUsername(query: string): Promise<ProfileMatch[]> {
    const needle = query.trim();
    if (needle === '') {
      return [];
    }

    const me = await this.currentUserId();
    if (!me) {
      throw new RepositoryError('Necesitas iniciar sesión para buscar usuarios.');
    }

    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .ilike('username', `%${escapeLikePattern(needle)}%`)
      .neq('id', me)
      .order('username')
      .limit(SEARCH_LIMIT);

    if (error) {
      throw new RepositoryError('No se pudo buscar ese usuario.', { cause: error });
    }

    return data.map(toProfileMatch);
  }

  async sendRequest(userId: string): Promise<void> {
    const { error } = await this.client.rpc('send_friend_request', { p_addressee_id: userId });

    if (error) {
      throw new RepositoryError('No se pudo enviar la solicitud.', { cause: error });
    }
  }

  async respondToRequest(friendshipId: string, accept: boolean): Promise<void> {
    const { error } = await this.client.rpc('respond_to_friend_request', {
      p_friendship_id: friendshipId,
      p_accept: accept,
    });

    if (error) {
      throw new RepositoryError(
        accept ? 'No se pudo aceptar la solicitud.' : 'No se pudo rechazar la solicitud.',
        { cause: error },
      );
    }
  }

  async cancelRequest(friendshipId: string): Promise<void> {
    const { error } = await this.client.rpc('cancel_friend_request', {
      p_friendship_id: friendshipId,
    });

    if (error) {
      throw new RepositoryError('No se pudo cancelar la solicitud.', { cause: error });
    }
  }

  async removeFriend(friendshipId: string): Promise<void> {
    const { error } = await this.client.rpc('remove_friend', { p_friendship_id: friendshipId });

    if (error) {
      throw new RepositoryError('No se pudo eliminar a ese amigo.', { cause: error });
    }
  }
}

/**
 * `%` y `_` son comodines de `LIKE`: sin escaparlos, buscar «100_pasos»
 * encontraría también «100xpasos», y un solo «%» listaría a todo el mundo.
 * `\` escapa en el `LIKE` de Postgres, así que se escapa él mismo primero.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
