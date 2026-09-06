import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Chip } from '@/components/atoms/chip';
import { EmptyState } from '@/components/organisms/empty-state';
import { MeterBar, type MeterTone } from '@/components/atoms/meter-bar';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { XpProgress } from '@/components/organisms/xp-progress';
import { ROUTES } from '@/constants/routes';
import { BottomTabInset, MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTranslation } from '@/hooks/use-translation';
import { formatCount } from '@/lib/format';
import { HOME_DEMO, type DuelSide } from '@/lib/demo-data';
import { levelProgress } from '@/lib/xp';

/**
 * Pantalla principal: quién eres, tu nivel, los pasos de hoy y el duelo en
 * curso.
 *
 * **No hay ningún personaje RPG que represente al usuario** (se descartó a
 * propósito, junto con el sistema de cosméticos que lo dibujaba) — los
 * recuadros de personaje/avatar son huecos reservados, no un render real.
 *
 * Identidad (username, nivel, XP) es **dato real de la sesión**
 * (`useProfile`). Pasos y duelo **siguen en `HOME_DEMO`**: no hay repositorio
 * de pasos ni de duelos todavía — ese archivo documenta a qué repositorio se
 * conectará cada campo cuando exista.
 *
 * El "RANK" de la captura no sale: era un sustituto de la clase de personaje
 * descartada, y no hay ningún concepto de rango individual en el esquema
 * (`clans.rank_points` es de clan, no de jugador) — enseñar uno inventado
 * sería tan de mentira como el dato que sustituyó.
 *
 * Los pasos van en neutro, nunca en Power: el diseño insiste en que los pasos
 * son actividad, no un contador de XP en vivo.
 */
