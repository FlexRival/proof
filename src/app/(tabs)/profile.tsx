import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { ProfilePhoto } from '@/components/molecules/profile-photo';
import { StatTile } from '@/components/molecules/stat-tile';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { XpProgress } from '@/components/organisms/xp-progress';
import { ROUTES } from '@/constants/routes';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTranslation } from '@/hooks/use-translation';
import { useDuels } from '@/hooks/use-duels';
import { useSteps } from '@/hooks/use-steps';
import { formatCompact, formatCount } from '@/lib/format';
import { levelProgress } from '@/lib/xp';

/**
 * Perfil del jugador: nivel y su historial de duelos.
 *
 * **No hay ningún personaje RPG que represente al usuario** (se descartó a
 * propósito, junto con el sistema de cosméticos que lo dibujaba). Lo que
 * ocupa ese sitio es la **foto de perfil real** de la cuenta, la misma que se
 * sube desde Ajustes; si el usuario no ha subido ninguna, queda el hueco
 * reservado del diseño. Enseñarla aquí es KAN-64: la pantalla pintaba siempre
 * el hueco y la foto subida no aparecía en ningún sitio salvo Ajustes.
 *
 * Identidad (username, nivel, XP, racha) es **dato real de la sesión**
 * (`useProfile`), y desde KAN-32 victorias, derrotas y duelos se cuentan de los
 * duelos ya cerrados (`useDuels`), no de una constante.
 *
 * **Pasos totales sigue en cero**, y es honesto: `stepsRepository` solo sabe
 * leer la ventana sincronizable (7 días), no el histórico entero, y sumar esa
 * semana bajo el rótulo «TOTAL STEPS» sería peor que no dar el dato. Hace falta
 * una agregación en el servidor que todavía no existe.
 *
 * Dos desvíos conscientes respecto a la captura:
 * - La captura rotula `@marcodev · VANGUARD`, y VANGUARD es una **clase de
 *   personaje**. Las clases se descartaron (el esquema borró `user_class` y
 *   `avatar_class`) y no hay ningún concepto de "rango" individual que lo
 *   sustituya en el esquema (`clans.rank_points` es de clan, no de jugador) —
 *   así que esa mitad de la línea se quita en vez de inventar un dato falso.
 * - El botón de ajustes de la cabecera es un icono circular en la captura.
 *   No hay sistema de iconos todavía, así que va como botón con texto.
 */
export default function ProfileScreen() {
  const { state: profileState } = useProfile();
  const { state: duelsState } = useDuels();
  const { state: stepsState } = useSteps();
  const { t } = useTranslation();

  const finished = duelsState.status === 'ready' ? duelsState.data.finished : [];
  const wins = finished.filter((duel) => duel.outcome === 'win').length;
  const losses = finished.filter((duel) => duel.outcome === 'loss').length;
  // Cuenta los empates también: un duelo empatado se jugó igual, y dejarlo
  // fuera haría que «DUELS» no cuadrara con el historial de la otra pestaña.
  const duels = finished.length;
  // El porcentaje se mide sobre los duelos decididos: un empate no es media
  // victoria, y meterlo en el denominador bajaría el ratio sin haber perdido.
  const decided = wins + losses;
  const winRate = decided > 0 ? Math.round((wins / decided) * 100) : 0;

  // Lo suma el servidor (`total_steps()`): el historico crece sin techo y no
  // tiene sentido traerselo entero para sumarlo aqui. Mientras carga se
  // ensena 0, que es lo que el diseno reserva en ese hueco.
  const totalSteps = stepsState.status === 'ready' ? stepsState.data.total : 0;

  if (profileState.status !== 'ready') {
    // El guard de sesión de `_layout.tsx` ya garantiza que llegar aquí implica
    // sesión iniciada; esto solo cubre el instante de carga o un fallo real.
    return <ThemedView style={styles.screen} />;
  }

  const { username, xp, streakDays, avatarUrl } = profileState.data;
  const { level, xpIntoLevel, xpForNextLevel } = levelProgress(xp);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="subheading">{t('profile.title')}</ThemedText>
            <Button
              label={t('common.settings')}
              variant="secondary"
              onPress={() => router.push(ROUTES.settings.href)}
            />
          </View>

          <ProfilePhoto avatarUrl={avatarUrl} style={styles.character} />

          <ThemedText type="bodyBold" style={styles.identity}>
            {username}
          </ThemedText>

          <ThemedText type="heading" style={styles.level}>{t('common.level', { level })}</ThemedText>

          <XpProgress level={level} xpIntoLevel={xpIntoLevel} xpForNextLevel={xpForNextLevel} />

          <View style={styles.statsRow}>
            <StatTile label={t('profile.wins')} value={formatCount(wins)} valueColor="victory" />
            <StatTile label={t('profile.losses')} value={formatCount(losses)} valueColor="defeat" />
            <StatTile label={t('profile.winRate')} value={`${winRate}%`} />
          </View>

          <View style={styles.statsRow}>
            <StatTile label={t('profile.duels')} value={formatCount(duels)} />
            <StatTile label={t('profile.streak')} value={`🔥 ${formatCount(streakDays)}`} />
            <StatTile label={t('profile.totalSteps')} value={formatCompact(totalSteps)} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

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
    paddingBottom: Spacing.three + BottomTabInset,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  character: {
    width: '70%',
    alignSelf: 'center',
    aspectRatio: 0.85,
    // Lo traía `Card` por su cuenta; la foto lo necesita explícito para
    // recortarse con la misma forma que el hueco al que sustituye.
    borderRadius: Radius.lg,
  },
  identity: {
    textAlign: 'center',
  },
  level: {
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
