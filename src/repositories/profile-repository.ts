/**
 * Contrato del perfil. Ni este archivo ni quien lo consuma saben que detrás
 * hay Supabase — eso vive en `supabase/profile-repository.ts`.
 */

/** Modelo de dominio: independiente de cómo lo guarde el backend. */
export type Profile = {
  id: string;
  username: string;
  level: number;
  xp: number;
  streakDays: number;
  isPro: boolean;
  /** `null` si el usuario nunca subió una foto de perfil. */
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Una imagen ya elegida por el usuario (de `expo-image-picker` u otro
 * selector), en la forma mínima que cualquier backend necesita para
 * guardarla: no acopla el contrato a un tipo de una librería concreta.
 */
export type PickedImage = {
  base64: string;
  mimeType: string;
};

/**
 * Para qué servía el enlace que el usuario acaba de abrir desde su correo.
 *
 * `'none'` no es un fallo: la app recibe todos los enlaces que abren su
 * esquema, y la mayoría no son de autenticación.
 */
export type AuthLinkPurpose = 'recovery' | 'none';

export interface ProfileRepository {
  /** Perfil de la sesión actual, o `null` si no hay sesión iniciada. */
  getCurrentProfile(): Promise<Profile | null>;

  /**
   * Se dispara en cada cambio de sesión (login, logout, refresco de token).
   * Devuelve la función para cancelar la suscripción.
   */
  onSessionChange(listener: () => void): () => void;

  /** Inicia sesión con email/contraseña. Lanza `RepositoryError` si falla. */
  signInWithPassword(email: string, password: string): Promise<void>;

  /**
   * Crea una cuenta nueva. Si el proyecto exige confirmar el email antes de
   * abrir sesión, `needsEmailConfirmation` viene en `true` y todavía no hay
   * sesión — la pantalla debe avisarlo en vez de asumir que ya se puede
   * entrar.
   */
  signUp(
    email: string,
    password: string,
    username: string,
  ): Promise<{ needsEmailConfirmation: boolean }>;

  /** Cierra la sesión actual. */
  signOut(): Promise<void>;

  /**
   * Manda al correo un enlace para recuperar la cuenta.
   *
   * `redirectTo` es la URL a la que ese enlace devuelve al usuario — en móvil,
   * un enlace profundo a la propia app. Lo decide quien llama y no el
   * repositorio porque construirlo depende del esquema y de la plataforma
   * (`Linking.createURL`), que son cosas de la app, no del backend.
   *
   * **No dice si ese email existe**, y es a propósito: responder distinto para
   * un correo registrado y para uno que no lo está convierte este formulario en
   * una forma de averiguar quién tiene cuenta.
   */
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;

  /**
   * Cambia la contraseña del usuario de la sesión actual.
   *
   * Requiere sesión: o la de siempre, o la que abre el enlace de recuperación
   * (`resumeSessionFromLink`). Sin ninguna de las dos, falla.
   */
  updatePassword(newPassword: string): Promise<void>;

  /**
   * Abre la sesión que viaja dentro de un enlace de correo de autenticación y
   * dice para qué era.
   *
   * Es lo que convierte «he pinchado el enlace del email» en «estoy dentro y
   * puedo cambiar la contraseña». Un enlace caducado o ya usado lanza
   * `RepositoryError` con el motivo, que es un caso corriente y hay que
   * enseñarlo: estos enlaces expiran en una hora.
   */
  resumeSessionFromLink(url: string): Promise<AuthLinkPurpose>;

  /**
   * Marca como caducado cualquier perfil cacheado, para que la siguiente lectura
   * vuelva a pedirlo al backend. Úsalo cuando algo externo cambió el perfil en
   * el servidor sin pasar por esta interfaz — por ejemplo, la Edge Function
   * `revenuecat-reconcile` moviendo `is_pro` tras una compra. Sin caché por
   * medio es un no-op.
   */
  invalidate(): void;

  /**
   * Sube una foto de perfil nueva y actualiza `avatarUrl` en el perfil del
   * usuario de la sesión actual. Devuelve el perfil ya actualizado.
   */
  updateAvatar(image: PickedImage): Promise<Profile>;

  /**
   * Borra la cuenta del usuario de la sesión actual: el perfil, sus pasos, sus
   * duelos, sus amistades y su foto. **No se puede deshacer y no hay papelera.**
   *
   * Es un requisito de tienda, no una función más: Apple (5.1.1(v)) y Google
   * Play obligan a que una app que deja crear cuenta deje borrarla desde
   * dentro. Quien la llame debe pedir confirmación explícita antes.
   *
   * Al terminar no queda sesión: el backend borra al usuario, así que quien
   * escuche `onSessionChange` verá el cierre de sesión y la app volverá sola al
   * login. No hace falta navegar a mano.
   */
  deleteAccount(): Promise<void>;
}
