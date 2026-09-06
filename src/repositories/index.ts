/**
 * Composition root de los repositorios: el único archivo del proyecto que
 * sabe que el backend actual es Supabase. Pantallas y hooks importan de aquí,
 * nunca de `supabase/*` ni de `@/lib/supabase` directamente.
 *
 * Cambiar de backend es escribir una clase nueva en un archivo hermano de
 * `supabase/` que implemente el mismo contrato, y apuntar aquí a esa clase.
 * Envolver esa clase en un `Cached<Entidad>Repository` (ver `cache.ts`) es lo
 * que hace que el dato viva a nivel de app en vez de pedirse cada vez que se
 * entra a la pantalla.
 */

import { supabase } from '@/lib/supabase';
import { CachedFriendshipRepository } from '@/repositories/cached-friendship-repository';
import { CachedProfileRepository } from '@/repositories/cached-profile-repository';
import type { FriendshipRepository } from '@/repositories/friendship-repository';
import type { ProfileRepository } from '@/repositories/profile-repository';
import type { StepsRepository } from '@/repositories/steps-repository';
import { SupabaseFriendshipRepository } from '@/repositories/supabase/friendship-repository';
import { SupabaseProfileRepository } from '@/repositories/supabase/profile-repository';
import { SupabaseStepsRepository } from '@/repositories/supabase/steps-repository';

export type { PickedImage, Profile, ProfileRepository } from '@/repositories/profile-repository';
export type {
  Friend,
  FriendRequest,
  FriendshipRepository,
  Friendships,
  ProfileMatch,
} from '@/repositories/friendship-repository';
export type { StepSyncOutcome, StepsRepository } from '@/repositories/steps-repository';
export { RepositoryError } from '@/repositories/errors';

const profiles = new CachedProfileRepository(new SupabaseProfileRepository(supabase));

export const profileRepository: ProfileRepository = profiles;

/**
 * La caché de amistades se invalida con la sesión igual que la de perfil,
 * pero la suscripción no la conoce el decorador: se la pasa este archivo, que
 * es el único que sabe que ambos repositorios existen y hablan con el mismo
 * Supabase. Ver `SessionChangeSource` en `cache.ts`.
 */
export const friendshipRepository: FriendshipRepository = new CachedFriendshipRepository(
  new SupabaseFriendshipRepository(supabase),
  (listener) => profiles.onSessionChange(listener),
);

/**
 * Sin caché a propósito (regla 5 al revés): es sobre todo escritura, y sus
 * lecturas tienen que reflejar el estado exacto del servidor justo después de
 * sincronizar — el servidor recorta y aplica `GREATEST`, así que un valor
 * guardado de hace 30 segundos podría no ser el que decide el duelo.
 */
export const stepsRepository: StepsRepository = new SupabaseStepsRepository(supabase);
