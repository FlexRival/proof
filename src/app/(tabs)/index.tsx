import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Chip } from '@/components/atoms/chip';
import { MeterBar, type MeterTone } from '@/components/atoms/meter-bar';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { Notice } from '@/components/molecules/notice';
import { EmptyState } from '@/components/organisms/empty-state';
import { XpProgress } from '@/components/organisms/xp-progress';
import { ROUTES } from '@/constants/routes';
import { BottomTabInset, MaxContentWidth, Spacing, type ThemeColor } from '@/constants/theme';
import { useDuels } from '@/hooks/use-duels';
import { useProfile } from '@/hooks/use-profile';
import { useSteps, type StepsSummary } from '@/hooks/use-steps';
import { useTranslation } from '@/hooks/use-translation';
import { daysRemaining, mostUrgent } from '@/lib/duel';
import { formatCount } from '@/lib/format';
import { levelProgress } from '@/lib/xp';
import type { Duel } from '@/repositories';

/**
 * Pantalla principal: quién eres, tu nivel, los pasos de hoy y el duelo en
 * curso.
 *
 * **No hay ningún personaje RPG que represente al usuario** (se descartó a
 * propósito, junto con el sistema de cosméticos que lo dibujaba) — los
 * recuadros de personaje/avatar son huecos reservados, no un render real.
 *
 * Desde KAN-50 y KAN-32 aquí ya no queda nada inventado: la identidad sale de
 * `useProfile`, los pasos de `useSteps` (leídos del teléfono y confirmados por
 * el servidor) y el duelo de `useDuels`.
 *
 * El "RANK" de la captura no sale: era un sustituto de la clase de personaje
 * descartada, y no hay ningún concepto de rango individual en el esquema
 * (`clans.rank_points` es de clan, no de jugador) — enseñar uno inventado sería
 * tan de mentira como los pasos que había antes.
 *
 * Los pasos van en neutro, nunca en Power: el diseño insiste en que los pasos
 * son actividad, no un contador de XP en vivo.
 */
