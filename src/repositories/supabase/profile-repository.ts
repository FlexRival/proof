import { decode } from 'base64-arraybuffer';

import type { SupabaseClient } from '@supabase/supabase-js';

import { RepositoryError } from '@/repositories/errors';
import type {
  AuthLinkPurpose,
  PickedImage,
  Profile,
  ProfileRepository,
} from '@/repositories/profile-repository';

import type { Database, ProfileRow } from '@/lib/database.types';

const AVATAR_BUCKET = 'avatars';

/**
 * Los parámetros que Supabase mete en un enlace de correo, vengan donde vengan.
 *
 * Van en el **fragmento** (`#access_token=…`) y no en la query, porque el flujo
 * implícito —el que usa este proyecto: `flowType` no se toca y por defecto es
 * ese— los devuelve así para que no viajen a ningún servidor. `Linking.parse()`
 * de Expo solo desglosa la query, así que aquí se parte a mano.
 *
 * Se mira también la query porque los enlaces de error a veces llegan por ahí,
 * y porque en web el navegador puede haber consumido ya el fragmento.
 */
function authParamsFrom(url: string): URLSearchParams | null {
  const fragment = url.split('#')[1];
  if (fragment) {
    return new URLSearchParams(fragment);
  }

  const query = url.split('?')[1];

  return query ? new URLSearchParams(query) : null;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    level: row.level,
    xp: row.xp,
    streakDays: row.streak_days,
    isPro: row.is_pro,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** `image/jpeg` → `jpeg`. Cae a `jpg` si el mimeType no trae subtipo reconocible. */
function extensionForMimeType(mimeType: string): string {
  return mimeType.split('/')[1] || 'jpg';
}

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getCurrentProfile(): Promise<Profile | null> {
    const { data: userData, error: userError } = await this.client.auth.getUser();

    if (userError || !userData.user) {
      return null;
    }

    const { data, error } = await this.client
      .from('profiles')
      .select('*')
      .eq('id', userData.user.id)
      .single();

    if (error) {
      throw new RepositoryError('No se pudo cargar el perfil.', { cause: error });
    }

    return toProfile(data);
  }

  onSessionChange(listener: () => void): () => void {
    const {
      data: { subscription },
    } = this.client.auth.onAuthStateChange(() => listener());

    return () => subscription.unsubscribe();
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });

    if (error) {
      throw new RepositoryError('No se pudo iniciar sesión. Revisa tu email y contraseña.', {
        cause: error,
      });
    }
  }

  async signUp(
    email: string,
    password: string,
    username: string,
  ): Promise<{ needsEmailConfirmation: boolean }> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });

    if (error) {
      throw new RepositoryError('No se pudo crear la cuenta.', { cause: error });
    }

    // Si el proyecto exige confirmar el email, `signUp` crea el usuario pero
    // no abre sesión todavía: `data.session` viene `null` hasta que confirme.
    return { needsEmailConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();

    if (error) {
      throw new RepositoryError('No se pudo cerrar sesión.', { cause: error });
    }
  }

  async sendPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });

    // Supabase no distingue un email registrado de uno que no lo está, así que
    // un `error` aquí es un fallo de verdad (red, cuota de correos) y no un
    // «ese usuario no existe». Se propaga tal cual.
    if (error) {
      throw new RepositoryError('No se pudo enviar el correo de recuperación.', { cause: error });
    }
  }

  async updatePassword(newPassword: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password: newPassword });

    if (error) {
      throw new RepositoryError('No se pudo cambiar la contraseña.', { cause: error });
    }
  }

  async resumeSessionFromLink(url: string): Promise<AuthLinkPurpose> {
    const params = authParamsFrom(url);
    if (!params) {
      return 'none';
    }

    // Supabase manda el fallo dentro del propio enlace, no como código HTTP: uno
    // caducado llega igual de bien que uno válido, solo que con
    // `error_description` en vez de con tokens. Es el caso más frecuente de
    // todos —estos correos expiran en una hora— así que tiene que llegar a la
    // pantalla como un mensaje y no como un silencio.
    const failure = params.get('error_description') ?? params.get('error');
    if (failure) {
      throw new RepositoryError(failure.replace(/\+/g, ' '));
    }

    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (params.get('type') !== 'recovery' || !accessToken || !refreshToken) {
      return 'none';
    }

    const { error } = await this.client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      throw new RepositoryError('Ese enlace ya no sirve. Pide uno nuevo.', { cause: error });
    }

    return 'recovery';
  }

  /** No-op: esta implementación no cachea nada. El caché vive en el decorador. */
  invalidate(): void {}

  async updateAvatar(image: PickedImage): Promise<Profile> {
    const { data: userData, error: userError } = await this.client.auth.getUser();
    if (userError || !userData.user) {
      throw new RepositoryError('Necesitas iniciar sesión para cambiar tu foto de perfil.', {
        cause: userError,
      });
    }

    // Misma ruta siempre (una foto de perfil por usuario): `upsert` reemplaza
    // el archivo anterior en vez de acumular uno por subida.
    const path = `${userData.user.id}/avatar.${extensionForMimeType(image.mimeType)}`;

    const { error: uploadError } = await this.client.storage
      .from(AVATAR_BUCKET)
      .upload(path, decode(image.base64), { contentType: image.mimeType, upsert: true });

    if (uploadError) {
      throw new RepositoryError('No se pudo subir la foto.', { cause: uploadError });
    }

    const {
      data: { publicUrl },
    } = this.client.storage.from(AVATAR_BUCKET).getPublicUrl(path);

    // La ruta no cambia entre subidas, así que sin esto cualquier caché de
    // imagen (la del propio componente `<Image>`, un CDN) seguiría enseñando
    // la foto vieja con la misma URL.
    const avatarUrl = `${publicUrl}?updated=${Date.now()}`;

    const { data, error } = await this.client
      .from('profiles')
      .update({ avatar_url: avatarUrl })
      .eq('id', userData.user.id)
      .select('*')
      .single();

    if (error) {
      throw new RepositoryError('No se pudo guardar la foto en tu perfil.', { cause: error });
    }

    return toProfile(data);
  }

  async deleteAccount(): Promise<void> {
    // Toda la operación vive en la Edge Function `delete-account`: borrar de
    // `auth.users` necesita la service role key, que no puede viajar dentro de
    // la app. Aquí no se manda ningún id — la función lo saca del JWT.
    const { error } = await this.client.functions.invoke('delete-account', { method: 'POST' });

    if (error) {
      throw new RepositoryError('No se pudo borrar tu cuenta. Inténtalo de nuevo.', {
        cause: error,
      });
    }

    // El usuario ya no existe en el servidor, pero el token que quedó en el
    // dispositivo sigue ahí hasta que se limpie. Sin esto, la app se quedaría
    // enseñando una sesión fantasma que no puede leer nada.
    //
    // Se ignora el error a propósito: la cuenta ya está borrada y no hay vuelta
    // atrás. Fallar aquí solo significa que el token local no se limpió — algo
    // que se arregla solo en cuanto Supabase intente refrescarlo y le digan que
    // ese usuario no existe.
    await this.client.auth.signOut().catch(() => undefined);
  }
}
