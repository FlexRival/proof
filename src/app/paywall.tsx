import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { Notice } from '@/components/molecules/notice';
import { PlanOption } from '@/components/molecules/plan-option';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { usePaywall, type OfferingState } from '@/hooks/use-paywall';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import { baselinePackage, recommendedPackage, savingsPercent } from '@/lib/paywall';
import { RepositoryError, type SubscriptionPackage } from '@/repositories';

/**
 * Paywall de Pro: aquí se compra la suscripción.
 *
 * Estructura de la maqueta —cerrar y restaurar arriba, titular, ventajas, los
 * planes, la llamada a la acción y la letra pequeña— vestida con el sistema de
 * diseño: oscuro, Chakra Petch en cifras y títulos, contorno Power donde la
 * maqueta pintaba relleno azul.
 *
 * **Los planes los da la store, no este archivo.** Nombre, precio y moneda
 * salen de la oferta activa de RevenueCat (`usePaywall`), ya localizados;
 * lo único que calcula la app es el ahorro relativo (`lib/paywall.ts`). Si no
 * hay oferta —sin claves del SDK, en web, o sin offering configurada— la
 * pantalla lo dice y no enseña ningún precio: un precio inventado en una
 * pantalla de pago es el peor error posible aquí.
 *
 * **Quién decide si eres Pro sigue siendo el servidor.** Comprar solo cobra;
 * `is_pro` lo mueve `revenuecat-reconcile`, y es lo que esta pantalla mira para
 * saber si ya hay suscripción (`docs/revenuecat.md` §1).
 */

/**
 * Lo que Pro desbloquea **hoy**: quitar el cupo diario de duelos gratis, que es
 * la única puerta implementada de verdad (`request_duel` limita a
 * `free_tier_daily_duel_limit()` al día cuando `is_pro = false`).
 *
 * La lista tiene una sola línea a propósito. La maqueta traía tres ventajas de
 * plantilla —una prometía quitar unos anuncios que esta app no tiene—, y una
 * ventaja inventada en la pantalla donde se cobra no es copy floja: es
 * publicidad engañosa. Cuando KAN-25 decida qué más separa Pro de gratis, esto
 * crece añadiendo claves aquí.
 */
const BENEFIT_KEYS = ['paywall.unlimitedDuels'];

/** Las dos acciones que pueden estar en vuelo; cualquiera bloquea a la otra. */
type PaywallAction = 'purchase' | 'restore';

type Translate = ReturnType<typeof useTranslation>['t'];

