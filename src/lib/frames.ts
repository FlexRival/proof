/**
 * Catálogo de marcos de foto. Espeja las filas sembradas por
 * `supabase/migrations/20260909090000_photo_frames.sql` (mismo principio que
 * `src/lib/xp.ts` espeja `level_for_xp`): la elegibilidad autoritativa vive
 * en Postgres (`equip_frame`), pero pintar el marco no puede pagar una ida y
 * vuelta de red, así que el catálogo se duplica aquí a propósito.
 *
 * Si se añade una fila en una migración futura, hay que añadir la entrada
 * correspondiente en `FRAMES` a mano — no hay generación automática.
 */

import { Gradients } from '@/constants/theme';

export type FrameTier = 'bronze' | 'silver' | 'gold';
export type FrameUnlockType = 'level' | 'streak' | 'currency';

export type FrameMeta = {
  id: string;
  tier: FrameTier;
  /** Escalón dentro de la escalera del tier, 1–5. A más alto, más adorno. */
  rung: 1 | 2 | 3 | 4 | 5;
  unlockType: FrameUnlockType;
  unlockValue: number;
  /** A partir de qué escalón se enciende el brillo que recorre el borde. */
  animated: boolean;
};

/** Metal → paradas de degradado (`Gradients`, en `colors.ts`). Oro llega con la moneda. */
export const TIER_GRADIENT: Record<Exclude<FrameTier, 'gold'>, readonly string[]> = {
  bronze: Gradients.frameBronze,
  silver: Gradients.frameSilver,
};

/**
 * Catálogo de bronce (nivel) y plata (racha). Oro no tiene filas todavía:
 * `equip_frame` las rechaza en el servidor porque no hay moneda que gastar,
 * así que tampoco tiene sentido enseñarlas aquí.
 */
export const FRAMES: readonly FrameMeta[] = [
  { id: 'bronze_1', tier: 'bronze', rung: 1, unlockType: 'level', unlockValue: 1, animated: false },
  { id: 'bronze_2', tier: 'bronze', rung: 2, unlockType: 'level', unlockValue: 25, animated: false },
  { id: 'bronze_3', tier: 'bronze', rung: 3, unlockType: 'level', unlockValue: 50, animated: false },
  { id: 'bronze_4', tier: 'bronze', rung: 4, unlockType: 'level', unlockValue: 100, animated: true },
  { id: 'bronze_5', tier: 'bronze', rung: 5, unlockType: 'level', unlockValue: 200, animated: true },
  { id: 'silver_1', tier: 'silver', rung: 1, unlockType: 'streak', unlockValue: 3, animated: false },
  { id: 'silver_2', tier: 'silver', rung: 2, unlockType: 'streak', unlockValue: 7, animated: true },
  { id: 'silver_3', tier: 'silver', rung: 3, unlockType: 'streak', unlockValue: 14, animated: true },
  { id: 'silver_4', tier: 'silver', rung: 4, unlockType: 'streak', unlockValue: 30, animated: true },
  { id: 'silver_5', tier: 'silver', rung: 5, unlockType: 'streak', unlockValue: 60, animated: true },
] as const;

export function frameById(id: string | null): FrameMeta | null {
  if (!id) return null;
  return FRAMES.find((frame) => frame.id === id) ?? null;
}

/**
 * Si el usuario cumple el umbral del marco, con los mismos datos que ya
 * pinta el resto de la app (`level`, `streakDays`). No decide nada por su
 * cuenta: `equip_frame` es quien de verdad manda, esto solo evita ofrecer un
 * botón "Equipar" que el servidor rechazaría.
 */
export function isFrameEligible(frame: FrameMeta, stats: { level: number; streakDays: number }): boolean {
  if (frame.unlockType === 'level') return stats.level >= frame.unlockValue;
  if (frame.unlockType === 'streak') return stats.streakDays >= frame.unlockValue;
  return false;
}

