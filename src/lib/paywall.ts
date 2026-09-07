/**
 * Aritmética de los planes del paywall.
 *
 * Los precios ya **no viven aquí**. Los da la store a través de
 * `subscriptionRepository.getCurrentOffering()`, ya formateados en la moneda y
 * el formato del país del usuario — que es la única cifra que se puede pintar
 * sin mentir. Lo que queda en este archivo es lo que ningún SDK calcula:
 * contra qué plan se mide el ahorro, cuánto ahorra cada uno y cuál viene
 * marcado al abrir la pantalla.
 *
 * Todo se calcula sobre `monthlyPrice` (número, misma moneda para todos los
 * paquetes de una oferta), nunca sobre el precio ya formateado: `"$69.99"` es
 * texto, y un porcentaje sacado de un texto es un porcentaje que acaba
 * mintiendo en cuanto cambia la moneda.
 */

import type { SubscriptionPackage } from '@/repositories';

/** Un paquete del que la store sí dio el equivalente mensual. */
type PricedPackage = SubscriptionPackage & { monthlyPrice: number };

function isPriced(pkg: SubscriptionPackage): pkg is PricedPackage {
  return pkg.monthlyPrice !== null && pkg.monthlyPrice > 0;
}

/**
 * El plan contra el que se mide el ahorro de los demás: **el más caro al mes**.
 *
 * No es «el mensual» por su nombre. La oferta de RevenueCat la monta quien
 * quiere en el dashboard, y puede no tener plan mensual, tener tres, o
 * llamarlos de otra forma. El más caro por mes hace de precio de lista se llame
 * como se llame.
 *
 * `null` si ningún paquete trae equivalente mensual (una oferta solo de
 * vitalicios o consumibles): entonces no hay ahorro que enseñar.
 */
export function baselinePackage(packages: readonly SubscriptionPackage[]): PricedPackage | null {
  const priced = packages.filter(isPriced);
  if (priced.length === 0) return null;

  return priced.reduce((most, candidate) =>
    candidate.monthlyPrice > most.monthlyPrice ? candidate : most,
  );
}

/**
 * Cuánto ahorra este plan frente al de referencia, en porcentaje entero.
 *
 * Devuelve `0` —y entonces no se pinta— para el propio plan de referencia, para
 * cualquiera que no ahorre nada y para los que la store no da equivalente
 * mensual. Un «Save 0%» no aporta, y un «Save NaN%» aporta menos.
 */
export function savingsPercent(
  pkg: SubscriptionPackage,
  baseline: SubscriptionPackage | null,
): number {
  if (!baseline || !isPriced(pkg) || !isPriced(baseline)) return 0;

  const saved = 1 - pkg.monthlyPrice / baseline.monthlyPrice;
  return Math.max(0, Math.round(saved * 100));
}

/**
 * El plan que viene marcado al abrir: el que más ahorra. Si hay empate o
 * ninguno ahorra, el primero de la oferta — el orden lo decide quien montó la
 * oferta en RevenueCat, así que su primero es una elección, no el azar.
 */
export function recommendedPackage(
  packages: readonly SubscriptionPackage[],
): SubscriptionPackage | null {
  const baseline = baselinePackage(packages);

  return packages.reduce<SubscriptionPackage | null>((best, candidate) => {
    if (!best) return candidate;

    return savingsPercent(candidate, baseline) > savingsPercent(best, baseline) ? candidate : best;
  }, null);
}
