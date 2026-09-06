import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';

import { Card, type CardVariant } from '@/components/atoms/card';

/**
 * Foto de perfil de un usuario, con el hueco reservado del diseño cuando no
 * hay ninguna subida.
 *
 * Existe para que las dos pantallas que la enseñan —la cabecera de Perfil y
 * la fila de Ajustes— no repitan cada una su propio `if (avatarUrl)`: fue
 * justo esa duplicación la que dejó a Perfil pintando siempre el hueco y sin
 * enseñar nunca la foto subida (KAN-64).
 *
 * No hay ningún personaje RPG detrás — se descartó a propósito, junto con el
 * sistema de cosméticos que lo dibujaba — así que sin foto el hueco se queda
 * vacío en vez de caer en un avatar genérico.
 */
export type ProfilePhotoProps = {
  avatarUrl: string | null;
  /**
   * Tamaño y forma. Lo pone quien la usa porque los dos sitios no se parecen
   * en nada: Ajustes la quiere circular y pequeña, Perfil un retrato grande.
   */
  style?: StyleProp<ImageStyle>;
  /** Superficie del hueco cuando no hay foto. */
  fallbackVariant?: CardVariant;
};

export function ProfilePhoto({ avatarUrl, style, fallbackVariant = 'default' }: ProfilePhotoProps) {
  if (!avatarUrl) {
    return <Card variant={fallbackVariant} style={style} />;
  }

  return <Image source={{ uri: avatarUrl }} style={style} contentFit="cover" />;
}
