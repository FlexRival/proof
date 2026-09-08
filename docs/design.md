# Sistema de diseño de Prooffit

Referencia autoritativa del lenguaje visual de la app: paleta, tokens
semánticos y las reglas para usarlos. Es la contraparte legible de
`src/constants/colors.ts`, que es la que de verdad corre.

**Las dos son la misma fuente de verdad en dos formatos.** Si cambias un
valor en uno, cambia el otro en el mismo commit. Después de tocar
`colors.ts`, ejecuta `pnpm check:contrast` — falla la build si un par
texto/fondo no cumple WCAG 2.1, o si añadiste un token y no lo clasificaste
en el script.

## Regla para quien escribe código (humano o IA)

**Ningún componente hardcodea un color.** Ni un hex, ni un `rgba(...)`, ni
literal alguno con backgroundColor/color/borderColor. Siempre a través de:

- `Colors` (tokens semánticos: `theme.text`, `theme.surface`,
  `theme.primary`...) vía `useTheme()`, o los props `type`/`themeColor` de
  `ThemedView`/`ThemedText`.
- `Palette` (valores en bruto) solo para paradas de degradado o config
  nativa que no puede importar TypeScript (`app.json`).
- `Gradients` para cualquier relleno con degradado.

Si una pantalla necesita un color/rol que no existe abajo, **no te lo
inventes**: para y pregunta. Este documento es exhaustivo a propósito —
que falte algo es una señal de que hay que ampliarlo, no de rellenar el
hueco a ojo.

## Decisión: tema único, oscuro

Prooffit no tiene modo claro. `Colors` es un solo objeto (con la clave
`dark` conservada por compatibilidad con `check-contrast.mjs`, que itera
`Object.entries(Colors)`; no implica que vaya a haber una clave `light`).
Si algún día se añade un tema claro, es ampliar esa clave, no rediseñar el
tipo `ThemeColor`.

`app.json` fija `userInterfaceStyle: "dark"` y el `backgroundColor` del
splash screen en `#08090C` (el mismo valor que `Palette.frame`, copiado a
mano porque JSON no puede importar de `colors.ts`) para que el cromo
nativo (teclado, splash) no desentone. Si `Palette.frame` cambia, actualiza
`app.json` en el mismo commit.

## Superficies

Pila de elevación, de más hundida a más elevada.

| Rol (diseño)     | Token (`Colors`)              | Valor                     | Uso |
|-------------------|-------------------------------|---------------------------|-----|
| Void               | *(solo `Palette.void`, sin token de componente)* | `#05060A` | Fondo de ventana/splash a nivel nativo (`app.json`) y `shadowColor` de `Elevation` en `theme.ts`. Sin token semántico propio porque no es un fondo de pantalla. |
| Frame              | `background`                  | `#08090C`                 | Fondo de pantalla. |
| Surface            | `surfaceSunken`                | `#101219`                 | Superficie hundida: search, reglas, stat sutil. |
| Card               | `surface`                      | `#13151C`                 | Card estándar. |
| Raised             | `surfaceRaised`                 | `#1B1E27`                 | Card elevada / seleccionada. |
| Dock               | `dock`                          | `rgba(17, 19, 26, 0.94)`  | Barra de navegación inferior. |
| Locked             | `locked`                        | `#0E1017`                 | Fondo de slot bloqueado (logro/ítem sin desbloquear). |
| Pista de XP        | `xpTrack`                       | `rgba(255, 255, 255, 0.07)` | Parte vacía de la barra de XP. **Medida** como blanco al 7 % sobre la superficie (mismo valor que `border`), no como un gris opaco. |
| Pista de barra     | `meterTrack`                    | `rgba(255, 255, 255, 0.10)` | Parte vacía de las barras lisas (objetivo de pasos, lados del duelo). **Medida** sobre `Captura3.png`: #2C2E33 sobre la card #13151C da 0.106 / 0.107 / 0.101 por canal — alfa, no un gris opaco. Más clara que la pista de XP. |