export default function HomeScreen() {
  const { state: profileState } = useProfile();
  const { t } = useTranslation();

  const { steps, stepGoal, duel } = HOME_DEMO;

  const stepsToGoal = Math.max(0, stepGoal - steps);
  // Las dos barras del duelo se miden contra quien va ganando, para que la del
  // líder salga llena y la diferencia se lea de un vistazo.
  const duelLeader = duel ? Math.max(duel.you.steps, duel.rival.steps) : 0;

  if (profileState.status !== 'ready') {
    // El guard de sesión de `_layout.tsx` ya garantiza que llegar aquí implica
    // sesión iniciada; esto solo cubre el instante de carga o un fallo real.
    return <ThemedView style={styles.screen} />;
  }

  const { username, xp } = profileState.data;
  const { level, xpIntoLevel, xpForNextLevel } = levelProgress(xp);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            {/* Avatar (KAN-19). */}
            <Card style={styles.avatar} />

            <View style={styles.identity}>
              <ThemedText type="bodyBold">{username}</ThemedText>
            </View>

            <Chip label={`LV ${level}`} tone="primary" />
          </View>

          {duel ? (
            <>
              {/* Personaje (KAN-19): reserva el espacio del diseño. */}
              <Card style={styles.character} />

              <ThemedText type="heading" style={styles.level}>{t('common.level', { level })}</ThemedText>

              <XpProgress
                level={level}
                xpIntoLevel={xpIntoLevel}
                xpForNextLevel={xpForNextLevel}
              />

              <Card style={styles.block}>
                <ThemedText type="label" themeColor="textDim">
                  {t('home.todaysSteps')}
                </ThemedText>
                <ThemedText type="title" themeColor="steps">
                  {formatCount(steps)}
                </ThemedText>
                <ThemedText type="caption" themeColor="textMuted">
                  {t('home.toGoal', {
                    remaining: formatCount(stepsToGoal),
                    goal: formatCount(stepGoal),
                  })}
                </ThemedText>
                <MeterBar value={steps} max={stepGoal} tone="steps" />
              </Card>

              <Card variant="highlight" style={styles.block}>
                <View style={styles.spread}>
                  <ThemedText type="label" themeColor="primary">
                    {t('home.currentDuel')}
                  </ThemedText>
                  <ThemedText type="label" themeColor="textMuted">
                    {duel.endsIn}
                  </ThemedText>
                </View>

                <DuelSideRow side={duel.you} tone="power" leader={duelLeader} />
                <DuelSideRow side={duel.rival} tone="rival" leader={duelLeader} />

                <Button label={t('home.viewDuel')} />
              </Card>

              <Button
                label={t('home.challengeAFriend')}
                variant="secondary"
                onPress={() => router.push(ROUTES.newDuel.href)}
              />
            </>
          ) : (
            <NoDuelState steps={steps} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Pantalla principal sin ningún duelo en curso.
 *
 * Cae el progreso de XP y la card del duelo, y los pasos pasan a una card
 * compacta que explica para qué sirven: sin duelo no se gana XP, así que
 * enseñar la barra de XP aquí sería enseñar algo que no se mueve.
 */
function NoDuelState({ steps }: { steps: number }) {
  const { t } = useTranslation();

  return (
    <>
      <EmptyState
        title={t('home.emptyTitle')}
        message={t('home.emptyMessage')}
        actionLabel={t('home.challengeAFriend')}
        onAction={() => router.push(ROUTES.newDuel.href)}>
        {/* Personaje inactivo (KAN-19): reserva el espacio del diseño. */}
        <Card variant="sunken" style={styles.idleCharacter} />
      </EmptyState>

      {/*
        Los pasos siguen contando sin duelo, pero no valen XP. La card lo dice
        en vez de callarlo: si no, el contador parece roto.
      */}
      <Card style={styles.idleSteps}>
        <View style={styles.idleStepsBody}>
          <ThemedText type="label" themeColor="textDim">
            {t('home.todaysSteps')}
          </ThemedText>
          <ThemedText type="title" themeColor="steps">
            {formatCount(steps)}
          </ThemedText>
        </View>

        <ThemedText type="caption" themeColor="textMuted" style={styles.idleStepsNote}>
          {t('home.stepsIntoXp')}
        </ThemedText>
      </Card>
    </>
  );
}

/** Color de la cifra de cada lado del duelo. El tuyo en Power, el rival en Rival. */
const SIDE_COUNT_COLOR: Record<Extract<MeterTone, 'power' | 'rival'>, ThemeColor> = {
  power: 'primary',
  rival: 'defeat',
};

type DuelSideRowProps = {
  side: DuelSide;
  tone: Extract<MeterTone, 'power' | 'rival'>;
  /** Pasos de quien va ganando: el denominador de las dos barras. */
  leader: number;
};

function DuelSideRow({ side, tone, leader }: DuelSideRowProps) {
  return (
    <View style={styles.duelRow}>
      {/* Avatar (KAN-19). */}
      <Card style={styles.duelAvatar} />

      <View style={styles.duelBody}>
        <View style={styles.spread}>
          <ThemedText type="smallBold">{side.name}</ThemedText>
          <ThemedText type="numeric" themeColor={SIDE_COUNT_COLOR[tone]}>
            {formatCount(side.steps)}
          </ThemedText>
        </View>
        <MeterBar value={side.steps} max={leader} tone={tone} />
      </View>
    </View>
  );
}

const AVATAR_SIZE = 44;
const DUEL_AVATAR_SIZE = 36;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    // La barra de pestañas flota sobre el contenido, así que el último botón
    // quedaría debajo de ella sin este hueco.
    paddingBottom: Spacing.three + BottomTabInset,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    padding: 0,
  },
  identity: {
    flex: 1,
    gap: Spacing.one,
  },
  character: {
    // Medido en el diseño: el recuadro del personaje ocupa la mitad del ancho
    // del contenido y va centrado, no a sangre.
    width: '50%',
    alignSelf: 'center',
    aspectRatio: 1,
  },
  idleCharacter: {
    // Sin duelo el personaje manda en la pantalla: en el diseño es más alto
    // que ancho y ocupa más que el de la pantalla con duelo.
    width: '60%',
    alignSelf: 'center',
    aspectRatio: 0.82,
  },
  idleSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  idleStepsBody: { gap: Spacing.one },
  idleStepsNote: {
    flexShrink: 1,
    textAlign: 'right',
  },
  level: {
    textAlign: 'center',
  },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  block: {
    gap: Spacing.two,
  },
  duelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  duelAvatar: {
    width: DUEL_AVATAR_SIZE,
    height: DUEL_AVATAR_SIZE,
    padding: 0,
  },
  duelBody: {
    flex: 1,
    gap: Spacing.two,
  },
});