export default function HomeScreen() {
  const { state: profileState } = useProfile();
  const { state: stepsState, requestAccess } = useSteps();
  const { state: duelsState } = useDuels();
  const { t } = useTranslation();

  if (profileState.status !== 'ready') {
    // El guard de sesión de `_layout.tsx` ya garantiza que llegar aquí implica
    // sesión iniciada; esto solo cubre el instante de carga o un fallo real.
    return <ThemedView style={styles.screen} />;
  }

  const { username, xp } = profileState.data;
  const { level, xpIntoLevel, xpForNextLevel } = levelProgress(xp);

  const steps = stepsState.status === 'ready' ? stepsState.data : null;
  const duel = duelsState.status === 'ready' ? mostUrgent(duelsState.data.active) : null;

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

            <Chip label={t('common.levelShort', { level })} tone="primary" />
          </View>

          {duel ? (
            <>
              {/* Personaje (KAN-19): reserva el espacio del diseño. */}
              <Card style={styles.character} />

              <ThemedText type="heading" style={styles.level}>
                {t('common.level', { level })}
              </ThemedText>

              <XpProgress level={level} xpIntoLevel={xpIntoLevel} xpForNextLevel={xpForNextLevel} />

              <StepsCard steps={steps} onConnect={requestAccess} />

              <CurrentDuelCard duel={duel} username={username} />

              <Button
                label={t('home.challengeAFriend')}
                variant="secondary"
                onPress={() => router.push(ROUTES.newDuel.href)}
              />
            </>
          ) : (
            <NoDuelState steps={steps} onConnect={requestAccess} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Lo que hace falta para pedir el permiso de pasos desde una card. */
type ConnectFn = () => Promise<unknown>;

/**
 * Los pasos de hoy, con el permiso ya resuelto.
 *
 * Sin permiso **no se pinta un cero**: en iOS «no me dejas leer» y «no has
 * andado» devuelven lo mismo, y enseñar 0 haría que quien dijo que no creyera
 * que la app está rota (ver `docs/healthkit-y-health-connect.md`). Se enseña la
 * salida que corresponda a su caso.
 */
function StepsCard({ steps, onConnect }: { steps: StepsSummary | null; onConnect: ConnectFn }) {
  const { t } = useTranslation();

  if (steps && steps.today === null) {
    return <StepsAccessCard access={steps.access} onConnect={onConnect} />;
  }

  const today = steps?.today ?? 0;
  const goal = steps?.goal ?? 0;

  return (
    <Card style={styles.block}>
      <ThemedText type="label" themeColor="textDim">
        {t('home.todaysSteps')}
      </ThemedText>
      <ThemedText type="title" themeColor="steps">
        {steps ? formatCount(today) : '—'}
      </ThemedText>
      <ThemedText type="caption" themeColor="textMuted">
        {t('home.toGoal', {
          remaining: formatCount(Math.max(0, goal - today)),
          goal: formatCount(goal),
        })}
      </ThemedText>
      <MeterBar value={today} max={goal} tone="steps" />
    </Card>
  );
}

/**
 * El caso «todavía no puedo contar tus pasos», con la única salida que sirve en
 * cada situación: pedirle el permiso, mandarlo a Ajustes, o decirle que en este
 * aparato no se puede y no marearlo con un botón que no haría nada.
 *
 * Es la versión mínima de KAN-51, que sigue pendiente: aquí solo se cubre no
 * mentir sobre los pasos, no la pantalla de permisos entera.
 */
function StepsAccessCard({
  access,
  onConnect,
}: {
  access: StepsSummary['access'];
  onConnect: ConnectFn;
}) {
  const { t } = useTranslation();
  const canAsk =
    access.status === 'undetermined' || (access.status === 'denied' && access.canAskAgain);

  return (
    <Card style={styles.block}>
      <ThemedText type="label" themeColor="textDim">
        {t('home.stepsOff')}
      </ThemedText>

      {access.status === 'unavailable' ? (
        <Notice message={t('home.stepsUnavailable')} tone="rival" />
      ) : canAsk ? (
        <Button label={t('home.connectSteps')} onPress={() => void onConnect()} />
      ) : (
        <Notice message={t('home.stepsBlocked')} tone="rival" />
      )}
    </Card>
  );
}

/**
 * El duelo en curso más urgente. El botón lleva a la pestaña de Duelos, que es
 * donde está el detalle: no hay pantalla de un duelo suelto (KAN-28).
 */
function CurrentDuelCard({ duel, username }: { duel: Duel; username: string }) {
  const { t } = useTranslation();
  const days = daysRemaining(duel.endDate);
  // Las dos barras se miden contra quien va ganando, para que la del líder
  // salga llena y la diferencia se lea de un vistazo.
  const leader = Math.max(duel.yourSteps, duel.theirSteps);

  return (
    <Card variant="highlight" style={styles.block}>
      <View style={styles.spread}>
        <ThemedText type="label" themeColor="primary">
          {t('home.currentDuel')}
        </ThemedText>
        <ThemedText type="label" themeColor="textMuted">
          {days <= 0 ? t('duels.endsToday') : t('duels.endsInDays', { days })}
        </ThemedText>
      </View>

      <DuelSideRow name={username} steps={duel.yourSteps} tone="power" leader={leader} />
      <DuelSideRow
        name={duel.opponent.username}
        steps={duel.theirSteps}
        tone="rival"
        leader={leader}
      />

      <Button label={t('home.viewDuel')} onPress={() => router.push(ROUTES.duels.href)} />
    </Card>
  );
}

/**
 * Pantalla principal sin ningún duelo en curso.
 *
 * Cae el progreso de XP y la card del duelo, y los pasos pasan a una card
 * compacta que explica para qué sirven: sin duelo no se gana XP, así que
 * enseñar la barra de XP aquí sería enseñar algo que no se mueve.
 */
function NoDuelState({ steps, onConnect }: { steps: StepsSummary | null; onConnect: ConnectFn }) {
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
      {steps && steps.today === null ? (
        <StepsAccessCard access={steps.access} onConnect={onConnect} />
      ) : (
        <Card style={styles.idleSteps}>
          <View style={styles.idleStepsBody}>
            <ThemedText type="label" themeColor="textDim">
              {t('home.todaysSteps')}
            </ThemedText>
            <ThemedText type="title" themeColor="steps">
              {steps ? formatCount(steps.today ?? 0) : '—'}
            </ThemedText>
          </View>

          <ThemedText type="caption" themeColor="textMuted" style={styles.idleStepsNote}>
            {t('home.stepsIntoXp')}
          </ThemedText>
        </Card>
      )}
    </>
  );
}

/** Color de la cifra de cada lado del duelo. El tuyo en Power, el rival en Rival. */
const SIDE_COUNT_COLOR: Record<Extract<MeterTone, 'power' | 'rival'>, ThemeColor> = {
  power: 'primary',
  rival: 'defeat',
};

type DuelSideRowProps = {
  name: string;
  steps: number;
  tone: Extract<MeterTone, 'power' | 'rival'>;
  /** Pasos de quien va ganando: el denominador de las dos barras. */
  leader: number;
};

function DuelSideRow({ name, steps, tone, leader }: DuelSideRowProps) {
  return (
    <View style={styles.duelRow}>
      {/* Avatar (KAN-19). */}
      <Card style={styles.duelAvatar} />

      <View style={styles.duelBody}>
        <View style={styles.spread}>
          <ThemedText type="smallBold">{name}</ThemedText>
          <ThemedText type="numeric" themeColor={SIDE_COUNT_COLOR[tone]}>
            {formatCount(steps)}
          </ThemedText>
        </View>
        <MeterBar value={steps} max={leader} tone={tone} />
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
    // Sin duelo el personaje manda en la pantalla: en el diseño es más alto que
    // ancho y ocupa más que el de la pantalla con duelo.
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