`backgroundElement` / `backgroundSelected` son tokens heredados del scaffold
de Expo, hoy con uso real: fondo/selección de los botones de la barra de
tabs (`app-tabs.tsx`, `app-tabs.web.tsx`). Mapeados a `surfaceSunken` y
`surfaceRaised` respectivamente. Cuando se rediseñe la barra de tabs con su
propio lenguaje visual (Power como indicador de tab activa, ver más abajo),
es razonable que estos dos tokens cambien o desaparezcan.

### Superficies teñidas

Un chip no va sobre `surface` a pelo: lleva encima una capa de color de
marca. Los valores están **medidos píxel a píxel sobre la lámina de
componentes**, no elegidos a ojo.

| Rol            | Token (`Colors`)   | Valor                         | Sobre `surface` da |
|-----------------|---------------------|--------------------------------|--------------------|
| Power tint       | `primarySurface`    | `rgba(198, 255, 74, 0.12)`    | `#293122` — chip `LV 12` |
| Rival tint       | `rivalSurface`      | `rgba(255, 92, 56, 0.12)`     | `#301D20` — chip de racha |
| Neutral tint     | `neutralSurface`    | `rgba(255, 255, 255, 0.05)`   | `#1F2128` — chip `● Online` |

Esto cierra el hueco de `primarySurface` que este documento tenía abierto:
ya no hay que inventarlo, está medido.

## Acentos

| Rol (diseño)       | Token (`Colors`)                  | Valor        | Uso |
|----------------------|------------------------------------|---------------|-----|
| Power                 | `primary`, `xp`                    | `#C6FF4A`     | El jugador, XP, botón primario, tab activa. |
| Power Bright          | *(`Palette.powerBright`)*          | `#E4FF95`     | Extremo claro del degradado. Ver nota de ambigüedad abajo. |
| Power Bright (alt)    | *(`Palette.powerBrightAlt`)*       | `#E2FF8E`     | Segundo valor claro dado en el diseño original; sin contexto de cuándo usar este en vez del anterior. |
| Power Deep            | `primarySolid`                      | `#B4F02E`     | Extremo oscuro del degradado; relleno sólido de botón primario. |
| Power Mid             | `xpSolid`                           | `#8CE03C`     | Inicio de las barras de XP. |
| Power Flash           | *(`Palette.powerFlash`)*           | `#EEFFB8`     | Flash del level up. Sin token semántico: se usa directo de `Palette` en `LevelUpBadge`, su único consumidor. |
| On Power              | `onPrimary`, `onXp`                | `#0A0C05`     | Texto/ícono sobre superficies de Power. |
| Rival                 | `defeat`                            | `#FF5C38`     | Rival, derrotas, badges de aviso. |
| Pasos                 | `steps`                             | `#F1F2F6`     | **Neutro a propósito, no Power.** Cifra de pasos y relleno de su barra de objetivo. Ver § Pasos. |

### Degradados (`Gradients`)

No son un token de `Colors` (un color de fondo/texto es un string; un
degradado es un array de paradas). Viven en `Gradients`, en `colors.ts`:

- `Gradients.xp = [powerMid, power]` — relleno de la barra de XP, en
  horizontal (izquierda → derecha). **Medido**: la barra va de `#8DE03C` a
  `#C3FE49`, es decir Power Mid → Power. No termina en Power Bright, como se
  supuso antes de tener las capturas.
- `Gradients.power = [powerDeep, powerBright]` — **sin consumidor**. Se
  mantiene porque venía de la paleta original, pero el botón primario del
  diseño es **plano**: medido da `#C6FF4A` idéntico arriba, en medio y abajo.
  Si acaba sin usarse en ninguna pantalla, bórralo.

## Texto

| Rol (diseño) | Token (`Colors`) | Valor     | Uso |
|---------------|--------------------|------------|-----|
| Text            | `text`              | `#F1F2F6`  | Primario. |
| Text Soft       | `textSecondary`     | `#B7BCC8`  | Nombres secundarios. |
| Text Muted      | `textMuted`, `info` | `#808594`  | Labels, metadatos. También cubre "info / duelo pendiente" — ver huecos. |
| Text Dim        | `textDim`           | `#4E545F`  | Labels de sección, contenido bloqueado. Contraste bajo a propósito. |
| Nav Idle        | `navIdle`           | `#8A90A0`  | Pestaña inactiva de la barra de navegación. |

