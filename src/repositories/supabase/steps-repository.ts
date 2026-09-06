import type { SupabaseClient } from '@supabase/supabase-js';

import { RepositoryError } from '@/repositories/errors';
import type { StepSyncOutcome, StepsRepository } from '@/repositories/steps-repository';

import type { Database, StepLogRow } from '@/lib/database.types';
import { daysAgoKey, todayKey } from '@/lib/steps/local-date';
import type { DailySteps } from '@/lib/steps/types';

/**
 * Espejo de `step_sync_backfill_days()` en
 * `20260906130000_step_sync_anticheat.sql`. Se duplica a propósito: no tiene
 * sentido gastar una petición en días que el servidor va a descartar.
 *
 * Si los dos valores se desincronizan no se rompe nada: el servidor manda, y su
 * ventana lleva un día de margen a cada lado (`± 1` por husos horarios), así que
 * esta ventana local siempre cabe dentro de la suya. Un valor de más aquí solo
 * hace que el servidor se salte esos días; uno de menos desaprovecha histórico.
 * Aun así, conviene cambiarlos a la vez.
 */
const BACKFILL_DAYS = 7;

/**
 * Se filtra con fechas **locales** —las mismas que se van a enviar— y sin
 * generar el día de mañana: si el teléfono está en UTC+14, `todayKey()` ya
 * devuelve esa fecha por sí solo.
 */
function isWithinSyncWindow(date: string): boolean {
  return date >= daysAgoKey(BACKFILL_DAYS) && date <= todayKey();
}

function toOutcome(row: StepLogRow): StepSyncOutcome {
  return {
    date: row.date,
    storedSteps: row.steps_count,
    // `reported_steps` es lo que dijo el cliente antes de que el servidor
    // recortara. Es `null` en las filas escritas antes de esta migración, y
    // entonces no se puede saber: se asume que no hubo recorte.
    capped: row.reported_steps !== null && row.reported_steps > row.steps_count,
  };
}

export class SupabaseStepsRepository implements StepsRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async syncDailySteps(days: DailySteps[]): Promise<StepSyncOutcome[]> {
    const syncable = days.filter((day) => isWithinSyncWindow(day.date));

    if (syncable.length === 0) {
      return [];
    }

    const { data, error } = await this.client.rpc('sync_daily_steps_batch', {
      p_days: syncable.map((day) => ({
        date: day.date,
        steps: day.steps,
        source: day.source,
      })),
    });

    if (error) {
      throw new RepositoryError('No se pudieron sincronizar los pasos.', { cause: error });
    }

    // Puede volver menos días de los enviados: el servidor se salta los que
    // caen fuera de su ventana en vez de rechazar el lote entero. Quien pinte
    // esto debe fiarse de lo que vuelve, no de lo que mandó.
    return (data ?? []).map(toOutcome);
  }

  async getStoredSteps(from: string, to: string): Promise<StepSyncOutcome[]> {
    // Sin filtro por usuario: la policy `step_logs_select_own` ya deja ver solo
    // las filas propias. Repetir la condición aquí no daría más seguridad y se
    // desincronizaría de la policy en cuanto una de las dos cambiara.
    const { data, error } = await this.client
      .from('step_logs')
      .select('*')
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true });

    if (error) {
      throw new RepositoryError('No se pudieron leer los pasos guardados.', { cause: error });
    }

    return data.map(toOutcome);
  }
}
