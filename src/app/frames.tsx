import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Chip } from '@/components/atoms/chip';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { FrameOverlay } from '@/components/molecules/frame-overlay';
import { Notice } from '@/components/molecules/notice';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTranslation } from '@/hooks/use-translation';
import { FRAMES, isFrameEligible, type FrameMeta } from '@/lib/frames';
import { profileRepository, RepositoryError } from '@/repositories';

/** Numeral del escalón, para el nombre de cada tarjeta: "Bronce III". */
const RUNG_NUMERAL = ['I', 'II', 'III', 'IV', 'V'] as const;

/**
 * Catálogo de marcos de foto (`supabase/SCHEMA.md` §18). Solo bronce (nivel)
 * y plata (racha) por ahora — oro no tiene filas todavía, no hay moneda de la
 * que tirar (ver el mockup y el hilo de decisiones sobre la econom&iacute;a).
 *
 * La elegibilidad que se enseña aquí (`isFrameEligible`) es solo para no
 * ofrecer un botón "Equipar" que el servidor fuera a rechazar — quien de
 * verdad manda es `equip_frame`, así que un fallo de red o un perfil que
 * cambió entre medias todavía puede rechazar el intento.
 */
export default function FramesScreen() {
  const { state: profileState, reload } = useProfile();
  const { t } = useTranslation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (profileState.status !== 'ready') {
    // El guard de sesión de `_layout.tsx` ya garantiza que llegar aquí implica
    // sesión iniciada; esto solo cubre el instante de carga o un fallo real.
    return <ThemedView style={styles.screen} />;
  }

  const { level, streakDays, avatarUrl, equippedFrameId } = profileState.data;
  const stats = { level, streakDays };

  async function handleEquip(frameId: string | null) {
    setError(null);
    setBusyId(frameId ?? NONE_BUSY_KEY);

    try {
      await profileRepository.equipFrame(frameId);
      await reload();
    } catch (err) {
      setError(err instanceof RepositoryError ? err.message : t('frames.equipFailed'));
    } finally {
      setBusyId(null);
    }
  }

  const bronze = FRAMES.filter((frame) => frame.tier === 'bronze');
  const silver = FRAMES.filter((frame) => frame.tier === 'silver');

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Button label={t('common.back')} variant="secondary" onPress={goBack} />
            <ThemedText type="subheading">{t('frames.title')}</ThemedText>
            {/* Hueco simétrico para que el título quede centrado de verdad. */}
            <View style={styles.headerSpacer} />
          </View>

          <ThemedText type="small" themeColor="textMuted">
            {t('frames.subtitle')}
          </ThemedText>

          {error ? <Notice tone="rival" message={error} /> : null}

          <View style={styles.grid}>
            <NoneCard
              avatarUrl={avatarUrl}
              equipped={equippedFrameId === null}
              busy={busyId === NONE_BUSY_KEY}
              onPress={() => void handleEquip(null)}
            />
          </View>

          <Tier
            title={t('frames.tierBronze')}
            frames={bronze}
            stats={stats}
            avatarUrl={avatarUrl}
            equippedFrameId={equippedFrameId}
            busyId={busyId}
            onEquip={(id) => void handleEquip(id)}
          />

          <Tier
            title={t('frames.tierSilver')}
            frames={silver}
            stats={stats}
            avatarUrl={avatarUrl}
            equippedFrameId={equippedFrameId}
            busyId={busyId}
            onEquip={(id) => void handleEquip(id)}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Vuelve por donde se vino; si no hay historial, a Perfil. */
function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.profile.href);
}

/** No es un `frameId` real: distingue "desequipando" de "sin ningún botón pulsado". */
const NONE_BUSY_KEY = '__none__';

function Tier({
  title,
  frames,
  stats,
  avatarUrl,
  equippedFrameId,
  busyId,
  onEquip,
}: {
  title: string;
  frames: readonly FrameMeta[];
  stats: { level: number; streakDays: number };
  avatarUrl: string | null;
  equippedFrameId: string | null;
  busyId: string | null;
  onEquip: (frameId: string) => void;
}) {
  return (
    <View style={styles.tier}>
      <ThemedText type="label" themeColor="textDim">
        {title}
      </ThemedText>

      <View style={styles.grid}>
        {frames.map((frame) => (
          <FrameCard
            key={frame.id}
            frame={frame}
            eligible={isFrameEligible(frame, stats)}
            avatarUrl={avatarUrl}
            equipped={frame.id === equippedFrameId}
            busy={busyId === frame.id}
            onPress={() => onEquip(frame.id)}
          />
        ))}
      </View>
    </View>
  );
}

function FrameCard({
  frame,
  eligible,
  avatarUrl,
  equipped,
  busy,
  onPress,
}: {
  frame: FrameMeta;
  eligible: boolean;
  avatarUrl: string | null;
  equipped: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const name = `${t(`frames.${frame.tier}Name`)} ${RUNG_NUMERAL[frame.rung - 1]}`;
  const unlockLabel =
    frame.unlockType === 'level'
      ? t('frames.unlockLevel', { value: frame.unlockValue })
      : t('frames.unlockStreak', { value: frame.unlockValue });

  return (
    <Card variant={equipped ? 'highlight' : 'default'} style={[styles.card, !eligible && styles.cardLocked]}>
      <FrameOverlay frame={frame} avatarUrl={avatarUrl} style={styles.preview} />
      <ThemedText type="smallBold">{name}</ThemedText>
      <Chip label={unlockLabel} tone={frame.unlockType === 'level' ? 'primary' : 'rival'} />
      <Button
        label={equipped ? t('frames.equipped') : t('frames.equip')}
        variant={equipped ? 'secondary' : 'primary'}
        disabled={!eligible || equipped || busy}
        onPress={onPress}
        style={styles.equipButton}
      />
    </Card>
  );
}

function NoneCard({
  avatarUrl,
  equipped,
  busy,
  onPress,
}: {
  avatarUrl: string | null;
  equipped: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card variant={equipped ? 'highlight' : 'default'} style={styles.card}>
      <FrameOverlay frame={null} avatarUrl={avatarUrl} style={styles.preview} />
      <ThemedText type="smallBold">{t('frames.none')}</ThemedText>
      <Button
        label={equipped ? t('frames.equipped') : t('frames.equip')}
        variant={equipped ? 'secondary' : 'primary'}
        disabled={equipped || busy}
        onPress={onPress}
        style={styles.equipButton}
      />
    </Card>
  );
}

const PREVIEW_SIZE = 84;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerSpacer: { width: Spacing.six },
  tier: { gap: Spacing.two },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  card: {
    width: 152,
    alignItems: 'center',
    gap: Spacing.two,
  },
  cardLocked: {
    opacity: 0.55,
  },
  preview: {
    width: PREVIEW_SIZE,
    height: PREVIEW_SIZE,
    borderRadius: Radius.lg,
  },
  equipButton: {
    width: '100%',
    // Menos que el relleno horizontal de serie del botón (Spacing.four a
    // cada lado): a este ancho de tarjeta, "EQUIPADO" no cabe con el de serie.
    paddingHorizontal: Spacing.two,
  },
});
