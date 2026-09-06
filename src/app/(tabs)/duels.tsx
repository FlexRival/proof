import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { MeterBar } from '@/components/atoms/meter-bar';
import { Notice } from '@/components/molecules/notice';
import { SegmentedControl, type SegmentedOption } from '@/components/molecules/segmented-control';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import {
  ACTIVE_DUELS,
  FEATURED_DUEL,
  INCOMING_DUELS,
  OUTGOING_DUELS,
  type ActiveDuel,
  type PendingDuel,
} from '@/lib/demo-data';
import { formatCount } from '@/lib/format';

/**
 * Duelos, con sus tres filtros: activos, pendientes y enviados.
 *
 * **Sin datos todavía**, y a propósito: falta un `duel-repository.ts` que
 * envuelva las RPC `respond_to_duel` y compañía, así que `ACTIVE_DUELS` /
 * `INCOMING_DUELS` / `OUTGOING_DUELS` van vacíos en vez de con duelos
 * inventados — cada pestaña cae en su estado vacío real.
 *
 * `HISTORY` no tiene captura, así que va con un vacío sobrio en vez de con un
 * diseño inventado.
 */
type DuelFilter = 'active' | 'pending' | 'history';

/** La función de traducir, para las ayudantes que viven fuera del componente. */
type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * Los tres filtros. Función y no constante de módulo porque su texto cambia
 * con el idioma: una constante se congelaría en el idioma que hubiera cuando
 * se cargó el archivo.
 */
function filterOptions(t: Translate): SegmentedOption<DuelFilter>[] {
  return [
    { value: 'active', label: t('duels.filterActive') },
    { value: 'pending', label: t('duels.filterPending') },
    { value: 'history', label: t('duels.filterHistory') },
  ];
}

