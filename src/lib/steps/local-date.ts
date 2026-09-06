/**
 * Fechas locales para la capa de pasos.
 *
 * Todo lo que toca `step_logs.date` pasa por aquí. El motivo es una sola cosa,
 * pero cuesta cara si se hace mal: **el día del usuario no es el día UTC**.
 * `new Date('2026-09-06')` se interpreta como medianoche UTC, así que en
 * Madrid en verano eso son las 02:00 del día 6 — y en Los Ángeles, las 17:00
 * del día 5. Construir las fechas a partir de componentes locales evita que
 * los pasos de la noche acaben contados en el día equivocado, que en un duelo
 * que se decide por márgenes pequeños es la diferencia entre ganar y perder.
 */

/** `YYYY-MM-DD` de un `Date`, leído en la zona horaria del dispositivo. */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** Medianoche local del día indicado. */
export function startOfLocalDay(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

/**
 * Instante en que empieza el día siguiente. Se usa como extremo **abierto** de
 * los rangos: `[inicio, finExclusivo)`. Usar 23:59:59 en su lugar perdería el
 * último segundo del día, y con él los pasos de quien llega justo a medianoche.
 */
export function startOfNextLocalDay(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);

  return new Date(year, month - 1, day + 1, 0, 0, 0, 0);
}

/** Todas las claves de día entre `from` y `to`, ambas inclusive. */
export function eachDateKey(from: string, to: string): string[] {
  const keys: string[] = [];
  const last = startOfLocalDay(to);

  for (let day = startOfLocalDay(from); day <= last; day = startOfNextLocalDay(toDateKey(day))) {
    keys.push(toDateKey(day));
  }

  return keys;
}

/** Clave del día de hoy en la zona del dispositivo. */
export function todayKey(): string {
  return toDateKey(new Date());
}

/** Clave del día que cae `days` días antes de hoy. */
export function daysAgoKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);

  return toDateKey(date);
}
