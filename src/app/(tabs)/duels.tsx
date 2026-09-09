import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { MeterBar } from '@/components/atoms/meter-bar';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { FrameOverlay } from '@/components/molecules/frame-overlay';
import { Notice } from '@/components/molecules/notice';
import { ProfilePhoto } from '@/components/molecules/profile-photo';
import { SegmentedControl, type SegmentedOption } from '@/components/molecules/segmented-control';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useDuels } from '@/hooks/use-duels';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import { daysRemaining, durationInDays, mostUrgent, standingOf, stepGap } from '@/lib/duel';
import { formatCount } from '@/lib/format';
import { frameById, type FrameMeta } from '@/lib/frames';
import type { Duel, Duels } from '@/repositories';

/**
 * Duelos, con sus tres filtros: activos, pendientes e historial.
 *
 * Datos reales desde KAN-32 (`useDuels` → `duelRepository`). Cada vez que se
 * carga, el repositorio resincroniza el marcador de los activos contra
 * `step_logs` y el hook cierra los que ya vencieron, así que lo que se ve aquí
 * es el estado del servidor y no el de la última vez que alguien abrió la app.
 */
type DuelFilter = 'active' | 'pending' | 'history';

/** La función de traducir, para las ayudantes que viven fuera del componente. */
type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * Los tres filtros. Función y no constante de módulo porque su texto cambia con
 * el idioma: una constante se congelaría en el idioma que hubiera cuando se
 * cargó el archivo.
 */
function filterOptions(t: Translate): SegmentedOption<DuelFilter>[] {
  return [
    { value: 'active', label: t('duels.filterActive') },
    { value: 'pending', label: t('duels.filterPending') },
    { value: 'history', label: t('duels.filterHistory') },
  ];
}

/**
 * Cuánto le queda al duelo. Un duelo vencido que todavía figura activo está
 * esperando a que `resolve_duel` lo cierre —lo hace el hook al cargar, o el
 * cron horario—, así que se rotula «cerrando» en vez de con un número negativo.
 */
function countdownLabel(duel: Duel, t: Translate): string {
  const days = daysRemaining(duel.endDate);

  if (days < 0) return t('duels.closing');
  if (days === 0) return t('duels.endsToday');

  return t('duels.endsInDays', { days });
}