## Pasos

Los pasos **no llevan color de marca**. La lámina de fundamentos es explícita:

> Steps are shown as activity and duel progress. Never as a live XP ticker.

Teñir de Power la cifra de pasos o su barra los haría leer como XP, que es
justo lo que el diseño evita: el XP solo se gana ganando un duelo. Por eso
`steps` apunta a `Palette.text` (blanco) y no a `primary`, aunque el valor
coincida con `text` — el nombre propio existe para que nadie lo «arregle»
pasándolo a verde.

Medido en `Captura3.png`: la cifra `8,742` y el relleno de su barra de
objetivo dan **#F1F2F5**; la parte vacía, **#2C2E33** sobre la card.

Las barras del duelo sí van teñidas —tú en Power, el rival en Rival— porque
ahí el color no dice «esto es XP», dice quién va ganando. Comparten la pista
`meterTrack` con la de pasos.

**Ir por detrás no se pinta de rojo.** En la lista de duelos (`Captura5.png`)
la fila en la que vas perdiendo lleva la barra en gris —medido **#767C8C**, el
Text Muted original del diseño, de ahí el tono `muted` de `MeterBar`— y
reserva el Rival para la cifra (`BEHIND 1,204`). Solo la barra partida del
duelo destacado enfrenta Power contra Rival directamente.

**Sobre la pista, una inconsistencia del propio diseño:** la barra de pasos la
pinta a blanco 10 % y las filas de duelo a blanco 7 %. La diferencia sobre
casi negro es imperceptible, así que aquí se estandariza en el 10 % de
`meterTrack` en vez de arrastrar dos tokens para lo mismo.

## Bordes

Todos translúcidos: el contraste depende de lo que haya debajo, así que
`check-contrast.mjs` los exime (mismo criterio que ya aplicaba a `overlay`).

| Rol (diseño)        | Token (`Colors`)     | Valor                        | Uso |
|-----------------------|------------------------|--------------------------------|-----|
| Hairline                | `border`                | `rgba(255, 255, 255, 0.07)`   | Borde de card. |
| Hairline Strong         | `borderStrong`          | `rgba(255, 255, 255, 0.14)`   | Botón secundario. |
| Power Edge              | `primaryEdge`           | `rgba(198, 255, 74, 0.24)`    | Card destacada. |
| Power Edge (seleccionada)| `primaryEdgeStrong`    | `rgba(198, 255, 74, 0.40)`    | Card destacada + seleccionada. |
| Rival Edge              | `rivalEdge`             | `rgba(255, 92, 56, 0.24)`     | Card de rival. |

**Consecuencia de que los bordes ahora lleven alfa:** ya no hay un borde
opaco que garantice 3:1 (WCAG 1.4.11) para transmitir "esto es
interactivo". La afordancia de un botón tiene que venir del relleno o del
label, no del borde. El check de "borde interactivo" que existía en
`check-contrast.mjs` se quitó por esto — ver el propio script.

## Tipografía

Dos familias y nada más. Se cargan con `expo-font` desde
`src/constants/fonts.ts` y se declaran variante a variante en `Typography`
(`src/constants/theme.ts`).

| Familia            | Token (`FontFamily`) | Archivo                   | Uso |
|--------------------|----------------------|---------------------------|-----|
| Chakra Petch 700    | `display`            | `ChakraPetch_700Bold`      | Cifras, niveles, títulos, labels de botón. |
| Space Grotesk 400   | `body`               | `SpaceGrotesk_400Regular`  | Texto corrido. |
| Space Grotesk 500   | `bodyMedium`         | `SpaceGrotesk_500Medium`   | Texto de interfaz, labels, metadatos. |
| Mono del sistema    | `mono`               | —                         | Solo la fórmula `XP = floor(steps / 10)`. |

