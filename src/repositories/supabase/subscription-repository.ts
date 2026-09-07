import type { SupabaseClient } from '@supabase/supabase-js';

import { RepositoryError } from '@/repositories/errors';
import type { SubscriptionServerGateway } from '@/repositories/subscription-repository';

import type { Database } from '@/lib/database.types';

/**
 * El lado servidor de la suscripción. Solo hace una cosa: invocar la Edge
 * Function `revenuecat-reconcile`, que consulta la REST API de RevenueCat (la
 * fuente de verdad) y recalcula `profiles.is_pro`. Ver `supabase/SCHEMA.md` §15.
 *
 * `supabase-js` adjunta el JWT de la sesión actual a la llamada; la función se
 * despliega con `verify_jwt = true` y usa siempre el `sub` de ese token como
 * `app_user_id`, nunca un parámetro — por eso este método no recibe el id.
 */
export class SupabaseSubscriptionGateway implements SubscriptionServerGateway {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async reconcile(): Promise<void> {
    const { error } = await this.client.functions.invoke('revenuecat-reconcile', {
      method: 'POST',
    });

    if (error) {
      throw new RepositoryError('No se pudo sincronizar la suscripción con el servidor.', {
        cause: error,
      });
    }
  }
}
