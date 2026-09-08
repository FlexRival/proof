/**
 * Capa tipográfica del sistema de diseño de Prooffit. Ver `docs/design.md`
 * § Tipografía para la referencia legible.
 *
 * El diseño usa dos familias y nada más:
 *
 * - **Chakra Petch 700** — cifras, niveles, títulos y labels de botón. Todo
 *   lo que en el diseño va en negrita o en mayúsculas sale de aquí.
 * - **Space Grotesk 400/500** — texto corrido y labels de interfaz.
 *
 * Los pesos vienen en el archivo de fuente, no en `fontWeight`: cada familia
 * de abajo es un archivo concreto. Poner además `fontWeight` haría que
 * Android sintetizara una negrita falsa encima de una fuente que ya lo es,
 * así que la escala de `theme.ts` no lo declara.
 */

import '@/global.css';

import { ChakraPetch_700Bold } from '@expo-google-fonts/chakra-petch';
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk';
import { Platform } from 'react-native';

/**
 * Nombres de familia tal y como los registra `expo-font`. Coinciden con la
 * clave que se le pasa a `useFonts` en `FONT_ASSETS`: si cambias una, cambia
 * la otra.
 */
export const FontFamily = {
  /** Chakra Petch 700: cifras, niveles, títulos, labels de botón. */
  display: 'ChakraPetch_700Bold',
  /** Space Grotesk 400: texto corrido. */
  body: 'SpaceGrotesk_400Regular',
  /** Space Grotesk 500: texto de interfaz, labels, metadatos. */
  bodyMedium: 'SpaceGrotesk_500Medium',
  /**
   * Monoespaciada del sistema. El diseño la usa en un único sitio — la
   * fórmula de XP (`XP = floor(steps / 10)`) de la card de regla del juego —
   * así que no justifica una tercera familia descargada.
   */
  mono: Platform.select({ ios: 'ui-monospace', web: 'var(--font-mono)' }) ?? 'monospace',
} as const;

/**
 * Lo que se le pasa a `useFonts` en `src/app/_layout.tsx`. Es el único sitio
 * de la app que carga fuentes: si una pantalla necesita una familia nueva se
 * añade aquí y a `FontFamily`, no con un `useFonts` suelto.
 */
export const FONT_ASSETS = {
  ChakraPetch_700Bold,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
} as const;