**En este diseño la familia es el peso.** No hay Space Grotesk Bold: lo que en
otro sistema sería «poner esto en negrita» aquí es «subir esto a Chakra Petch
700». Por eso ninguna variante con familia de marca declara `fontWeight`:
declararlo haría que Android sintetizara una negrita falsa encima de un
archivo que ya es Bold.

### Escala (`Typography`)

| Variante      | Familia     | Tamaño / interlineado   | Uso |
|---------------|-------------|-------------------------|-----|
| `display`     | Chakra 700  | 56 / 58, -1 tracking    | Cifra protagonista del level up. |
| `title`       | Chakra 700  | 48 / 52                 | Título de pantalla (`DUELS`, `FRIENDS`). |
| `subtitle`    | Chakra 700  | 32 / 44                 | Titular de onboarding. |
| `heading`     | Chakra 700  | 24 / 30                 | `LEVEL 12`, `YOU WIN`. |
| `subheading`  | Chakra 700  | 20 / 26                 | Cabecera de bloque. |
| `numeric`     | Chakra 700  | 20 / 24                 | Contadores (`tabular-nums`: los dígitos no bailan al animarse). |
| `bodyBold`    | Chakra 700  | 16 / 24                 | Énfasis dentro del cuerpo. |
| `smallBold`   | Chakra 700  | 14 / 20                 | Énfasis en texto pequeño. |
| `button`      | Chakra 700  | 15 / 20, +1.2 tracking  | Label de botón, siempre en mayúsculas. |
| `default`     | Grotesk 400 | 16 / 24                 | Texto corrido. |
| `small`       | Grotesk 500 | 14 / 20                 | Texto secundario de card. |
| `caption`     | Grotesk 500 | 12 / 16                 | Metadatos, label de chip. |
| `label`       | Grotesk 500 | 11 / 14, +0.8 tracking  | Rótulos de sección en mayúsculas (`XP PROGRESS`). |
| `link`        | Grotesk 500 | 14 / 30                 | Enlaces de texto (`Skip`). |
| `code`        | Mono        | 12 / 18                 | Fórmula de XP. |

Las fuentes se cargan una sola vez, en `src/app/_layout.tsx`: el layout raíz
no pinta nada hasta que están listas, y como el splash nativo sigue delante no
se ve ningún hueco. Si la carga falla, la app se pinta con la fuente del
sistema y lo avisa por consola en vez de quedarse en negro para siempre.

## Primitivos

Los componentes de la card COMPONENTS del diseño, en `src/components/`,
ordenados por diseño atómico. Una pantalla debería poder montarse con estos
sin volver a escribir a mano un `borderRadius` ni un `borderColor`.

| Componente          | Archivo                              | Variantes |
|---------------------|--------------------------------------|-----------|
| `Button`            | `atoms/button.tsx`                   | `primary` (degradado Power), `secondary` (contorno), `ghost` |
| `Card`              | `atoms/card.tsx`                     | `default`, `raised`, `sunken`, `highlight`, `rival`, `locked` |
| `Chip`              | `atoms/chip.tsx`                     | `neutral`, `primary`, `rival`, con punto de estado opcional |
| `MeterBar`          | `atoms/meter-bar.tsx`                | Barra lisa sin rótulos: `steps`, `power`, `rival`, `muted` |
| `SegmentedControl`  | `molecules/segmented-control.tsx`    | Filtro de pantalla (ACTIVE / PENDING / HISTORY), controlado |
| `Notice`            | `molecules/notice.tsx`               | `primary`, `rival`, `info` |
| `XpBar`             | `molecules/xp-bar.tsx`               | Rótulo + `2,450 / 3,000` + pista con degradado XP |
| `LevelUpBadge`      | `molecules/level-up-badge.tsx`       | Transición `11 → 12` animada de la subida de nivel |

Superficies medidas en la lámina, por si se rehacen estos componentes:
`Notice` y el segmento activo de `SegmentedControl` van sobre `#1B1E27`
(`surfaceRaised`); la pista del `SegmentedControl` va sobre `#08090C`
(`background`), no sobre `surfaceSunken`.

