/**
 * Punto de entrada del sistema de diseño de Prooffit.
 *
 * Los componentes importan de aquí. La capa interna es `colors.ts`: rampas y
 * tokens semánticos, sin dependencias, para poder validarlo con Node.
 *
 * Guía de color: https://docs.expo.dev/guides/color-schemes/
 */

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { Palette } from '@/constants/colors';
import { FontFamily } from '@/constants/fonts';

export { Colors, Gradients, Palette, type ThemeColor } from '@/constants/colors';
export { FONT_ASSETS, FontFamily } from '@/constants/fonts';

/**
 * Escala tipográfica. Métricas y familia: el color lo pone el tema, para que
 * una misma variante sirva sobre cualquier superficie.
 *
 * La familia va en la variante y no en el componente porque en este diseño la
 * familia *es* el peso: `FontFamily.display` (Chakra Petch 700) cubre cifras,
 * títulos, mayúsculas y todo lo que iría en negrita; `body` / `bodyMedium`
 * (Space Grotesk 400/500) cubren el resto. Por eso ninguna variante con
 * familia de marca declara `fontWeight` — ver `constants/fonts.ts`.
 */
export const Typography = {
  /** Cifra protagonista de la subida de nivel. */
  display: {
    fontFamily: FontFamily.display,
    fontSize: 56,
    lineHeight: 58,
    letterSpacing: -1,
  },
  title: { fontFamily: FontFamily.display, fontSize: 48, lineHeight: 52 },
  subtitle: { fontFamily: FontFamily.display, fontSize: 32, lineHeight: 44 },
  heading: { fontFamily: FontFamily.display, fontSize: 24, lineHeight: 30 },
  subheading: { fontFamily: FontFamily.display, fontSize: 20, lineHeight: 26 },
  default: { fontFamily: FontFamily.body, fontSize: 16, lineHeight: 24 },
  /** Énfasis dentro del cuerpo: sube de familia, no de peso. */
  bodyBold: { fontFamily: FontFamily.display, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: FontFamily.bodyMedium, fontSize: 14, lineHeight: 20 },
  smallBold: { fontFamily: FontFamily.display, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: FontFamily.bodyMedium, fontSize: 12, lineHeight: 16 },
  /** Rótulos de sección en mayúsculas: SURFACES & ACCENTS, XP PROGRESS. */
  label: {
    fontFamily: FontFamily.bodyMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  /** Label de botón: mayúsculas y espaciado ancho. */
  button: {
    fontFamily: FontFamily.display,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 1.2,
  },
  /**
   * Contadores. `tabular-nums` fija el ancho de los dígitos para que los pasos
   * y el XP no bailen mientras se animan.
   */
  numeric: {
    fontFamily: FontFamily.display,
    fontSize: 20,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  link: { fontFamily: FontFamily.bodyMedium, fontSize: 14, lineHeight: 30 },
  /** Solo la fórmula de XP de la card de regla del juego. */
  code: { fontFamily: FontFamily.mono, fontSize: 12, lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof Typography;

export const Radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/**
 * Sombras. `shadow*` las aplica iOS y `elevation` Android, así que cada nivel
 * declara ambos.
 *
 * En oscuro las sombras casi no se leen: la jerarquía la lleva la pila
 * `surfaceSunken` → `background` → `surface` → `surfaceRaised`, y la sombra
 * solo la refuerza.
 */
export const Elevation = {
  low: {
    shadowColor: Palette.void,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  medium: {
    shadowColor: Palette.void,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  high: {
    shadowColor: Palette.void,
    shadowOpacity: 0.26,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
} as const satisfies Record<string, ViewStyle>;

/**
 * Tokens de animación para la barra de XP, la subida de nivel y el duelo.
 *
 * `easing` guarda los puntos de control de la bezier en crudo, no un objeto de
 * Reanimated, para que este archivo no dependa de la librería de animación.
 * En el componente: `Easing.bezier(...Motion.easing.standard)`.
 */
export const Motion = {
  duration: {
    fast: 150,
    base: 250,
    slow: 400,
    /** Celebraciones: subida de nivel, duelo ganado. */
    celebrate: 800,
  },
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    accelerate: [0.3, 0, 1, 1],
  },
  spring: {
    snappy: { damping: 20, stiffness: 220, mass: 1 },
    gentle: { damping: 26, stiffness: 120, mass: 1 },
    /** Rebote para recompensas. Usar con moderación. */
    bouncy: { damping: 12, stiffness: 180, mass: 1 },
  },
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * Alto que la barra de pestañas le roba al contenido. Una pantalla que
 * scrollea lo suma a su `paddingBottom` para que su último elemento no quede
 * debajo de la barra.
 *
 * `default` cubre web, donde la barra la pinta `app-tabs.web.tsx`: 16 de
 * padding exterior arriba y abajo, 8 del contenedor y una fila de ~28. Sin
 * este caso `Platform.select` devolvía `undefined` en web y el último
 * elemento de cada pantalla quedaba tapado.
 */
export const BottomTabInset = Platform.select({ ios: 50, android: 80, default: 76 });
export const MaxContentWidth = 800;
