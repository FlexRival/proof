/**
 * Lector de pasos de **Health Connect** (Android). KAN-50.
 *
 * Health Connect es la única vía viva en Android: la API de Google Fit está
 * apagada (ver `docs/conteo-de-pasos.md` §2). Es una app aparte, preinstalada
 * a partir de Android 14 y descargable en Android 13 — por eso lo primero que
 * hace este módulo es preguntar si existe siquiera.
 *
 * POR QUÉ `readRecords` Y NO `aggregateRecord`:
 *   `aggregateRecord` devuelve el total del rango de un tirón, y sería más
 *   barato. Pero devuelve un número pelado, **sin metadatos**: no se puede
 *   saber qué parte de ese total la tecleó el usuario a mano. Como filtrar lo
 *   introducido a mano es justo el trabajo anti-cheat que el servidor no puede
 *   hacer (KAN-52: al servidor solo le llega el total ya sumado), aquí se leen
 *   los registros uno a uno y se suman los que sobreviven al filtro.
 */

import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  readRecords,
  RecordingMethod,
  requestPermission,
  SdkAvailabilityStatus,
} from 'react-native-health-connect';

import { startOfLocalDay, startOfNextLocalDay, toDateKey } from '@/lib/steps/local-date';
import type { DailySteps, StepsAccess, StepsReader } from '@/lib/steps/types';

/**
 * Se pide **solo** el permiso de pasos, y a propósito. Pedir tipos de dato que
 * no se usan es motivo de rechazo en el formulario de apps de salud de Google
 * Play (`docs/conteo-de-pasos.md` §7, KAN-54).
 */
const STEPS_PERMISSION = { accessType: 'read', recordType: 'Steps' } as const;

/**
 * Un registro por página son 1000 por defecto; un día normal genera unas
 * decenas. Se pagina igualmente porque una semana de un reloj que escribe cada
 * pocos minutos sí puede pasarse, y perder la última página sería perder pasos
 * sin que nadie se entere.
 */
const PAGE_SIZE = 1000;

async function availability(): Promise<StepsAccess | null> {
  const status = await getSdkStatus();

  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) {
    return { status: 'unavailable', reason: 'provider-missing' };
  }
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
    return { status: 'unavailable', reason: 'provider-update-required' };
  }

  return null;
}

async function hasStepsPermission(): Promise<boolean> {
  const granted = await getGrantedPermissions();

  return granted.some(
    (permission) =>
      'recordType' in permission &&
      permission.recordType === 'Steps' &&
      permission.accessType === 'read',
  );
}

export const healthConnectReader: StepsReader = {
  source: 'health-connect',

  async getAccess(): Promise<StepsAccess> {
    const unavailable = await availability();
    if (unavailable) {
      return unavailable;
    }

    await initialize();

    // Health Connect no distingue "aún no le he preguntado" de "dijo que no":
    // en ambos casos el permiso simplemente no está concedido. A diferencia de
    // iOS aquí sí se puede volver a preguntar, así que se trata como
    // `undetermined` y la pantalla puede ofrecer el botón otra vez.
    return (await hasStepsPermission()) ? { status: 'granted' } : { status: 'undetermined' };
  },

  async requestAccess(): Promise<StepsAccess> {
    const unavailable = await availability();
    if (unavailable) {
      return unavailable;
    }

    await initialize();
    await requestPermission([STEPS_PERMISSION]);

    // Se relee en vez de fiarse de lo que devuelve `requestPermission`: si el
    // usuario ya lo había concedido antes, el diálogo no aparece y la
    // respuesta puede venir vacía aunque el permiso esté puesto.
    return (await hasStepsPermission())
      ? { status: 'granted' }
      : { status: 'denied', canAskAgain: true };
  },

  async readDailySteps(from: string, to: string): Promise<DailySteps[]> {
    await initialize();

    const totals = new Map<string, number>();
    let pageToken: string | undefined;

    do {
      const page = await readRecords('Steps', {
        timeRangeFilter: {
          operator: 'between',
          startTime: startOfLocalDay(from).toISOString(),
          endTime: startOfNextLocalDay(to).toISOString(),
        },
        pageSize: PAGE_SIZE,
        pageToken,
      });

      for (const record of page.records) {
        // El filtro anti-cheat que el servidor no puede aplicar. Ojo: Health
        // Connect no garantiza la clasificación al 100% —es la mejor
        // información disponible, no una prueba—, así que esto reduce el
        // fraude casual, no lo elimina.
        if (record.metadata?.recordingMethod === RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY) {
          continue;
        }

        // Un registro se atribuye al día en que EMPIEZA. Un tramo que cruza la
        // medianoche cuenta entero en el día anterior; repartirlo a prorrata
        // sería inventar pasos que nadie midió.
        const key = toDateKey(new Date(record.startTime));
        totals.set(key, (totals.get(key) ?? 0) + record.count);
      }

      pageToken = page.pageToken;
    } while (pageToken);

    return [...totals.entries()]
      .map(([date, steps]) => ({ date, steps, source: 'health-connect' as const }))
      .sort((a, b) => a.date.localeCompare(b.date));
  },
};