Los labels de `Button` van en mayúsculas siempre: es lo que hace la variante
`button` de la escala y el diseño no tiene ni un botón en minúsculas. El
`Skip` en minúscula del onboarding es un enlace (`link`), no un botón.

`XpBar` recibe `value` / `max` ya calculados, no el XP total: la aritmética
de nivel vive solo en `levelProgress()` (`src/lib/xp.ts`), que espeja el SQL.
El relleno se anima con `Motion.duration.base` cuando el valor cambia. Con
`revealOnMount` arranca vacía y se llena sola al montar, para las pantallas
de celebración donde el barrido es parte de lo que se celebra.

`LevelUpBadge` pinta el nivel viejo en `textDim`, la flecha en `textMuted` y
el nuevo en `display` sobre `primary`, con entrada en `Motion.spring.bouncy`
y un flash a `Palette.powerFlash`. **Respeta «reducir movimiento» del
sistema** (`useReducedMotion()` de Reanimated): con esa preferencia activada
la cifra aparece ya asentada, sin rebote ni flash. Cualquier celebración
nueva a pantalla completa debería hacer lo mismo.

Todavía no es primitivo el render del avatar (KAN-19). La pantalla de subida
de nivel (`src/app/level-up.tsx`) ya le reserva el sitio con una `Card`
cuadrada vacía, para que al llegar KAN-19 sea rellenar el hueco y no rehacer
el layout.

## Huecos y decisiones que tomé sin dato explícito

### Cerrados midiendo las capturas (2026-09-04)

No hizo falta inventar nada: los valores salen de muestrear los píxeles de
`capturadiseño/` (carpeta local, fuera de git).

- **`streak` (racha)** → **Rival**, no Power. El chip `🔥 9` va con relleno
  Rival al 12 % y texto `#FF5C33`.
- **`primarySurface`** → existe, `rgba(198, 255, 74, 0.12)`, más sus
  hermanos `rivalSurface` y `neutralSurface`. Ver § Superficies teñidas.
- **Final del degradado de XP** → Power, no Power Bright.
- **Dirección del degradado de XP** → horizontal, izquierda a derecha.
- **Botón primario** → plano, sin degradado.
- **`xpTrack`** → blanco al 7 %, no `locked`.
- **Fondo de pantalla** → `#08090C` (`Frame`) confirmado dentro de los
  mockups de móvil. El `#05060A` que se ve alrededor es el lienzo de la
  lámina, no la app.

### Siguen abiertos

- **`victory` (duelo ganado)** → reusa `Power`. La pantalla de victoria del
  diseño es toda verde, así que encaja, pero no hay un token dedicado.
- **`info` (duelo pendiente / informativo)** → reusa `Text Muted`, un gris
  neutro, en vez de inventar un color de marca nuevo.
- **`overlay` (velo de modal)** → `rgba(5, 6, 10, 0.72)`, derivado de
  `Void`. No sale en ninguna captura; sigue el patrón que ya usaba la app.
- **Cómo se llama `#08090C`** — la lámina lo etiqueta `VOID`; aquí `Void`
  es `#05060A` y `#08090C` es `Frame`. Los valores no chocan, los nombres
  sí.
- **Fondo del icono adaptativo de Android** — `app.json` sigue con
  `#E6F4FE`, el azul claro del scaffold de Expo, que no está en la paleta y
  no aparece en ninguna captura. **Hace falta el valor de marca.**
- **Textura rayada del avatar** — el placeholder del personaje son rayas
  diagonales (medidas: base `#181C1D`, raya `#2C3622`). No es un token de
  color, es un patrón; se resuelve en KAN-19.
- **Power Bright vs Power Bright (alt)** — ver tabla de Acentos.

## Ejemplo de uso en un componente

```tsx
import { useTheme } from '@/hooks/use-theme';
import { ThemedView, ThemedText } from '@/components/themed-view';

function DuelCard() {
  const theme = useTheme();
  return (
    <ThemedView type="surface" style={{ borderColor: theme.primaryEdge, borderWidth: 1 }}>
      <ThemedText themeColor="primary">+120 XP</ThemedText>
    </ThemedView>
  );
}
```
