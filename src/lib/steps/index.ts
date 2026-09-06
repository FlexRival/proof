/**
 * Punto de entrada de la capa de pasos (KAN-50).
 *
 * Elige el lector que toca según la plataforma y no deja que esa decisión se
 * filtre a las pantallas: ellas piden `readDailySteps` y reciben lo mismo en
 * los dos sistemas.
 *
 * ESTO NO HABLA CON EL SERVIDOR. Leer del teléfono y subir a Supabase son dos
 * trabajos distintos: subir vive en `StepsRepository` (skill
 * `repository-pattern`, regla 1). Así la capa de pasos se puede probar sin
 * backend, y el repositorio sin teléfono.
 *
 * ESTADO: iOS va con CoreMotion vía podómetro, que ya cubre los 7 días de
 * histórico que acepta el servidor. HealthKit sigue pendiente de decidir
 * (ver KAN-50) y aportaría los pasos del Apple Watch y de otras apps.
 */

import { Platform } from 'react-native';

import { healthConnectReader } from '@/lib/steps/health-connect';
import { pedometerReader } from '@/lib/steps/pedometer';
import type { DailySteps, StepsAccess, StepsReader } from '@/lib/steps/types';

export type { DailySteps, StepsAccess, StepsReader, StepsSource, StepsUnavailableReason } from '@/lib/steps/types';
export { daysAgoKey, eachDateKey, todayKey, toDateKey } from '@/lib/steps/local-date';

function readerForPlatform(): StepsReader {
  return Platform.OS === 'android' ? healthConnectReader : pedometerReader;
}

/**
 * En Android, si Health Connect no está instalado o necesita actualizarse, no
 * se cae al podómetro: en esa plataforma el podómetro no sabe leer histórico
 * (`Pedometer.getStepCountAsync` es solo iOS), así que sustituirlo daría una
 * app que parece funcionar y en realidad no cuenta nada del día. Se devuelve
 * el estado real para que la pantalla de permisos (KAN-51) ofrezca instalar
 * Health Connect, que es la salida de verdad.
 */
export function getStepsAccess(): Promise<StepsAccess> {
  return readerForPlatform().getAccess();
}

export function requestStepsAccess(): Promise<StepsAccess> {
  return readerForPlatform().requestAccess();
}

/**
 * Se intentó leer pasos sin permiso. Lleva el `StepsAccess` dentro para que
 * quien lo capture pueda decidir qué enseñar —volver a pedirlo, mandar a
 * Ajustes u ofrecer instalar Health Connect— sin preguntar otra vez.
 */
export class StepsAccessError extends Error {
  constructor(readonly access: StepsAccess) {
    super(`No hay permiso para leer pasos (${access.status}).`);
    this.name = 'StepsAccessError';
  }
}

/**
 * Pasos por día en `[from, to]`, ambos inclusive, con claves `YYYY-MM-DD`
 * locales.
 *
 * Un día sin datos **no aparece** en el resultado, y eso es intencionado: no
 * es lo mismo "ese día no anduve" que "ese día no hay lectura". Rellenar los
 * huecos con ceros haría que un día sin sincronizar pisara con un cero unos
 * pasos que sí existen, y la RPC del servidor (`GREATEST`) está diseñada
 * precisamente para que eso no pueda pasar.
 */
export async function readDailySteps(from: string, to: string): Promise<DailySteps[]> {
  const reader = readerForPlatform();
  const access = await reader.getAccess();

  // Sin permiso, tanto Health Connect como CoreMotion lanzan una excepción de
  // plataforma —críptica y distinta en cada sistema— desde dentro del bucle de
  // lectura. Se comprueba antes para fallar con algo legible y para que la
  // pantalla sepa que el problema es el permiso y no la red. NO se devuelve
  // `[]`: sería el mismo cero ambiguo que `StepsAccess` existe para evitar.
  if (access.status !== 'granted') {
    throw new StepsAccessError(access);
  }

  return reader.readDailySteps(from, to);
}