export default function DuelsScreen() {
  const [filter, setFilter] = useState<DuelFilter>('active');
  const { t } = useTranslation();
  const { state, respond } = useDuels();
  const { state: profileState } = useProfile();
  const avatarUrl = profileState.status === 'ready' ? profileState.data.avatarUrl : null;
  const frame = profileState.status === 'ready' ? frameById(profileState.data.equippedFrameId) : null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <ThemedText type="title">{t('duels.title')}</ThemedText>
            <ThemedText themeColor="textMuted">{t('duels.subtitle')}</ThemedText>
          </View>

          <SegmentedControl options={filterOptions(t)} value={filter} onChange={setFilter} />

          {state.status === 'loading' ? <Placeholder message={t('duels.loading')} /> : null}
          {state.status === 'signedOut' ? <Placeholder message={t('duels.signedOut')} /> : null}
          {state.status === 'error' ? <Notice message={state.message} tone="rival" /> : null}

          {state.status === 'ready' ? (
            <DuelLists
              filter={filter}
              duels={state.data}
              onRespond={respond}
              avatarUrl={avatarUrl}
              frame={frame}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Placeholder({ message }: { message: string }) {
  return (
    <ThemedText type="small" themeColor="textDim" style={styles.empty}>
      {message}
    </ThemedText>
  );
}

type RespondFn = (duelId: string, accept: boolean) => Promise<void>;

function DuelLists({
  filter,
  duels,
  onRespond,
  avatarUrl,
  frame,
}: {
  filter: DuelFilter;
  duels: Duels;
  onRespond: RespondFn;
  avatarUrl: string | null;
  frame: FrameMeta | null;
}) {
  return (
    <>
      {filter === 'active' ? (
        <ActiveDuels duels={duels.active} avatarUrl={avatarUrl} frame={frame} />
      ) : null}
      {filter === 'pending' ? (
        <PendingDuels incoming={duels.incoming} outgoing={duels.outgoing} onRespond={onRespond} />
      ) : null}
      {filter === 'history' ? <FinishedDuels duels={duels.finished} /> : null}
    </>
  );
}

function ActiveDuels({
  duels,
  avatarUrl,
  frame,
}: {
  duels: Duel[];
  avatarUrl: string | null;
  frame: FrameMeta | null;
}) {
  const { t } = useTranslation();
  const featured = mostUrgent(duels);

  if (!featured) {
    return <Placeholder message={t('duels.noActive')} />;
  }

  return (
    <>
      <FeaturedDuelCard duel={featured} avatarUrl={avatarUrl} frame={frame} />

      {duels
        .filter((duel) => duel.id !== featured.id)
        .map((duel) => (
          <DuelRow key={duel.id} duel={duel} />
        ))}
    </>
  );
}

/** Rótulo de estado del duelo destacado. */
const STANDING_NOTICE = { leading: 'duels.leading', behind: 'duels.behind', tied: 'duels.tied' } as const;

/**
 * El duelo que está más cerca de acabar, en grande.
 *
 * El diseño traía aquí un botón «ver duelo», pero no hay pantalla de detalle a
 * la que ir (KAN-28 sigue sin wireframes) y esta card ya enseña todo lo que
 * tendría esa pantalla: marcador, diferencia y cuánto queda. Un botón que no
 * lleva a ningún sitio se lee como un fallo, así que no se pinta hasta que
 * exista el destino.
 */
function FeaturedDuelCard({
  duel,
  avatarUrl,
  frame,
}: {
  duel: Duel;
  avatarUrl: string | null;
  frame: FrameMeta | null;
}) {
  const { t } = useTranslation();
  const standing = standingOf(duel);

  return (
    <Card variant="highlight" style={styles.block}>
      <View style={styles.spread}>
        <Notice
          message={t(STANDING_NOTICE[standing])}
          tone={standing === 'behind' ? 'rival' : 'primary'}
          style={styles.status}
        />
        <ThemedText type="label" themeColor="textMuted">
          {countdownLabel(duel, t)}
        </ThemedText>
      </View>

      <View style={styles.versusRow}>
        {/* Las dos caras del duelo: tu foto (con su marco) y la del rival. */}
        <FrameOverlay frame={frame} avatarUrl={avatarUrl} style={styles.versusCharacter} />
        <ThemedText type="smallBold" themeColor="textMuted">
          {t('duels.versus')}
        </ThemedText>
        <ProfilePhoto
          avatarUrl={duel.opponent.avatarUrl}
          style={styles.versusCharacter}
          fallbackVariant="rival"
        />
      </View>

      <View style={styles.spread}>
        <SideCount label={t('duels.steps')} value={duel.yourSteps} color="primary" />
        <SideCount label={t('duels.steps')} value={duel.theirSteps} color="defeat" align="right" />
      </View>

      <VersusBar yourSteps={duel.yourSteps} theirSteps={duel.theirSteps} />

      <ThemedText type="caption" themeColor="textMuted">
        {t('duels.vsOpponent', { opponent: duel.opponent.username })}
      </ThemedText>
    </Card>
  );
}

/**
 * La barra partida del duelo destacado: cada lado ocupa lo que le corresponde
 * por pasos, así que quién va ganando se lee sin comparar cifras.
 */
function VersusBar({ yourSteps, theirSteps }: { yourSteps: number; theirSteps: number }) {
  const theme = useTheme();
  // Un 0–0 dejaría los dos `flex` a cero y la barra vacía; se reparte a medias.
  const empty = yourSteps === 0 && theirSteps === 0;

  return (
    <View style={styles.versusBar}>
      <View
        style={[styles.versusFill, { flex: empty ? 1 : yourSteps, backgroundColor: theme.primary }]}
      />
      <View
        style={[styles.versusFill, { flex: empty ? 1 : theirSteps, backgroundColor: theme.defeat }]}
      />
    </View>
  );
}

type SideCountProps = {
  label: string;
  value: number;
  color: 'primary' | 'defeat';
  align?: 'left' | 'right';
};

function SideCount({ label, value, color, align = 'left' }: SideCountProps) {
  const textAlign = align === 'right' ? ('right' as const) : ('left' as const);

  return (
    <View>
      <ThemedText type="subtitle" themeColor={color} style={{ textAlign }}>
        {formatCount(value)}
      </ThemedText>
      <ThemedText type="label" themeColor="textDim" style={{ textAlign }}>
        {label}
      </ThemedText>
    </View>
  );
}

function DuelRow({ duel }: { duel: Duel }) {
  const { t } = useTranslation();
  const standing = standingOf(duel);
  const ahead = standing !== 'behind';

  return (
    <Card style={styles.row}>
      {/* Foto del rival; el hueco se tiñe de Rival si vas por detrás. */}
      <ProfilePhoto
        avatarUrl={duel.opponent.avatarUrl}
        style={styles.rowAvatar}
        fallbackVariant={ahead ? 'default' : 'rival'}
      />

      <View style={styles.rowBody}>
        <View style={styles.spread}>
          <ThemedText type="bodyBold">
            {t('duels.vsOpponent', { opponent: duel.opponent.username })}
          </ThemedText>
          <ThemedText type="smallBold" themeColor={ahead ? 'primary' : 'defeat'}>
            {standing === 'tied'
              ? t('duels.tied')
              : t(standing === 'leading' ? 'duels.ahead' : 'duels.behindBy', {
                  gap: formatCount(stepGap(duel)),
                })}
          </ThemedText>
        </View>

        <MeterBar
          value={duel.yourSteps}
          max={Math.max(duel.yourSteps, duel.theirSteps)}
          tone={ahead ? 'power' : 'muted'}
        />

        <ThemedText type="caption" themeColor="textMuted">
          {`${formatCount(duel.yourSteps)} · ${formatCount(duel.theirSteps)} · ${countdownLabel(duel, t)}`}
        </ThemedText>
      </View>
    </Card>
  );
}

function PendingDuels({
  incoming,
  outgoing,
  onRespond,
}: {
  incoming: Duel[];
  outgoing: Duel[];
  onRespond: RespondFn;
}) {
  const { t } = useTranslation();

  if (incoming.length === 0 && outgoing.length === 0) {
    return <Placeholder message={t('duels.noPending')} />;
  }

  return (
    <>
      {incoming.length > 0 ? (
        <>
          <ThemedText type="label" themeColor="textDim">
            {t('duels.incoming')}
          </ThemedText>
          {incoming.map((duel) => (
            <IncomingRow key={duel.id} duel={duel} onRespond={onRespond} />
          ))}
        </>
      ) : null}

      {outgoing.length > 0 ? (
        <>
          <ThemedText type="label" themeColor="textDim">
            {t('duels.outgoing')}
          </ThemedText>
          {outgoing.map((duel) => (
            <OutgoingRow key={duel.id} duel={duel} />
          ))}
        </>
      ) : null}
    </>
  );
}

/**
 * Un reto recibido, con sus dos botones.
 *
 * El error se guarda por fila y no en la pantalla entera: si falla aceptar un
 * duelo, el mensaje tiene que salir junto al duelo que falló y no arriba del
 * todo, donde no se sabría a cuál se refiere.
 */
function IncomingRow({ duel, onRespond }: { duel: Duel; onRespond: RespondFn }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function answer(accept: boolean) {
    setBusy(true);
    setFailed(false);

    try {
      await onRespond(duel.id, accept);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={styles.pendingRow}>
      <PendingHead duel={duel} note={t('duels.challengedYou', { days: durationInDays(duel) })} />

      {failed ? <Notice message={t('duels.respondFailed')} tone="rival" /> : null}

      <View style={styles.actions}>
        <Button
          label={t('duels.accept')}
          disabled={busy}
          style={styles.action}
          onPress={() => void answer(true)}
        />
        <Button
          label={t('duels.decline')}
          variant="secondary"
          disabled={busy}
          style={styles.action}
          onPress={() => void answer(false)}
        />
      </View>
    </Card>
  );
}

/**
 * Un reto que mandaste tú. No lleva acciones: el esquema no tiene ninguna RPC
 * para retirar un duelo pendiente (`supabase/SCHEMA.md` §6), así que solo queda
 * esperar a que el otro conteste.
 */
function OutgoingRow({ duel }: { duel: Duel }) {
  const { t } = useTranslation();

  return (
    <Card style={styles.pendingRow}>
      <PendingHead
        duel={duel}
        note={t('duels.youChallenged', { days: durationInDays(duel) })}
        badge={t('duels.pending')}
      />
    </Card>
  );
}

function PendingHead({ duel, note, badge }: { duel: Duel; note: string; badge?: string }) {
  const { t } = useTranslation();

  return (
    <View style={styles.rowHead}>
      {/* Foto de quien tienes el duelo pendiente. */}
      <ProfilePhoto avatarUrl={duel.opponent.avatarUrl} style={styles.rowAvatar} />

      <View style={styles.rowBody}>
        <ThemedText type="bodyBold">
          {`${duel.opponent.username} · ${t('common.levelShort', { level: duel.opponent.level })}`}
        </ThemedText>
        <ThemedText type="caption" themeColor="textMuted">
          {note}
        </ThemedText>
      </View>

      {badge ? (
        <ThemedText type="label" themeColor="textDim">
          {badge}
        </ThemedText>
      ) : null}
    </View>
  );
}

function FinishedDuels({ duels }: { duels: Duel[] }) {
  const { t } = useTranslation();

  if (duels.length === 0) {
    return <Placeholder message={t('duels.noFinished')} />;
  }

  return (
    <>
      {duels.map((duel) => (
        <FinishedRow key={duel.id} duel={duel} />
      ))}
    </>
  );
}

const OUTCOME_LABEL = { win: 'duels.won', loss: 'duels.lost', draw: 'duels.drew' } as const;
const OUTCOME_COLOR = { win: 'victory', loss: 'defeat', draw: 'textMuted' } as const;

function FinishedRow({ duel }: { duel: Duel }) {
  const { t } = useTranslation();
  // Un duelo terminado siempre trae `outcome`; el `??` es solo para no tener
  // que afirmarlo con un `!` que el compilador no puede comprobar.
  const outcome = duel.outcome ?? 'draw';

  return (
    <Card style={styles.pendingRow}>
      <View style={styles.rowHead}>
        {/* Foto del rival de este duelo ya cerrado. */}
        <ProfilePhoto avatarUrl={duel.opponent.avatarUrl} style={styles.rowAvatar} />

        <View style={styles.rowBody}>
          <ThemedText type="bodyBold">
            {t('duels.vsOpponent', { opponent: duel.opponent.username })}
          </ThemedText>
          <ThemedText type="caption" themeColor="textMuted">
            {`${formatCount(duel.yourSteps)} · ${formatCount(duel.theirSteps)}`}
          </ThemedText>
        </View>

        <ThemedText type="smallBold" themeColor={OUTCOME_COLOR[outcome]}>
          {t(OUTCOME_LABEL[outcome])}
        </ThemedText>
      </View>

      <Button
        label={t('duels.viewResult')}
        variant="secondary"
        onPress={() => router.push({ pathname: '/duel-result', params: { duel: duel.id } })}
      />
    </Card>
  );
}

const AVATAR_SIZE = 44;
const VERSUS_BAR_HEIGHT = 6;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    paddingBottom: Spacing.three + BottomTabInset,
    gap: Spacing.three,
  },
  intro: { gap: Spacing.one },
  block: { gap: Spacing.three },
  status: { flex: 1 },
  spread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  versusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  // El `borderRadius` lo traía `Card`; la foto lo necesita explícito para
  // recortarse con la misma forma que el hueco al que sustituye. Cuadrado
  // (`aspectRatio: 1`): la foto de perfil siempre lo es, y una caja más
  // estrecha obligaba a `cover` a recortarle los lados.
  versusCharacter: { flex: 1, aspectRatio: 1, borderRadius: Radius.lg },
  versusBar: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  versusFill: {
    height: VERSUS_BAR_HEIGHT,
    borderRadius: Radius.pill,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  // El `borderRadius` lo traía `Card`; la foto lo necesita explícito para
  // recortarse con la misma forma que el hueco al que sustituye.
  rowAvatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, padding: 0, borderRadius: Radius.lg },
  rowBody: { flex: 1, gap: Spacing.two },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pendingRow: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: { flex: 1 },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
});
