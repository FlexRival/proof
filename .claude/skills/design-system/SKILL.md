---
name: design-system
description: >-
  Use when writing, editing, or reviewing any UI code in this project —
  components, screens, styles, native chrome in app.json — or whenever a
  message changes a visual/design decision (a color, a spacing rule, a new
  role like "racha" or "info"). Enforces that every color comes from the
  Prooffit design system instead of a hardcoded literal, and that
  docs/design.md is updated to match, not just src/constants/colors.ts.
---

# Sistema de diseño de Prooffit

Dos archivos son la fuente de verdad, y **tienen que decir lo mismo
siempre**:

- **`docs/design.md`** — la referencia legible: qué token existe, qué
  valor tiene, para qué se usa, qué huecos/decisiones quedaron pendientes.
- **`src/constants/colors.ts`** — el código que corre. Exporta `Palette`
  (valores en bruto), `Colors` (tokens semánticos) y `Gradients` (paradas
  de degradado).

## Regla 1 — nunca un color hardcodeado

Ningún componente escribe un hex o un `rgba(...)` literal en
`backgroundColor`, `color`, `borderColor`, `shadowColor`, etc. Siempre a
través de:

- `useTheme()` (o los props `type`/`themeColor` de
  `ThemedView`/`ThemedText`) para tokens semánticos: `theme.text`,
  `theme.surface`, `theme.primary`...
- `Palette` importado de `@/constants/theme` solo para paradas de
  degradado o casos que de verdad no tienen token semántico (p. ej. un
  brillo puntual como `Palette.powerFlash`).
- `Gradients` para cualquier relleno con degradado.
- Config nativa que no puede importar TypeScript (`app.json`) copia el hex
  a mano — y ese valor tiene que coincidir con el `Palette` del que salió;
  decláralo en un comentario de `design.md`, no solo en el JSON.

Antes de escribir un valor de color, lee `docs/design.md`. Si el rol que
necesitas no está documentado ahí (ni como token activo ni como hueco
pendiente), **no te lo inventes**: para y pregunta al usuario el valor
exacto. Inventar un color "razonable" es exactamente lo que este sistema
existe para evitar.

## Regla 2 — `docs/design.md` se actualiza SIEMPRE que cambie una decisión de diseño

No solo cuando se toca `colors.ts`. Si en la conversación se decide o se
cambia cualquier cosa de diseño — un valor de color, qué token cubre qué
rol, que un hueco pendiente ya se resolvió, una regla de espaciado,
tipografía, radios, lo que sea — `design.md` se actualiza en el mismo
turno, para que nunca quede desincronizado de lo que realmente se decidió.
Esto aplica aunque el pedido no mencione el archivo explícitamente (p. ej.
"vamos a usar Rival también para los badges de warning" implica editar
`design.md`, no solo el código si lo hay).

## Regla 3 — tras tocar `colors.ts`, correr el validador de contraste

```
pnpm check:contrast
```

Verifica cada par texto/fondo contra WCAG 2.1 y obliga a clasificar todo
token nuevo en `scripts/check-contrast.mjs` (falla a propósito si no lo
haces). Si falla un par:

- Si el texto es normal (se espera que se lea bien): es un fallo real,
  hay que corregir el valor o preguntar al usuario cómo ajustarlo — no
  bajar el mínimo ni eximirlo sin más.
- Si el token es deliberadamente de bajo contraste (p. ej. una etiqueta
  "bloqueada"/disabled), se puede eximir en `EXEMPT`, pero con un
  comentario que explique por qué, igual que ya está documentado para
  `textDim` y para los tokens con alfa (`border`, `overlay`, etc.).

`scripts/check-contrast.mjs` carga `colors.ts` directamente con Node, así
que ese archivo **no puede tener imports**. Necesita Node 22.18+ (type
stripping de `.ts` sin flag); si `pnpm check:contrast` falla con
`ERR_UNKNOWN_FILE_EXTENSION`, la versión de Node instalada es más vieja de
lo que pide `AGENTS.md` y hay que actualizarla, no añadir flags al script.

## Decisión vigente: tema único, oscuro

Prooffit no tiene modo claro (`Colors` es un solo objeto, sin
`Colors.light`). No reintroduzcas branching de `useColorScheme()` para
elegir colores de la app a menos que el usuario pida explícitamente volver
a un tema claro — ver `docs/design.md` § Decisión: tema único, oscuro.