/* ============================= Geometría SVG =============================
 * `FrameOverlay` (src/components/molecules/frame-overlay.tsx) dibuja sobre un
 * `viewBox` de alto fijo 100 y ancho `100 * aspectRatio` — calcado del
 * mockup aprobado (`avatar-frames-mockup.html`), que asumía un cuadrado
 * (`aspectRatio = 1`): más grueso el trazo, más capas de moldura, más
 * chaflán en las esquinas y más remaches por el borde según sube el
 * escalón, con remate arriba y abajo solo en el escalón 5.
 *
 * Con el alto siempre en 100 y el ancho reescalado a la proporción real de
 * la foto, la escala final es uniforme en los dos ejes (mismo nº de px
 * reales por unidad en X que en Y) — así el grosor de trazo y los radios
 * (`rx`) no hace falta tocarlos, salen bien solos. Lo que sí cambia con el
 * ancho son las COORDENADAS en X (posiciones, no longitudes): un punto o
 * medida pensada como "espejo desde el borde derecho" (`100 - x`) pasa a
 * `viewBoxWidth - x`, y todo lo anclado al borde izquierdo (x=0) no cambia.
 * Confundir "coordenada" con "longitud" aquí rompe el marco: por eso
 * `chamferLines`/`tickLines`/`cornerBadgeCenters` reciben `viewBoxWidth`
 * pero `rungGeometry` (grosores y radios) no.
 */

export type Point = { x: number; y: number };
export type Line = { x1: number; y1: number; x2: number; y2: number };

export type RingSpec = { inset: number; size: number; radius: number; strokeWidth: number };

export type RungGeometry = {
  shadowStrokeWidth: number;
  outerStrokeWidth: number;
  /** Segunda moldura interior, solo escalón 5. */
  midRing: RingSpec | null;
  /** Moldura interior, escalones 3–5. */
  innerRing: RingSpec | null;
  cornerCurveStrokeWidth: number;
  /** Nº de trazos de chaflán apilados por esquina (0 en el escalón 1). */
  chamferCount: number;
  chamferStrokeWidth: number;
  /** Posiciones (en el eje del lado) de los remaches; vacío si no hay. */
  tickPositions: number[];
  tickStrokeWidth: number;
  /** Placa detrás de cada esquina, solo escalón 5. */
  cornerBadge: boolean;
  /** Remate en diamante arriba y abajo, solo escalón 5. */
  crest: boolean;
};

const RUNG_GEOMETRY: Record<1 | 2 | 3 | 4 | 5, RungGeometry> = {
  1: {
    shadowStrokeWidth: 4,
    outerStrokeWidth: 2.6,
    midRing: null,
    innerRing: null,
    cornerCurveStrokeWidth: 2.2,
    chamferCount: 0,
    chamferStrokeWidth: 1.5,
    tickPositions: [],
    tickStrokeWidth: 1.5,
    cornerBadge: false,
    crest: false,
  },
  2: {
    shadowStrokeWidth: 4.2,
    outerStrokeWidth: 3.2,
    midRing: null,
    innerRing: null,
    cornerCurveStrokeWidth: 2.3,
    chamferCount: 1,
    chamferStrokeWidth: 1.5,
    tickPositions: [],
    tickStrokeWidth: 1.5,
    cornerBadge: false,
    crest: false,
  },
  3: {
    shadowStrokeWidth: 4.6,
    outerStrokeWidth: 3.8,
    midRing: null,
    innerRing: { inset: 7, size: 86, radius: 12, strokeWidth: 1.3 },
    cornerCurveStrokeWidth: 2.3,
    chamferCount: 2,
    chamferStrokeWidth: 1.5,
    tickPositions: [38, 62],
    tickStrokeWidth: 1.4,
    cornerBadge: false,
    crest: false,
  },
  4: {
    shadowStrokeWidth: 5.2,
    outerStrokeWidth: 4.4,
    midRing: null,
    innerRing: { inset: 7, size: 86, radius: 12, strokeWidth: 1.5 },
    cornerCurveStrokeWidth: 2.4,
    chamferCount: 3,
    chamferStrokeWidth: 1.6,
    tickPositions: [30, 42, 58, 70],
    tickStrokeWidth: 1.5,
    cornerBadge: false,
    crest: false,
  },
  5: {
    shadowStrokeWidth: 6.4,
    outerStrokeWidth: 5.8,
    midRing: { inset: 6, size: 88, radius: 13, strokeWidth: 1.9 },
    innerRing: { inset: 9, size: 82, radius: 11, strokeWidth: 1.3 },
    cornerCurveStrokeWidth: 2.4,
    chamferCount: 4,
    chamferStrokeWidth: 1.6,
    tickPositions: [16, 26, 36, 64, 74, 84],
    tickStrokeWidth: 1.5,
    cornerBadge: true,
    crest: true,
  },
};

export function rungGeometry(rung: FrameMeta['rung']): RungGeometry {
  return RUNG_GEOMETRY[rung];
}

