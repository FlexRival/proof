import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Chip } from '@/components/atoms/chip';
import { ProfilePhoto } from '@/components/molecules/profile-photo';
import { StatTile } from '@/components/molecules/stat-tile';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useFriendships } from '@/hooks/use-friendships';
import { useTheme } from '@/hooks/use-theme';
import { formatCount } from '@/lib/format';

/**
 * Resultado de un duelo tuyo contra este amigo. Vive aquí porque esta pantalla
 * es su único consumidor; se mudará a `duel-repository.ts` cuando exista
 * (KAN-32), que es quien podrá rellenarlo de verdad.
 */
type DuelOutcome = 'WIN' | 'LOSS';

/**
 * Perfil de un amigo.
 *
 * Se abre con el usuario en la URL (`/friend-profile?username=@alexruiz`),
 * igual que `victory` y `new-duel`. Alguien que no está en tu lista no tiene
 * perfil que enseñar y el diseño no define un estado de error, así que se sale
 * a la lista de amigos.
 *
 * **Identidad real, historial todavía no.** Nombre, nivel y racha vienen de
 * `friendshipRepository`. El cara a cara, la media diaria de pasos y el
 * porcentaje de victorias necesitan el `duel-repository.ts` (KAN-32) y la
 * agregación de `step_logs`, así que van vacíos o con una raya — nunca con un
 * cero, que se leería como un dato real.
 */
export default function FriendProfileScreen() {
  const { username } = useLocalSearchParams<{ username?: string }>();
  const { state } = useFriendships();

  // Mientras la lista viaja no se sabe todavía si ese amigo existe: redirigir
  // aquí sacaría al usuario de la pantalla que acaba de abrir.
  if (state.status === 'loading') {
    return <ThemedView style={styles.screen} />;
  }

  const friend =
    state.status === 'ready'
      ? state.data.friends.find((candidate) => candidate.username === username)
      : undefined;

  if (!friend) {
    return <Redirect href={ROUTES.friends.href} />;
  }

  /** Vacío hasta KAN-32: sin repositorio de duelos no hay historial que leer. */
  const record: DuelOutcome[] = [];
  const dailyAvgSteps: number | null = null;
  const winRate: number | null = null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Button label="Back" variant="secondary" onPress={goBack} />
            <ThemedText type="label" themeColor="textDim">
              FRIEND PROFILE
            </ThemedText>
            {/* Hueco simétrico para que el rótulo quede centrado de verdad. */}
            <View style={styles.headerSpacer} />
          </View>

          {/*
            La foto del amigo, igual que Perfil enseña la tuya. El hueco, si no
            subió ninguna, va en Rival: aquí el amigo es el oponente, no tú.
          */}
          <ProfilePhoto
            avatarUrl={friend.avatarUrl}
            style={styles.character}
            fallbackVariant="rival"
          />

          <View style={styles.identity}>
            <ThemedText type="subtitle">{friend.username}</ThemedText>

            <View style={styles.chips}>
              <Chip label={`LV ${friend.level}`} tone="primary" />
              <Chip label={`🔥 ${friend.streakDays} DAY STREAK`} tone="rival" />
            </View>
          </View>

          <HeadToHeadCard record={record} />

          <View style={styles.statsRow}>
            <StatTile
              label="DAILY AVG"
              value={dailyAvgSteps === null ? UNKNOWN : formatCount(dailyAvgSteps)}
            />
            <StatTile label="WIN RATE" value={winRate === null ? UNKNOWN : `${winRate}%`} />
          </View>

          <View style={styles.actions}>
            <Button
              label={`Challenge ${friend.username}`}
              onPress={() =>
                router.push({ pathname: '/new-duel', params: { opponent: friend.username } })
              }
            />
            {/*
              El historial de duelos no está diseñado ni tiene pantalla. Va
              deshabilitado en vez de llevar a un callejón sin salida, el mismo
              criterio que el botón de personalizar del perfil propio.
            */}
            <Button label="View duel history" variant="secondary" disabled />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Estadística que todavía no se conoce. Una raya, no un cero: un cero se lee
 * como un dato real y diría que ese amigo no anda ni gana nunca.
 */
const UNKNOWN = '—';

/** Vuelve por donde se vino; si no hay historial, a la lista de amigos. */
function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.friends.href);
}

/**
 * Marcador cara a cara y la tira de resultados. El marcador y el total salen
 * del propio historial: guardarlos aparte los dejaría desincronizarse.
 */
function HeadToHeadCard({ record }: { record: DuelOutcome[] }) {
  const wins = record.filter((outcome) => outcome === 'WIN').length;
  const losses = record.length - wins;

  return (
    <Card style={styles.headToHead}>
      <ThemedText type="label" themeColor="textDim">
        HEAD TO HEAD
      </ThemedText>

      {record.length > 0 ? (
        <>
          <View style={styles.scoreRow}>
            <View style={styles.score}>
              <ThemedText type="subtitle" themeColor="victory">
                {String(wins)}
              </ThemedText>
              <ThemedText type="subtitle" themeColor="textDim">
                —
              </ThemedText>
              <ThemedText type="subtitle" themeColor="defeat">
                {String(losses)}
              </ThemedText>
            </View>

            <ThemedText type="caption" themeColor="textMuted">
              {`${formatCount(record.length)} ${record.length === 1 ? 'duel' : 'duels'} together`}
            </ThemedText>
          </View>

          <RecordStrip record={record} />
        </>
      ) : (
        <ThemedText type="small" themeColor="textMuted">
          No duels yet. Challenge them to start the record.
        </ThemedText>
      )}
    </Card>
  );
}

/**
 * Un segmento por duelo, del más antiguo al más reciente: Power si ganaste,
 * Rival si no. Es el historial, no un porcentaje — por eso todos los segmentos
 * miden lo mismo.
 */
function RecordStrip({ record }: { record: DuelOutcome[] }) {
  const theme = useTheme();

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Duel history, oldest first: ${record.join(', ').toLowerCase()}`}
      style={styles.strip}>
      {record.map((outcome, index) => (
        <View
          key={index}
          style={[
            styles.stripSegment,
            { backgroundColor: outcome === 'WIN' ? theme.victory : theme.defeat },
          ]}
        />
      ))}
    </View>
  );
}

const STRIP_HEIGHT = 6;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerSpacer: { width: 88 },
  character: {
    width: '100%',
    aspectRatio: 1,
    // Lo traía `Card` por su cuenta; la foto lo necesita explícito para
    // recortarse con la misma forma que el hueco al que sustituye.
    borderRadius: Radius.lg,
  },
  identity: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  headToHead: { gap: Spacing.three },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  score: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  strip: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  stripSegment: {
    flex: 1,
    height: STRIP_HEIGHT,
    borderRadius: Radius.pill,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actions: { gap: Spacing.two },
});