export default function PaywallScreen() {
  const { t } = useTranslation();
  const { state: profileState, reload: reloadProfile } = useProfile();
  const {
    state: offeringState,
    reload: reloadOffering,
    purchase,
    restore,
  } = usePaywall(reloadProfile);

  const [busy, setBusy] = useState<PaywallAction | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  /** La última acción que salió bien, para poder confirmar qué pasó. */
  const [done, setDone] = useState<PaywallAction | null>(null);

  const isPro = profileState.status === 'ready' && profileState.data.isPro;

  /**
   * Tras comprar se enseña la confirmación aunque `is_pro` no haya llegado
   * todavía a `true`: el cobro ya ocurrió, y quien acaba de pagar no puede
   * quedarse mirando el botón de comprar mientras el servidor reconcilia.
   */
  const unlocked = isPro || done === 'purchase';

  async function run(action: PaywallAction, work: () => Promise<void>) {
    // Puerta única de las dos acciones, y por eso el sitio donde se impide
    // solaparlas: el «Restaurar compras» del pie es texto, no un `Button`, así
    // que no tiene estado deshabilitado que lo frene. Sin esto, dos toques
    // seguidos abren dos veces la store.
    if (busy !== null) return;

    setBusy(action);
    setFailure(null);
    setDone(null);

    try {
      await work();
      setDone(action);
    } catch (error) {
      if (error instanceof PurchaseCancelled) return;

      setFailure(error instanceof RepositoryError ? error.message : t('common.somethingWentWrong'));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Compra el plan elegido. Cerrar la hoja de pago de la store **no es un
   * fallo**: vuelve como `'cancelled'` y la pantalla se queda como estaba, sin
   * error y sin confirmación.
   */
  function handlePurchase(pkg: SubscriptionPackage) {
    void run('purchase', async () => {
      if ((await purchase(pkg)) === 'cancelled') {
        throw new PurchaseCancelled();
      }
    });
  }

  function handleRestore() {
    void run('restore', restore);
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('paywall.close')}
              onPress={dismiss}>
              <ThemedText type="subheading">✕</ThemedText>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy !== null }}
              disabled={busy !== null}
              onPress={handleRestore}>
              <ThemedText type="smallBold" themeColor="primary">
                {busy === 'restore' ? t('paywall.restoring') : t('paywall.restore')}
              </ThemedText>
            </Pressable>
          </View>

          <ThemedText type="subtitle">{t('paywall.title')}</ThemedText>

          <View style={styles.benefits}>
            {BENEFIT_KEYS.map((key) => (
              <Benefit key={key} label={t(key)} />
            ))}
          </View>

          {unlocked ? (
            <ProStatus confirming={!isPro} />
          ) : (
            <Offer
              state={offeringState}
              busy={busy}
              onRetry={() => void reloadOffering()}
              onPurchase={handlePurchase}
            />
          )}

          {failure ? <Notice tone="rival" message={failure} /> : null}

          {done === 'restore' && !isPro ? (
            <Notice tone="info" message={t('paywall.nothingToRestore')} />
          ) : null}

          <View style={styles.legal}>
            <LegalLink label={t('paywall.restorePurchases')} onPress={handleRestore} />
            <LegalLink label={t('paywall.terms')} onPress={() => router.push(ROUTES.terms.href)} />
            <LegalLink
              label={t('paywall.privacy')}
              onPress={() => router.push(ROUTES.privacy.href)}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Salida silenciosa de `run()` cuando el usuario cierra la hoja de pago: ni
 * error que enseñar ni acción que dar por hecha. Nunca se pinta.
 */
class PurchaseCancelled extends Error {}

type OfferProps = {
  state: OfferingState;
  /** Qué hay en vuelo ahora mismo, o `null`. Cualquiera bloquea el botón. */
  busy: PaywallAction | null;
  onRetry: () => void;
  onPurchase: (pkg: SubscriptionPackage) => void;
};

/**
 * Los planes comprables, o la razón por la que no hay ninguno.
 *
 * El plan elegido vive aquí y no en la pantalla porque no lo necesita nadie
 * más: mientras no haya oferta cargada tampoco hay nada que elegir. Empieza sin
 * elección propia y cae en el plan recomendado, así que abrir la pantalla ya
 * trae uno marcado sin necesidad de un efecto que lo fije.
 */
function Offer({ state, busy, onRetry, onPurchase }: OfferProps) {
  const { t } = useTranslation();
  const [chosenId, setChosenId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <ThemedText type="small" themeColor="textMuted">
        {t('paywall.loadingPlans')}
      </ThemedText>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={styles.action}>
        <Notice tone="rival" message={state.message} />
        <Button label={t('paywall.tryAgain')} variant="secondary" onPress={onRetry} />
      </View>
    );
  }

  const packages = state.data?.packages ?? [];

  if (packages.length === 0) {
    return <Notice tone="info" message={t('paywall.unavailable')} />;
  }

  const baseline = baselinePackage(packages);
  const selected = packages.find((pkg) => pkg.id === chosenId) ?? recommendedPackage(packages);

  return (
    <>
      <View style={styles.plans}>
        {packages.map((pkg) => (
          <PlanOption
            key={pkg.id}
            name={pkg.name}
            price={priceLabel(pkg, t)}
            note={savingsLabel(pkg, baseline, t)}
            selected={pkg.id === selected?.id}
            onPress={() => setChosenId(pkg.id)}
          />
        ))}
      </View>

      <View style={styles.action}>
        <Button
          label={busy === 'purchase' ? t('paywall.purchasing') : t('paywall.subscribe')}
          disabled={busy !== null || !selected}
          onPress={() => selected && onPurchase(selected)}
        />
        <ThemedText type="caption" themeColor="textMuted" style={styles.centered}>
          {t('paywall.cancelAnytime')}
        </ThemedText>
      </View>
    </>
  );
}

