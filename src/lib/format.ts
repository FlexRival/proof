/**
 * Formateo de cifras de la interfaz.
 *
 * La copy de la app está en inglés (`8,742`, `2,450 / 3,000`), así que la
 * locale va fija aquí. Cuando haya i18n saldrá de la locale del dispositivo —
 * y entonces se cambia en este archivo, no en cada pantalla.
 */
const NUMBER_FORMAT = new Intl.NumberFormat('en-US');

/** Separadores de millar: `8742` → `8,742`. */
export function formatCount(value: number): string {
  return NUMBER_FORMAT.format(value);
}

/**
 * Cifras grandes abreviadas: `1420000` → `1.42M`. El diseño rotula así el
 * total de pasos del perfil, donde el número exacto no aporta nada.
 */
const COMPACT_FORMAT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});

export function formatCompact(value: number): string {
  return COMPACT_FORMAT.format(value);
}

/**
 * Mes y año en mayúsculas para "fecha de alta": `2026-03-14T...` → `MAR 2026`.
 * El "JOINED" delante es copy de pantalla, no de este formateador.
 */
const JOIN_DATE_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });

export function formatJoinDate(isoDate: string): string {
  return JOIN_DATE_FORMAT.format(new Date(isoDate)).toUpperCase();
}
