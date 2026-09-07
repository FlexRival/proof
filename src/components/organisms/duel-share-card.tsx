import { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/atoms/themed-text';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import { durationInDays } from '@/lib/duel';
import type { DuelResult } from '@/lib/duel-result';
import { formatCount } from '@/lib/format';
import type { DuelOutcome } from '@/repositories';

/**
 * La imagen que se comparte al acabar un duelo (KAN-33 / KAN-35).
 *
 * Es un componente normal, no un lienzo aparte: se pinta **visible** en la
 * pantalla de resultado y es esa misma vista la que captura
 * `react-native-view-shot`. Así lo que se publica es literalmente lo que el
 * jugador vio, y no hay una segunda plantilla que se desincronice del diseño en
 * cuanto alguien toque un color.
 *
 * La proporción es 4:5, la que ocupa más pantalla en el feed de Instagram (ver
 * `docs/marketing/instagram.md`), y la captura se pide a 1080×1350 — la misma
 * proporción, así que no deforma nada.
 */

/** Proporción de la lámina: 1080×1350. */
const ASPECT_RATIO = 4 / 5;

/** Píxeles del PNG resultante. Cabe en el límite de subida de cualquier red. */
export const SHARE_CARD_SIZE = { width: 1080, height: 1350 } as const;

const HEADLINE_COLOR: Record<DuelOutcome, ThemeColor> = {
  win: 'victory',
  loss: 'defeat',
  draw: 'textMuted',
};

type DuelShareCardProps = {
  result: DuelResult;
  /** El nombre del usuario de la sesión: en el duelo solo viene el del rival. */
  username: string;
};

export const DuelShareCard = forwardRef<View, DuelShareCardProps>(function DuelShareCard(
  { result, username },
  ref,
) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { duel, outcome, xpEarned } = result;

  return (
    <View
      ref={ref}
      // `collapsable={false}` es obligatorio para poder capturarla: sin él
      // Android puede fusionar esta vista con su padre, y entonces el ref no
      // apunta a nada que dibujar.
      collapsable={false}
      style={[styles.card, { backgroundColor: theme.background, borderColor: theme.primaryEdge }]}>
      <View style={styles.head}>
        <ThemedText type="smallBold" themeColor="primary">
          PROOFIT
        </ThemedText>
        <ThemedText type="label" themeColor="textDim">
          {t('duelResult.dayDuel', { days: durationInDays(duel) })}
        </ThemedText>
      </View>

      <View style={styles.headline}>
        <ThemedText type="title" themeColor={HEADLINE_COLOR[outcome]}>
          {t(`duelResult.headline.${outcome}`)}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted">
          {t('duelResult.versus', { opponent: duel.opponent.username })}
        </ThemedText>
      </View>

      <View style={styles.scoreboard}>
        <ShareSide
          name={username}
          steps={duel.yourSteps}
          color={outcome === 'loss' ? 'steps' : 'victory'}
        />
        <ThemedText type="label" themeColor="textDim">
          {t('duels.versus')}
        </ThemedText>
        <ShareSide
          name={duel.opponent.username}
          steps={duel.theirSteps}
          color={outcome === 'loss' ? 'defeat' : 'steps'}
          align="right"
        />
      </View>

      <SplitBar yourSteps={duel.yourSteps} theirSteps={duel.theirSteps} outcome={outcome} />

      <View style={styles.footer}>
        <ThemedText type="numeric" themeColor="xp">
          {xpEarned > 0 ? `+${formatCount(xpEarned)} XP` : t('duelResult.noXp')}
        </ThemedText>
        <ThemedText type="label" themeColor="textDim">
          {t('duelResult.tagline')}
        </ThemedText>
      </View>
    </View>
  );
});

type ShareSideProps = {
  name: string;
  steps: number;
  color: ThemeColor;
  align?: 'left' | 'right';
};

function ShareSide({ name, steps, color, align = 'left' }: ShareSideProps) {
  const { t } = useTranslation();
  const textAlign = align === 'right' ? ('right' as const) : ('left' as const);

  return (
    <View style={styles.side}>
      <ThemedText type="caption" themeColor="textMuted" style={{ textAlign }} numberOfLines={1}>
        {name}
      </ThemedText>
      <ThemedText type="subtitle" themeColor={color} style={{ textAlign }}>
        {formatCount(steps)}
      </ThemedText>
      <ThemedText type="label" themeColor="textDim" style={{ textAlign }}>
        {t('duels.steps')}
      </ThemedText>
    </View>
  );
}

/**
 * La barra partida del marcador: cada lado ocupa lo que le corresponde por
 * pasos, así que la diferencia se lee sin comparar cifras.
 *
 * Los pasos van en blanco y nunca en verde —el verde es XP, no actividad, ver
 * `docs/design.md`—; lo único que se colorea es el resultado.
 */
function SplitBar({
  yourSteps,
  theirSteps,
  outcome,
}: {
  yourSteps: number;
  theirSteps: number;
  outcome: DuelOutcome;
}) {
  const theme = useTheme();

  // Un duelo 0–0 dejaría los dos `flex` a cero y la barra vacía; se reparte a
  // medias, que es exactamente lo que pasó.
  const empty = yourSteps === 0 && theirSteps === 0;

  return (
    <View style={[styles.bar, { backgroundColor: theme.meterTrack }]}>
      <View
        style={[
          styles.barFill,
          {
            flex: empty ? 1 : yourSteps,
            backgroundColor: outcome === 'loss' ? theme.steps : theme.victory,
          },
        ]}
      />
      <View
        style={[
          styles.barFill,
          {
            flex: empty ? 1 : theirSteps,
            backgroundColor: outcome === 'loss' ? theme.defeat : theme.meterTrack,
          },
        ]}
      />
    </View>
  );
}

const BAR_HEIGHT = 10;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: ASPECT_RATIO,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    justifyContent: 'space-between',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headline: {
    gap: Spacing.one,
  },
  scoreboard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  side: {
    flex: 1,
    gap: Spacing.one,
  },
  bar: {
    flexDirection: 'row',
    height: BAR_HEIGHT,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: BAR_HEIGHT,
  },
  footer: {
    gap: Spacing.one,
  },
});
