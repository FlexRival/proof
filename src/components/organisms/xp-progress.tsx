import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/atoms/themed-text';
import { XpBar } from '@/components/molecules/xp-bar';
import { Spacing } from '@/constants/theme';
import { useTranslation } from '@/hooks/use-translation';
import { formatCount } from '@/lib/format';

/**
 * Bloque de progreso de nivel del diseño: la barra a sangre y, debajo,
 * `450 / 1,000 XP` a la izquierda y `550 XP TO LV 13` a la derecha.
 *
 * Es distinto de `XpBar` a secas, que pone rótulo y cifras *encima* de la
 * pista. Aquí van debajo, y aparece igual en la pantalla principal y en el
 * perfil — por eso vive en su propio componente y no duplicado en las dos.
 */
export type XpProgressProps = {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  style?: StyleProp<ViewStyle>;
};

export function XpProgress({ level, xpIntoLevel, xpForNextLevel, style }: XpProgressProps) {
  const { t } = useTranslation();
  const xpToNextLevel = xpForNextLevel - xpIntoLevel;

  return (
    <View style={[styles.block, style]}>
      <XpBar value={xpIntoLevel} max={xpForNextLevel} label={null} showValues={false} />

      <View style={styles.row}>
        <ThemedText type="caption" themeColor="xp">
          {t('xp.progress', {
            into: formatCount(xpIntoLevel),
            total: formatCount(xpForNextLevel),
          })}
        </ThemedText>
        <ThemedText type="caption" themeColor="textMuted">
          {t('xp.toNextLevel', { remaining: formatCount(xpToNextLevel), level: level + 1 })}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
});
