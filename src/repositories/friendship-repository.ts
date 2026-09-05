/**
 * Contrato de amistades. Ni este archivo ni quien lo consuma saben que detrás
 * hay Supabase — eso vive en `supabase/friendship-repository.ts`.
 *
 * El modelo del servidor es **una fila por relación** (`friendships`, con
 * `requester_id`/`addressee_id`/`status`). La app no quiere eso: quiere «mis
 * amigos», «lo que me han pedido» y «lo que pedí yo». La traducción de un
 * modelo al otro — averiguar cuál de los dos ids es el del otro, y de qué
 * lado cae cada solicitud pendiente — la hace el repositorio, no la pantalla.
 */

/** Alguien con quien la amistad ya está aceptada. */
export type Friend = {
  /**
   * Id de la fila de amistad. Es lo que piden las RPC para romperla, y no
   * coincide con `userId`: confundirlos deja los botones llamando al servidor
   * con el id equivocado.
   */
  friendshipId: string;
  /** Id del amigo. Es lo que pedirá `request_duel` para retarlo. */
  userId: string;
  username: string;
  level: number;
  streakDays: number;
  /** `null` si ese usuario nunca subió foto de perfil. */
  avatarUrl: string | null;
};

/**
 * Solicitud todavía sin responder. Sirve para los dos sentidos: de quién
 * partió lo dice en qué lista aparece (`incoming` / `outgoing`), no un campo
 * dentro del propio objeto.
 */
export type FriendRequest = {
  friendshipId: string;
  /** Id de la otra persona: quien te la mandó, o a quien se la mandaste. */
  userId: string;
  username: string;
  level: number;
  avatarUrl: string | null;
};

export type Friendships = {
  friends: Friend[];
  /** Te las mandaron a ti: puedes aceptarlas o rechazarlas. */
  incoming: FriendRequest[];
  /** Las mandaste tú: solo puedes cancelarlas. */
  outgoing: FriendRequest[];
};

/**
 * Un perfil encontrado buscando, sin relación contigo todavía. No es un
 * `Friend`: no hay `friendshipId` que enseñar porque aún no existe la fila.
 */
export type ProfileMatch = {
  userId: string;
  username: string;
  level: number;
  avatarUrl: string | null;
};

export interface FriendshipRepository {
  /**
   * Amigos y solicitudes vivas del usuario de la sesión, o `null` si no hay
   * sesión iniciada — el mismo criterio que `getCurrentProfile()`.
   */
  getFriendships(): Promise<Friendships | null>;

  /**
   * Busca perfiles por nombre de usuario para poder mandarles solicitud.
   * Excluye al propio usuario. Una búsqueda vacía devuelve lista vacía, no el
   * directorio entero.
   */
  searchByUsername(query: string): Promise<ProfileMatch[]>;

  /** Manda solicitud. Falla si ya hay una viva entre los dos, en cualquier sentido. */
  sendRequest(userId: string): Promise<void>;

  /** Acepta (`true`) o rechaza (`false`) una solicitud recibida. */
  respondToRequest(friendshipId: string, accept: boolean): Promise<void>;

  /** Retira una solicitud propia que sigue pendiente. */
  cancelRequest(friendshipId: string): Promise<void>;

  /** Deshace una amistad ya aceptada. */
  removeFriend(friendshipId: string): Promise<void>;
}
