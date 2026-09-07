import { RepositoryCache } from '@/repositories/cache';
import type { PickedImage, Profile, ProfileRepository } from '@/repositories/profile-repository';

/**
 * Envuelve cualquier `ProfileRepository` (hoy `SupabaseProfileRepository`,
 * mañana el que sea) y le añade caché: `getCurrentProfile()` solo pide al
 * backend si no se había pedido antes o si pasaron más de `staleMs`.
 *
 * Un cambio de sesión invalida el caché inmediatamente, sin esperar a que
 * caduque — el perfil cacheado puede ser el de otro usuario.
 */
export class CachedProfileRepository implements ProfileRepository {
  private readonly cache: RepositoryCache<Profile | null>;

  constructor(
    private readonly inner: ProfileRepository,
    staleMs?: number,
  ) {
    this.cache = new RepositoryCache<Profile | null>(staleMs);
    /**
     * Se suscribe aquí, en el constructor, para que esta invalidación llegue
     * SIEMPRE antes que la de cualquier hook: `index.ts` (que construye este
     * repositorio) se evalúa al cargar los módulos, antes de que ningún
     * componente pueda montarse y suscribirse él mismo a `onSessionChange`.
     * Supabase avisa a sus suscriptores en orden de suscripción, así que el
     * caché queda invalidado antes de que un hook llegue a leerlo de nuevo.
     * Si esto se moviera a un sitio que se suscribe más tarde (p. ej. dentro
     * de un hook), esa garantía de orden desaparece.
     */
    this.inner.onSessionChange(() => this.cache.invalidate());
  }

  getCurrentProfile(): Promise<Profile | null> {
    return this.cache.getOrFetch(() => this.inner.getCurrentProfile());
  }

  onSessionChange(listener: () => void): () => void {
    return this.inner.onSessionChange(listener);
  }

  // Mutaciones: sin caché, y el cambio de sesión que disparan ya invalida el
  // caché de `getCurrentProfile()` solo, vía la suscripción del constructor.
  signInWithPassword(email: string, password: string): Promise<void> {
    return this.inner.signInWithPassword(email, password);
  }

  signUp(
    email: string,
    password: string,
    username: string,
  ): ReturnType<ProfileRepository['signUp']> {
    return this.inner.signUp(email, password, username);
  }

  signOut(): Promise<void> {
    return this.inner.signOut();
  }

  sendPasswordReset(email: string, redirectTo: string): Promise<void> {
    return this.inner.sendPasswordReset(email, redirectTo);
  }

  updatePassword(newPassword: string): Promise<void> {
    return this.inner.updatePassword(newPassword);
  }

  /**
   * Sin invalidar a mano: abrir la sesión del enlace dispara un cambio de
   * sesión, y de eso ya se encarga la suscripción del constructor. Hacerlo aquí
   * además sería inofensivo, pero dejaría la misma regla escrita en dos sitios.
   */
  resumeSessionFromLink(url: string): ReturnType<ProfileRepository['resumeSessionFromLink']> {
    return this.inner.resumeSessionFromLink(url);
  }

  /** Caduca el perfil cacheado; la próxima lectura vuelve a pedirlo al backend. */
  invalidate(): void {
    this.cache.invalidate();
  }

  /**
   * Esta sí toca el caché explícitamente: a diferencia de las de arriba, no
   * dispara `onAuthStateChange` (no cambia la sesión), así que sin esto
   * `getCurrentProfile()` seguiría devolviendo la foto vieja hasta que
   * caducase el caché por su cuenta.
   */
  async updateAvatar(image: PickedImage): Promise<Profile> {
    const profile = await this.inner.updateAvatar(image);
    this.cache.invalidate();
    return profile;
  }
}
