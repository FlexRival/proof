/**
 * Lector de pasos del **podómetro del sistema** (`expo-sensors`). KAN-50.
 *
 * En iOS esto es mucho más de lo que parece: `Pedometer.getStepCountAsync`
 * lee de CoreMotion y devuelve **hasta 7 días de histórico**, que es
 * exactamente la ventana que acepta `sync_daily_steps` (KAN-52). O sea que
 * **iOS puede funcionar entero sin tocar HealthKit**, y eso ahorra el
 * entitlement de HealthKit, sus reglas de revisión y parte del papeleo de
 * privacidad (KAN-54). HealthKit aporta después: pasos del Apple Watch y de
 * otras apps, que CoreMotion no ve porque solo cuenta lo que midió ese iPhone.
 *
 * En Android es un respaldo pobre y hay que saberlo: `getStepCountAsync` **no
 * existe** fuera de iOS. Solo queda `watchStepCount`, que cuenta desde que la
 * app está abierta y en primer plano — no sirve para reconstruir el día, y
 * menos para un duelo. Si Health Connect no está disponible en un Android, lo
 * honesto es decirlo, no fingir un contador que empieza en cero cada vez.
 */

import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

import { eachDateKey, startOfLocalDay, startOfNextLocalDay } from '@/lib/steps/local-date';
import type { DailySteps, StepsAccess, StepsReader } from '@/lib/steps/types';

function toAccess(permission: Pedometer.PermissionResponse): StepsAccess {
  if (permission.granted) {
    return { status: 'granted' };
  }
  if (permission.status === 'undetermined') {
    return { status: 'undetermined' };
  }

  return { status: 'denied', canAskAgain: permission.canAskAgain };
}

export const pedometerReader: StepsReader = {
  source: 'pedometer',

  async getAccess(): Promise<StepsAccess> {
    if (!(await Pedometer.isAvailableAsync())) {
      return { status: 'unavailable', reason: 'no-sensor' };
    }

    return toAccess(await Pedometer.getPermissionsAsync());
  },

  async requestAccess(): Promise<StepsAccess> {
    if (!(await Pedometer.isAvailableAsync())) {
      return { status: 'unavailable', reason: 'no-sensor' };
    }

    return toAccess(await Pedometer.requestPermissionsAsync());
  },

  async readDailySteps(from: string, to: string): Promise<DailySteps[]> {
    if (Platform.OS !== 'ios') {
      return [];
    }

    const days: DailySteps[] = [];

    // Una llamada por día en vez de una por rango: `getStepCountAsync` devuelve
    // un total plano, así que pedir la semana entera daría un número que no se
    // puede repartir por días. Son 7 llamadas locales, sin red.
    for (const date of eachDateKey(from, to)) {
      const { steps } = await Pedometer.getStepCountAsync(
        startOfLocalDay(date),
        startOfNextLocalDay(date),
      );

      days.push({ date, steps, source: 'pedometer' });
    }

    return days;
  },
};