/** Distancia de cada trazo de chaflán a la esquina, de dentro a fuera. */
const CHAMFER_DISTANCES = [9, 14, 19, 24];

/** Ancho del `viewBox` por defecto: cuadrado (`aspectRatio = 1`), como el diseño original. */
const DEFAULT_VIEW_BOX_WIDTH = 100;

/**
 * Refleja un punto de la esquina superior-izquierda a las otras tres.
 * `viewBoxWidth` es el ancho real del `viewBox` (100 * aspectRatio) — el
 * espejo en X es contra ESE borde, no contra 100 fijo; el espejo en Y sigue
 * siendo contra 100 porque el alto del `viewBox` no cambia nunca.
 */
function mirrorCorner({ x, y }: Point, flipX: boolean, flipY: boolean, viewBoxWidth: number): Point {
  return { x: flipX ? viewBoxWidth - x : x, y: flipY ? 100 - y : y };
}

/** Las 4 esquinas, como pares (invertir X, invertir Y) desde la superior-izquierda. */
const CORNERS: readonly [boolean, boolean][] = [
  [false, false], // superior-izquierda
  [true, false], // superior-derecha
  [true, true], // inferior-derecha
  [false, true], // inferior-izquierda
];

/** Los trazos de chaflán apilados en las 4 esquinas, para un `chamferCount` dado. */
export function chamferLines(chamferCount: number, viewBoxWidth: number = DEFAULT_VIEW_BOX_WIDTH): Line[] {
  const base = CHAMFER_DISTANCES.slice(0, chamferCount).map(
    (distance): Line => ({ x1: 4, y1: distance, x2: distance, y2: 4 }),
  );

  return CORNERS.flatMap(([flipX, flipY]) =>
    base.map((line) => {
      const start = mirrorCorner({ x: line.x1, y: line.y1 }, flipX, flipY, viewBoxWidth);
      const end = mirrorCorner({ x: line.x2, y: line.y2 }, flipX, flipY, viewBoxWidth);
      return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
    }),
  );
}

/**
 * Los remaches en los 4 lados, para un set de posiciones dado. `positions`
 * son porcentajes (0-100) a lo largo del lado, no coordenadas directas —
 * arriba/abajo se multiplican por `viewBoxWidth` (lado horizontal), y a
 * izquierda/derecha por 100 (lado vertical, el alto no cambia con el ancho).
 */
export function tickLines(positions: number[], viewBoxWidth: number = DEFAULT_VIEW_BOX_WIDTH): Line[] {
  const top = positions.map((pct): Line => {
    const x = (pct / 100) * viewBoxWidth;
    return { x1: x, y1: 0.5, x2: x, y2: 6.5 };
  });
  const bottom = positions.map((pct): Line => {
    const x = (pct / 100) * viewBoxWidth;
    return { x1: x, y1: 99.5, x2: x, y2: 93.5 };
  });
  const left = positions.map((y): Line => ({ x1: 0.5, y1: y, x2: 6.5, y2: y }));
  const right = positions.map((y): Line => ({ x1: viewBoxWidth - 0.5, y1: y, x2: viewBoxWidth - 6.5, y2: y }));
  return [...top, ...bottom, ...left, ...right];
}

/** Centros de la placa de cada esquina (escalón 5). */
export function cornerBadgeCenters(viewBoxWidth: number = DEFAULT_VIEW_BOX_WIDTH): Point[] {
  return [
    { x: 10, y: 10 },
    { x: viewBoxWidth - 10, y: 10 },
    { x: viewBoxWidth - 10, y: 90 },
    { x: 10, y: 90 },
  ];
}

/**
 * Los 4 trazos que redondean cada esquina, calcados de un `viewBox` cuadrado
 * (los de la izquierda anclados a x=0, sin tocar; los de la derecha
 * reflejados contra `viewBoxWidth` en vez de contra 100 fijo).
 */
export function cornerCurvePaths(viewBoxWidth: number = DEFAULT_VIEW_BOX_WIDTH): [string, string, string, string] {
  const r = viewBoxWidth; // alias corto para las plantillas de abajo
  return [
    `M4,16 C4,8 8,4 16,4`,
    `M${r - 16},4 C${r - 8},4 ${r - 4},8 ${r - 4},16`,
    `M${r - 4},84 C${r - 4},92 ${r - 8},96 ${r - 16},96`,
    `M16,96 C8,96 4,92 4,84`,
  ];
}
