import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { LevelUpBadge } from '@/components/molecules/level-up-badge';
import { Notice } from '@/components/molecules/notice';
import { XpBar } from '@/components/molecules/xp-bar';
import { DuelShareCard } from '@/components/organisms/duel-share-card';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { useDuel } from '@/hooks/use-duels';
import { useProfile } from '@/hooks/use-profile';
import { useShareCard } from '@/hooks/use-share-card';
import { useTranslation } from '@/hooks/use-translation';
import { duelResultFor } from '@/lib/duel-result';
import { formatCount } from '@/lib/format';
import { XP_PER_LEVEL } from '@/lib/xp';
import type { DuelOutcome } from '@/repositories';

/**
 * Cómo acabó un duelo: victoria, derrota o empate (KAN-31).
 *
 * Se abre con el id del duelo (`/duel-result?duel=<uuid>`) y lo **carga del
 * servidor**. Antes esto era `/victory` y recibía el resultado en la URL,
 * porque no existía ningún duelo de verdad que consultar; desde KAN-32 sí
 * existe, y un parámetro se puede quedar viejo o falsear mientras que
 * `resolve_duel` es la única autoridad sobre quién ganó y cuánto XP repartió.
 *
 * La derrota no es una pantalla más triste: es la misma, con el marcador
 * girado. Esconderla dejaría al perdedor sin lo único que le dice por cuánto
 * perdió, que es justo lo que le hace pedir la revancha.
 */
export default function DuelResultScreen() {
  const { duel: duelId } = useLocalSearchParams<{ duel?: string }>();
  const { state: duelState } = useDuel(duelId);
  const { state: profileState } = useProfile();
  const { t } = useTranslation();
  const { cardRef, status: shareStatus, share } = useShareCard();

  if (duelState.status === 'loading' || profileState.status === 'loading') {
    return <ThemedView style={styles.screen} />;
  }

  const duel = duelState.status === 'ready' ? duelState.data : null;
  const profile = profileState.status === 'ready' ? profileState.data : null;

  // Un enlace a un duelo que no existe, que no es tuyo o que sigue en marcha no
  // tiene resultado que enseñar. El diseño no define un estado de error aquí,
  // así que se sale a la principal, igual que hacía la pantalla anterior.
  const result = duel && profile ? duelResultFor(duel, profile.xp) : null;

  if (!result || !profile) {
    return <Redirect href={ROUTES.home.href} />;
  }

  const { outcome, xpEarned, levelUp } = result;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.headline}>
            <ThemedText type="label" themeColor={HEADLINE_COLOR[outcome]}>
              {t(`duelResult.eyebrow.${outcome}`)}
            </ThemedText>
            <ThemedText type="title">{t(`duelResult.headline.${outcome}`)}</ThemedText>
          </View>

          {/*
            La lámina compartible hace de protagonista de la pantalla, en el
            hueco donde el diseño reservaba el personaje (KAN-19). No es
            decoración: es exactamente el PNG que sale al pulsar «compartir».
          */}
          <DuelShareCard ref={cardRef} result={result} username={profile.username} />

          <View style={styles.stats}>
            <ResultTile
              label={t('duelResult.finalSteps')}
              value={formatCount(result.duel.yourSteps)}
              valueColor="steps"
            />
            <ResultTile
              label={t('duelResult.xpEarned')}
              value={xpEarned > 0 ? `+${formatCount(xpEarned)}` : '0'}
              valueColor="xp"
              highlight={xpEarned > 0}
            />
          </View>

          {levelUp ? (
            <Card variant="highlight" style={styles.levelUp}>
              <ThemedText type="label" themeColor="primary">
                {t('duelResult.levelUp')}
              </ThemedText>
              <LevelUpBadge fromLevel={levelUp.fromLevel} toLevel={levelUp.toLevel} />
              <XpBar value={XP_PER_LEVEL} max={XP_PER_LEVEL} label={null} revealOnMount />
            </Card>
          ) : null}

          {shareStatus === 'unavailable' || shareStatus === 'failed' ? (
            <Notice message={t(`duelResult.${shareStatus}`)} tone="rival" />
          ) : null}

          <View style={styles.actions}>
            <Button
              label={t(shareStatus === 'sharing' ? 'duelResult.sharing' : 'duelResult.share')}
              disabled={shareStatus === 'sharing' || shareStatus === 'unavailable'}
              onPress={() => void share()}
            />
            <Button label={t('duelResult.continue')} variant="ghost" onPress={dismiss} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const HEADLINE_COLOR: Record<DuelOutcome, ThemeColor> = {
  win: 'victory',
  loss: 'defeat',
  draw: 'textMuted',
};

/** Vuelve por donde se vino; si no hay historial, a la pantalla principal. */
function dismiss() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.home.href);
}

type ResultTileProps = {
  label: string;
  value: string;
  valueColor?: ThemeColor;
  /** La card de XP va con contorno Power solo si de verdad se ganó algo. */
  highlight?: boolean;
};

function ResultTile({ label, value, valueColor, highlight = false }: ResultTileProps) {
  return (
    <Card variant={highlight ? 'highlight' : 'sunken'} style={styles.tile}>
      <ThemedText type="label" themeColor="textDim">
        {label}
      </ThemedText>
      <ThemedText type="subtitle" themeColor={valueColor}>
        {value}
      </ThemedText>
    </Card>
  );
}

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
  headline: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    gap: Spacing.one,
  },
  levelUp: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  actions: {
    gap: Spacing.two,
  },
});
