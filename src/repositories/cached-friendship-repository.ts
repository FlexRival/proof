import { RepositoryCache, type SessionChangeSource } from '@/repositories/cache';
import type {
  FriendshipRepository,
  Friendships,
  ProfileMatch,
} from '@/repositories/friendship-repository';

/**
 * Envuelve cualquier `FriendshipRepository` y le añade caché a la lista de
 * amigos, que se pide desde dos sitios: la pestaña de Amigos y el paso 1 del
 * asistente de duelo. Sin esto, ir de una a otra recarga lo mismo.
 *
 * Todo lo que muta la relación invalida el caché al terminar: aceptar una
 * solicitud cambia la lista de amigos y la de solicitudes a la vez, y esperar
 * los 30 segundos de caducidad dejaría al usuario mirando la pantalla anterior
 * después de pulsar. Un cambio de sesión también la invalida al instante — la
 * lista guardada puede ser la de otra cuenta.
 */
export class CachedFriendshipRepository implements FriendshipRepository {
  private readonly cache: RepositoryCache<Friendships | null>;

  constructor(
    private readonly inner: FriendshipRepository,
    onSessionChange: SessionChangeSource,
    staleMs?: number,
  ) {
    this.cache = new RepositoryCache<Friendships | null>(staleMs);
    onSessionChange(() => this.cache.invalidate());
  }

  getFriendships(): Promise<Friendships | null> {
    return this.cache.getOrFetch(() => this.inner.getFriendships());
  }

  /**
   * Sin caché a propósito: cada búsqueda lleva un texto distinto, así que una
   * caché de un solo hueco devolvería los resultados de la búsqueda anterior.
   */
  searchByUsername(query: string): Promise<ProfileMatch[]> {
    return this.inner.searchByUsername(query);
  }

  async sendRequest(userId: string): Promise<void> {
    await this.inner.sendRequest(userId);
    this.cache.invalidate();
  }

  async respondToRequest(friendshipId: string, accept: boolean): Promise<void> {
    await this.inner.respondToRequest(friendshipId, accept);
    this.cache.invalidate();
  }

  async cancelRequest(friendshipId: string): Promise<void> {
    await this.inner.cancelRequest(friendshipId);
    this.cache.invalidate();
  }

  async removeFriend(friendshipId: string): Promise<void> {
    await this.inner.removeFriend(friendshipId);
    this.cache.invalidate();
  }
}
