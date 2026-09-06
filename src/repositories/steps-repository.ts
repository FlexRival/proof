/**
 * Contrato de sincronización de pasos. Ni este archivo ni quien lo consuma
 * saben que detrás hay Supabase — eso vive en `supabase/steps-repository.ts`.
 *
 * El reparto de trabajo con `src/lib/steps/` es deliberado: aquella capa LEE
 * del teléfono, esta ESCRIBE en el servidor. Se pueden probar por separado y,
 * si algún día cambia el backend, la lectura de pasos no se entera.
 */

import type { DailySteps } from '@/lib/steps/types';

/** Qué pasó al intentar subir un día. */
export type StepSyncOutcome = {
  date: string;
  /** Lo que el servidor guardó de verdad, que puede no ser lo que se mandó. */
  storedSteps: number;
  /**
   * `true` si el servidor recortó la cifra por el tope diario
   * (`daily_step_cap()`). La app no debería enseñar un número que el servidor
   * no acepta: el marcador del duelo va a usar el recortado.
   */
  capped: boolean;
};

export interface StepsRepository {
  /**
   * Sube un rango de días ya leídos del teléfono.
   *
   * El servidor **es la autoridad** sobre lo que se guarda: recorta por el
   * tope diario, rechaza fechas fuera de la ventana sincronizable y nunca deja
   * que una lectura menor pise a una mayor del mismo día. Por eso devuelve lo
   * que quedó guardado en vez de un `void`: es lo único de lo que la app se
   * puede fiar para pintar.
   *
   * Los días fuera de la ventana que acepta el servidor se descartan **antes**
   * de la llamada, no se mandan para que los rechace. Y si alguno se cuela —el
   * cliente y el servidor calculan «hoy» en husos distintos—, el servidor lo
   * salta sin tumbar el resto: **puede devolver menos días de los enviados**, y
   * lo que vuelve es lo único que se ha guardado de verdad.
   */
  syncDailySteps(days: DailySteps[]): Promise<StepSyncOutcome[]>;

  /** Los pasos que el servidor tiene guardados para el usuario de la sesión. */
  getStoredSteps(from: string, to: string): Promise<StepSyncOutcome[]>;
}