export default function DuelsScreen() {
  const [filter, setFilter] = useState<DuelFilter>('active');
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.intro}>
            <ThemedText type="title">{t('duels.title')}</ThemedText>
            <ThemedText themeColor="textMuted">{t('duels.subtitle')}</ThemedText>
          </View>

          <SegmentedControl options={filterOptions(t)} value={filter} onChange={setFilter} />

          {filter === 'active' ? <ActiveDuels /> : null}
          {filter === 'pending' ? <PendingDuels /> : null}
          {filter === 'history' ? (
            <ThemedText type="small" themeColor="textDim" style={styles.empty}>
              {t('duels.noFinished')}
            </ThemedText>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function ActiveDuels() {
  const { t } = useTranslation();

  if (!FEATURED_DUEL && ACTIVE_DUELS.length === 0) {
    return (
      <ThemedText type="small" themeColor="textDim" style={styles.empty}>
        {t('duels.noActive')}
      </ThemedText>
    );
  }

  return (
    <>
      {FEATURED_DUEL ? <FeaturedDuelCard duel={FEATURED_DUEL} /> : null}

      {ACTIVE_DUELS.map((duel) => (
        <DuelRow key={duel.opponent} duel={duel} />
      ))}
    </>
  );
}

function FeaturedDuelCard({ duel }: { duel: ActiveDuel }) {
  const { t } = useTranslation();
  const { opponent, yourSteps, theirSteps, endsIn } = duel;
  const leading = yourSteps >= theirSteps;

  return (
    <Card variant="highlight" style={styles.block}>
      <View style={styles.spread}>
        <Notice
          message={t(leading ? 'duels.leading' : 'duels.behind')}
          tone={leading ? 'primary' : 'rival'}
          style={styles.status}
        />
        <ThemedText type="label" themeColor="textMuted">
          {endsIn}
        </ThemedText>
      </View>

      <View style={styles.versusRow}>
        {/* Personajes (KAN-19): reservan el espacio del diseño. */}
        <Card style={styles.versusCharacter} />
        <ThemedText type="smallBold" themeColor="textMuted">
          {t('duels.versus')}
        </ThemedText>
        <Card variant="rival" style={styles.versusCharacter} />
      </View>

      <View style={styles.spread}>
        <SideCount label={t('duels.steps')} value={yourSteps} color="primary" />
        <SideCount label={t('duels.steps')} value={theirSteps} color="defeat" align="right" />
      </View>

      <VersusBar yourSteps={yourSteps} theirSteps={theirSteps} />

      <Button label={t('duels.viewDuelVs', { opponent })} />
    </Card>
  );
}

/**
 * La barra partida del duelo destacado: cada lado ocupa lo que le corresponde
 * por pasos, así que quién va ganando se lee sin comparar cifras.
 */
function VersusBar({ yourSteps, theirSteps }: { yourSteps: number; theirSteps: number }) {
  const theme = useTheme();

  return (
    <View style={styles.versusBar}>
      <View style={[styles.versusFill, { flex: yourSteps, backgroundColor: theme.primary }]} />
      <View style={[styles.versusFill, { flex: theirSteps, backgroundColor: theme.defeat }]} />
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

function DuelRow({ duel }: { duel: ActiveDuel }) {
  const { t } = useTranslation();
  const { opponent, yourSteps, theirSteps, endsIn } = duel;
  const ahead = yourSteps >= theirSteps;
  const gap = Math.abs(yourSteps - theirSteps);

  return (
    <Card style={styles.row}>
      {/* Avatar (KAN-19). */}
      <Card variant={ahead ? 'default' : 'rival'} style={styles.rowAvatar} />

      <View style={styles.rowBody}>
        <View style={styles.spread}>
          <ThemedText type="bodyBold">{t('duels.vsOpponent', { opponent })}</ThemedText>
          <ThemedText type="smallBold" themeColor={ahead ? 'primary' : 'defeat'}>
            {t(ahead ? 'duels.ahead' : 'duels.behindBy', { gap: formatCount(gap) })}
          </ThemedText>
        </View>

        <MeterBar
          value={yourSteps}
          max={Math.max(yourSteps, theirSteps)}
          tone={ahead ? 'power' : 'muted'}
        />

        <ThemedText type="caption" themeColor="textMuted">
          {`${formatCount(yourSteps)} · ${formatCount(theirSteps)} · ${endsIn}`}
        </ThemedText>
      </View>
    </Card>
  );
}

function PendingDuels() {
  const { t } = useTranslation();

  if (INCOMING_DUELS.length === 0 && OUTGOING_DUELS.length === 0) {
    return (
      <ThemedText type="small" themeColor="textDim" style={styles.empty}>
        {t('duels.noPending')}
      </ThemedText>
    );
  }

  return (
    <>
      {INCOMING_DUELS.length > 0 ? (
        <>
          <ThemedText type="label" themeColor="textDim">
            {t('duels.incoming')}
          </ThemedText>
          {INCOMING_DUELS.map((duel) => (
            <PendingRow key={duel.opponent} duel={duel} incoming />
          ))}
        </>
      ) : null}

      {OUTGOING_DUELS.length > 0 ? (
        <>
          <ThemedText type="label" themeColor="textDim">
            WAITING FOR THEM
          </ThemedText>
          {OUTGOING_DUELS.map((duel) => (
            <PendingRow key={duel.opponent} duel={duel} incoming={false} />
          ))}
        </>
      ) : null}
    </>
  );
}

function PendingRow({ duel, incoming }: { duel: PendingDuel; incoming: boolean }) {
  return (
    <Card style={styles.pendingRow}>
      <View style={styles.rowHead}>
        {/* Avatar (KAN-19). */}
        <Card style={styles.rowAvatar} />

        <View style={styles.rowBody}>
          <ThemedText type="bodyBold">{`${duel.opponent} · LV ${duel.level}`}</ThemedText>
          <ThemedText type="caption" themeColor="textMuted">
            {duel.note}
          </ThemedText>
        </View>

        {incoming ? null : (
          <ThemedText type="label" themeColor="textDim">
            PENDING
          </ThemedText>
        )}
      </View>

      {incoming ? (
        <View style={styles.actions}>
          <Button label="Accept" style={styles.action} />
          <Button label="Decline" variant="secondary" style={styles.action} />
        </View>
      ) : null}
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
  versusCharacter: { flex: 1, aspectRatio: 0.9 },
  versusBar: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  versusFill: {
    height: VERSUS_BAR_HEIGHT,
    borderRadius: Radius.pill,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowAvatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, padding: 0 },
  rowBody: { flex: 1, gap: Spacing.two },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  pendingRow: { gap: Spacing.three },
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: { flex: 1 },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
});
