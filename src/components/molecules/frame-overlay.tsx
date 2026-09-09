import { forwardRef, useEffect, useId, useState, type ComponentProps, type ElementRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { ProfilePhoto, type ProfilePhotoProps } from '@/components/molecules/profile-photo';
import {
  TIER_GRADIENT,
  chamferLines,
  cornerBadgeCenters,
  cornerCurvePaths,
  rungGeometry,
  tickLines,
  type FrameMeta,
} from '@/lib/frames';

/**
 * Foto de perfil con el marco decorativo puesto encima (`supabase/SCHEMA.md`
 * §18). Envuelve a `ProfilePhoto`, no lo sustituye: sin marco equipado
 * (`frame === null`) se comporta exactamente igual que `ProfilePhoto` sola —
 * ese es el estado por defecto de una cuenta nueva, no un hueco a rellenar.
 *
 * La geometría (grosor de trazo, nº de chaflanes, remaches, si hay remate)
 * viene de `rungGeometry()` en `src/lib/frames.ts`, calcada del mockup
 * aprobado (`avatar-frames-mockup.html`): más adorno cuanto más alto el
 * escalón. El brillo que recorre el borde y el resplandor de fondo solo se
 * animan si `frame.animated` — y ni eso si el sistema pide reducir
 * movimiento.
 *
 * **Animación con `Animated` de `react-native`, no `react-native-reanimated`**
 * a propósito: animar props de `react-native-svg` (`strokeDashoffset`,
 * `opacity`) con `useAnimatedProps` de Reanimated cuelga el hilo principal en
 * web (probado en esta pantalla — `requestAnimationFrame` deja de disparar
 * por completo, 0 fotogramas en más de un segundo). `Animated` es el que
 * `react-native-svg` documenta y prueba de verdad contra sus propios
 * componentes, en las tres plataformas.
 */
export type FrameOverlayProps = Pick<ProfilePhotoProps, 'avatarUrl' | 'style' | 'fallbackVariant'> & {
  frame: FrameMeta | null;
  /**
   * Proporción ancho/alto real de la caja de la foto (la misma que su
   * `aspectRatio` en `style`, p. ej. 0.85 en el personaje grande de Perfil).
   * Por defecto 1 (cuadrado). El marco se dibuja sobre un `viewBox` con esta
   * misma proporción — no uno cuadrado estirado o recortado — para que el
   * grosor del trazo no varíe entre una foto cuadrada y una en retrato ni
   * tuerza las curvas de las esquinas. Sin esto en una caja no cuadrada el
   * marco sale desproporionado: o dibuja de más y come foto, o tuerce el
   * dibujo al forzarlo a encajar.
   */
  aspectRatio?: number;
};

/**
 * Cuánto se sale el marco de la caja de la foto, para que el remate en
 * diamante del escalón 5 (el único elemento que dibuja fuera de `[0,100]`,
 * hasta ~y=-2.2/102.2 — ver `Crest`) no quede recortado por el borde de esa
 * caja. Un 9% por lado (el valor original) era casi el cuádruple de lo que
 * hace falta: sobraba tanto margen que en sitios con poco aire alrededor —la
 * fila "vs" de Duelos, dos fotos y un texto muy juntos— el marco se comía el
 * hueco y tapaba el texto de al lado. 4% dobla el margen real que pide el
 * remate (~2.2%), de sobra para el resto de elementos (chaflanes, remaches,
 * placas de esquina, todos dentro de `[0,100]`).
 */
const BLEED = '108%';
const BLEED_OFFSET = '-4%';
const SHIMMER_DASH = '16 620';
const SHIMMER_TRAVEL = -636;
const SHIMMER_DURATION_MS = 4600;
const GLOW_PULSE_DURATION_MS = 2300;

/**
 * `Animated.createAnimatedComponent` (de `react-native`, ver comentario de
 * arriba) mete un `collapsable={false}` de serie en cualquier componente que
 * envuelve — hace falta en nativo para que la vista no se "aplane" y pierda
 * la referencia que Animated necesita, pero `Rect`/`Circle` de
 * `react-native-svg` no lo declaran como prop suya: en web lo dejan pasar tal
 * cual al DOM, y React avisa porque `collapsable` no es un atributo
 * booleano válido de SVG. Esta envoltura lo intercepta antes de que llegue.
 */
const RectSansCollapsable = forwardRef<ElementRef<typeof Rect>, ComponentProps<typeof Rect> & { collapsable?: boolean }>(
  ({ collapsable: _collapsable, ...rest }, ref) => <Rect ref={ref} {...rest} />,
);
RectSansCollapsable.displayName = 'RectSansCollapsable';

const CircleSansCollapsable = forwardRef<
  ElementRef<typeof Circle>,
  ComponentProps<typeof Circle> & { collapsable?: boolean }
>(({ collapsable: _collapsable, ...rest }, ref) => <Circle ref={ref} {...rest} />);
CircleSansCollapsable.displayName = 'CircleSansCollapsable';

const AnimatedRect = Animated.createAnimatedComponent(RectSansCollapsable);
const AnimatedCircle = Animated.createAnimatedComponent(CircleSansCollapsable);

export function FrameOverlay({ frame, avatarUrl, style, fallbackVariant, aspectRatio = 1 }: FrameOverlayProps) {
  if (!frame) {
    return <ProfilePhoto avatarUrl={avatarUrl} style={style} fallbackVariant={fallbackVariant} />;
  }

  // Envuelto en un componente aparte (no un `if` a medio `FrameOverlay`) a
  // propósito: mide su propio alto con `onLayout`, y ese `useState` tiene que
  // llamarse siempre en el mismo orden. Si `frame` pasa de objeto a `null`
  // entre renders (se desequipa el marco), este componente entero se
  // desmonta y el otro `return` de arriba lo sustituye — nunca es el mismo
  // componente saltándose un hook.
  return <FramedPhoto frame={frame} avatarUrl={avatarUrl} style={style} fallbackVariant={fallbackVariant} aspectRatio={aspectRatio} />;
}

/** Radio de la esquina exterior del marco, en unidades del `viewBox` (mismo valor que el `rx` de `FrameSvg`). */
const OUTER_CORNER_RADIUS = 15;

function FramedPhoto({
  frame,
  avatarUrl,
  style,
  fallbackVariant,
  aspectRatio,
}: Required<Pick<FrameOverlayProps, 'aspectRatio'>> &
  Omit<FrameOverlayProps, 'aspectRatio'> & { frame: FrameMeta }) {
  // El marco dibuja su esquina a `rx=15` sobre un `viewBox` de alto fijo 100
  // (`FrameSvg`), así que su redondeo en píxeles depende del tamaño real de
  // la caja — un `borderRadius` fijo (el que traiga `style`, pensado para una
  // `Card` sin marco) solo coincide por casualidad con un tamaño concreto; en
  // cualquier otro deja un hueco triangular entre la foto y el marco (se ve
  // como si la foto estuviera "recortada" en cuadrado). Por eso la foto mide
  // su propia caja y calcula el radio a partir de ahí, en vez de heredar uno
  // fijo. Sin medida todavía (primer render) se deja sin radio: dura un
  // fotograma y `FrameSvg` la tapa por fuera mientras tanto.
  const [rigHeight, setRigHeight] = useState(0);
  const photoRadius = rigHeight > 0 ? (OUTER_CORNER_RADIUS / 100) * rigHeight : undefined;

  return (
    // `style` va también en el contenedor, no solo en la foto: algunas
    // pantallas pasan un ancho en porcentaje (el bloque grande de personaje,
    // `width:'100%'` de su propio wrapper) y sin esto el contenedor no
    // tendría tamaño propio del que la foto pudiera heredar el 100% — las
    // dos puntas de esa cadena se resuelven contra el mismo padre real en
    // vez de depender la una de la otra.
    <View style={[styles.rig, style]} onLayout={(e) => setRigHeight(e.nativeEvent.layout.height)}>
      <ProfilePhoto
        avatarUrl={avatarUrl}
        style={[StyleSheet.absoluteFill, { borderRadius: photoRadius }]}
        fallbackVariant={fallbackVariant}
      />
      <FrameSvg frame={frame} aspectRatio={aspectRatio} />
    </View>
  );
}

function FrameSvg({ frame, aspectRatio }: { frame: FrameMeta; aspectRatio: number }) {
  const geometry = rungGeometry(frame.rung);
  const stops = TIER_GRADIENT[frame.tier === 'gold' ? 'bronze' : frame.tier];
  // Único por instancia, no solo por marco: la app mantiene montadas varias
  // pantallas a la vez (las pestañas no se desmontan al cambiar), así que dos
  // `FrameOverlay` con el mismo marco equipado (cabecera y personaje grande de
  // Inicio, Duelos, Perfil...) coexisten en el DOM. Un id fijo tipo
  // `frame-metal-${frame.id}` chocaba entre todas ellas — `<linearGradient>`
  // con id duplicado hace que el navegador resuelva el degradado contra la
  // que sea que quede primera en el documento, y el marco de las demás se
  // queda sin trazo en cuanto esa primera se oculta o se reordena.
  const instanceId = useId();
  const metalId = `frame-metal-${frame.id}-${instanceId}`;
  const glowId = `frame-glow-${frame.id}-${instanceId}`;

  const shimmerDashoffset = useShimmerValue(frame.animated);
  const glowOpacity = useGlowValue(frame.animated);

  // Alto fijo en 100, ancho a la proporción real de la caja — ver el
  // comentario grande en `src/lib/frames.ts` sobre por qué esto no tuerce
  // nada ni hace falta re-escalar grosores de trazo o radios.
  const viewBoxWidth = 100 * aspectRatio;
  const center = viewBoxWidth / 2;
  const marginX = 3 * aspectRatio;
  const ringWidth = 94 * aspectRatio;
  const [pathTL, pathTR, pathBR, pathBL] = cornerCurvePaths(viewBoxWidth);

  return (
    <Svg viewBox={`0 0 ${viewBoxWidth} 100`} width={BLEED} height={BLEED} style={styles.bleed}>
      <Defs>
        <LinearGradient id={metalId} x1="0" y1="0" x2="1" y2="1">
          {stops.map((color, index) => (
            <Stop key={color} offset={index / (stops.length - 1)} stopColor={color} />
          ))}
        </LinearGradient>
        {frame.animated ? (
          <RadialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={stops[0]} stopOpacity={0.9} />
            <Stop offset="100%" stopColor={stops[0]} stopOpacity={0} />
          </RadialGradient>
        ) : null}
      </Defs>

      {frame.animated ? (
        <AnimatedCircle cx={center} cy={50} r={70} fill={`url(#${glowId})`} opacity={glowOpacity} />
      ) : null}

      <Rect
        x={marginX}
        y={4}
        width={ringWidth}
        height={94}
        rx={OUTER_CORNER_RADIUS}
        fill="none"
        stroke="rgba(0,0,0,0.55)"
        strokeWidth={geometry.shadowStrokeWidth}
      />
      <Rect
        x={marginX}
        y={3}
        width={ringWidth}
        height={94}
        rx={OUTER_CORNER_RADIUS}
        fill="none"
        stroke={`url(#${metalId})`}
        strokeWidth={geometry.outerStrokeWidth}
      />

      {geometry.midRing ? (
        <Rect
          x={geometry.midRing.inset * aspectRatio}
          y={geometry.midRing.inset}
          width={geometry.midRing.size * aspectRatio}
          height={geometry.midRing.size}
          rx={geometry.midRing.radius}
          fill="none"
          stroke={`url(#${metalId})`}
          strokeWidth={geometry.midRing.strokeWidth}
        />
      ) : null}

      {geometry.innerRing ? (
        <Rect
          x={geometry.innerRing.inset * aspectRatio}
          y={geometry.innerRing.inset}
          width={geometry.innerRing.size * aspectRatio}
          height={geometry.innerRing.size}
          rx={geometry.innerRing.radius}
          fill="none"
          stroke={`url(#${metalId})`}
          strokeWidth={geometry.innerRing.strokeWidth}
        />
      ) : null}

      {frame.animated ? (
        <AnimatedRect
          x={marginX}
          y={3}
          width={ringWidth}
          height={94}
          rx={OUTER_CORNER_RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={3}
          strokeDasharray={SHIMMER_DASH}
          strokeLinecap="round"
          strokeDashoffset={shimmerDashoffset}
        />
      ) : null}

      <G stroke={`url(#${metalId})`} strokeWidth={geometry.cornerCurveStrokeWidth} fill="none" strokeLinecap="round">
        <Path d={pathTL} />
        <Path d={pathTR} />
        <Path d={pathBR} />
        <Path d={pathBL} />
      </G>

      {geometry.cornerBadge ? (
        <G fill={`url(#${metalId})`} opacity={0.28}>
          {cornerBadgeCenters(viewBoxWidth).map((corner) => (
            <Rect
              key={`${corner.x}-${corner.y}`}
              x={-5}
              y={-5}
              width={10}
              height={10}
              transform={`translate(${corner.x},${corner.y}) rotate(45)`}
            />
          ))}
        </G>
      ) : null}

      {geometry.chamferCount > 0 ? (
        <G stroke={`url(#${metalId})`} strokeWidth={geometry.chamferStrokeWidth} strokeLinecap="round">
          {chamferLines(geometry.chamferCount, viewBoxWidth).map((line) => (
            <Line key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </G>
      ) : null}

      {geometry.tickPositions.length > 0 ? (
        <G stroke={`url(#${metalId})`} strokeWidth={geometry.tickStrokeWidth}>
          {tickLines(geometry.tickPositions, viewBoxWidth).map((line) => (
            <Line key={`${line.x1}-${line.y1}-${line.x2}-${line.y2}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </G>
      ) : null}

      {geometry.crest ? <Crest metalId={metalId} center={center} /> : null}
    </Svg>
  );
}

/** Remate en diamante arriba y abajo — solo el escalón 5. */
function Crest({ metalId, center }: { metalId: string; center: number }) {
  return (
    <>
      <Rect x={-3} y={-3} width={6} height={6} transform={`translate(${center},2) rotate(45)`} fill="none" stroke={`url(#${metalId})`} strokeWidth={1.4} />
      <Path d={`M${center - 14},6 L${center - 6},1`} stroke={`url(#${metalId})`} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Path d={`M${center + 14},6 L${center + 6},1`} stroke={`url(#${metalId})`} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Rect x={-3} y={-3} width={6} height={6} transform={`translate(${center},98) rotate(45)`} fill="none" stroke={`url(#${metalId})`} strokeWidth={1.4} />
      <Path d={`M${center - 14},94 L${center - 6},99`} stroke={`url(#${metalId})`} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      <Path d={`M${center + 14},94 L${center + 6},99`} stroke={`url(#${metalId})`} strokeWidth={1.4} fill="none" strokeLinecap="round" />
    </>
  );
}

/**
 * "Reducir movimiento" del sistema. No hay hook nativo de RN para esto (solo
 * `AccessibilityInfo`, basado en callback) — en web puede no existir la API
 * en absoluto, de ahí el `?.` y el `catch` silencioso.
 */
function useReducedMotionPref(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {});

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/** El brillo que recorre el borde. Solo corre si `active` y sin "reducir movimiento". */
function useShimmerValue(active: boolean) {
  const reducedMotion = useReducedMotionPref();
  const plays = active && !reducedMotion;
  // Inicializador perezoso de `useState`, no `useRef(...).current`: el
  // linter del React Compiler no deja leer un ref durante el render, y
  // `progress.interpolate(...)` de abajo lo hace.
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!plays) {
      progress.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: SHIMMER_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();

    return () => loop.stop();
  }, [plays, progress]);

  return progress.interpolate({ inputRange: [0, 1], outputRange: [0, SHIMMER_TRAVEL] });
}

/** El resplandor de fondo, respirando despacio. Fijo si "reducir movimiento". */
function useGlowValue(active: boolean) {
  const reducedMotion = useReducedMotionPref();
  const plays = active && !reducedMotion;
  const [opacity] = useState(() => new Animated.Value(plays ? 0.4 : 0.6));

  useEffect(() => {
    if (!plays) {
      opacity.setValue(0.6);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.95, duration: GLOW_PULSE_DURATION_MS, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.4, duration: GLOW_PULSE_DURATION_MS, useNativeDriver: false }),
      ]),
    );
    loop.start();

    return () => loop.stop();
  }, [plays, opacity]);

  return opacity;
}

const styles = StyleSheet.create({
  rig: {
    position: 'relative',
  },
  bleed: {
    position: 'absolute',
    top: BLEED_OFFSET,
    left: BLEED_OFFSET,
    // Prop `pointerEvents` suelta, deprecada por RN: el marco es puro
    // adorno, no debe robarle el toque a lo que haya debajo (el "Equipar"
    // de la vista previa, la foto misma).
    pointerEvents: 'none',
  },
});