/**
 * Lo que ve quien ya tiene la suscripción — o quien acaba de comprarla.
 *
 * `confirming` es el hueco entre el cobro y `profiles.is_pro`: la compra ya
 * está hecha pero el servidor todavía no la ha reconciliado. Se dice, en vez de
 * afirmar «ya eres Pro» sobre un flag que aún es `false` o, peor, devolver al
 * botón de comprar a alguien que acaba de pagar.
 */
function ProStatus({ confirming }: { confirming: boolean }) {
  const { t } = useTranslation();

  return (
    <View style={styles.action}>
      <Card variant="highlight" style={styles.pro}>
        <ThemedText type="bodyBold" themeColor="primary">
          {t('paywall.proTitle')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('paywall.proMessage')}
        </ThemedText>
      </Card>

      {confirming ? <Notice tone="info" message={t('paywall.proConfirming')} /> : null}

      <ThemedText type="caption" themeColor="textMuted" style={styles.centered}>
        {t('paywall.manageHint')}
      </ThemedText>
    </View>
  );
}

/** `$9.99/mo` el mensual, `$69.99/yr` el anual, `$99.99` a secas el vitalicio. */
function priceLabel(pkg: SubscriptionPackage, t: Translate): string {
  const { periodMonths } = pkg;

  if (periodMonths === null) return pkg.priceLabel;
  if (periodMonths === 1) return `${pkg.priceLabel}${t('paywall.perMonth')}`;
  if (periodMonths === 12) return `${pkg.priceLabel}${t('paywall.perYear')}`;

  return `${pkg.priceLabel}${t('paywall.perMonths', { count: periodMonths })}`;
}

/**
 * `Save 42% (only $5.83/mo)`, o nada para el plan de referencia.
 *
 * El porcentaje sale de los dos precios, no escrito a mano: así no puede acabar
 * prometiendo un descuento que las cifras de al lado desmienten. El equivalente
 * mensual lo da la store ya formateado; si no lo da, se enseña solo el
 * porcentaje.
 */
function savingsLabel(
  pkg: SubscriptionPackage,
  baseline: SubscriptionPackage | null,
  t: Translate,
): string | undefined {
  const percent = savingsPercent(pkg, baseline);
  if (percent === 0) return undefined;

  return pkg.monthlyPriceLabel
    ? t('paywall.savingsWithPrice', { percent, price: pkg.monthlyPriceLabel })
    : t('paywall.savings', { percent });
}

/** Una ventaja: punto Power y la frase. */
function Benefit({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <View style={styles.benefit}>
      <View style={[styles.bullet, { backgroundColor: theme.primary }]} />
      <ThemedText type="small">{label}</ThemedText>
    </View>
  );
}

/**
 * Letra pequeña del pie. Las tres entradas actúan, y las tres son exigencias
 * de tienda, no adornos: «Restore Purchases» tiene que estar a mano en la
 * pantalla de pago, y Apple no aprueba una suscripción cuyo paywall no enlace
 * a unos términos y a una política de privacidad que se puedan leer.
 */
function LegalLink({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <ThemedText type="link" themeColor="textDim" onPress={onPress}>
      {label}
    </ThemedText>
  );
}

/** Vuelve por donde se vino; si no hay historial, a la pantalla principal. */
function dismiss() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.home.href);
}

const BULLET_SIZE = 6;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  benefits: {
    gap: Spacing.three,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bullet: {
    width: BULLET_SIZE,
    height: BULLET_SIZE,
    borderRadius: Radius.pill,
  },
  centered: {
    textAlign: 'center',
  },
  plans: {
    gap: Spacing.two,
  },
  action: {
    gap: Spacing.two,
  },
  pro: {
    gap: Spacing.one,
  },
  legal: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
});
