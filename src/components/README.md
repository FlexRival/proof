# Componentes — diseño atómico

Tres niveles. La regla de en cuál va un componente **no es cómo se ve, es qué
compone**:

| Nivel        | Qué es                                              | Puede importar        |
|--------------|-----------------------------------------------------|-----------------------|
| `atoms/`     | Pieza indivisible: no se puede partir y seguir sirviendo | Nada de `components/` salvo otro átomo |
| `molecules/` | Un puñado de átomos con **un solo trabajo**          | Átomos                |
| `organisms/` | Una sección completa de pantalla, con su propia lógica de presentación | Átomos y moléculas    |

**Nunca se importa hacia arriba.** Un átomo que necesita una molécula está mal
clasificado: o se sube el átomo de nivel, o se baja lo que necesita.

## Qué hay hoy

- **`atoms/`** — `ThemedText`, `ThemedView`, `Button`, `Card`, `Chip`,
  `MeterBar`, `AnimatedSplashOverlay`.
- **`molecules/`** — `TextField`, `SearchField`, `SegmentedControl`,
  `StatTile`, `Notice`, `XpBar`, `LevelUpBadge`, `PlanOption`,
  `ProfilePhoto` (la foto de perfil de un usuario, o el hueco reservado si no
  ha subido ninguna; la usan la cabecera de Perfil, la fila de Ajustes y los
  resultados de buscar amigos).
- **`organisms/`** — `XpProgress` (nivel + `XpBar`), `EmptyState`
  (ilustración + copy + `Button`), `AppTabs` (la barra de pestañas).

## Dónde están las *pages* — y por qué no están aquí

Las pantallas viven en `src/app/`, y **ahí se quedan**: esa carpeta no es una
carpeta cualquiera, es el enrutado de Expo Router. El nombre de cada archivo
*es* la URL, así que moverlas a `components/pages/` no las reordenaría: las
borraría del router y dejaría la app sin rutas.

Lo mismo con los *templates*: ProofIt todavía no tiene ninguno. El día que dos
pantallas compartan esqueleto, el sitio es `templates/` — un componente que
recibe las zonas por props o `children` y no sabe nada de datos.

## Sin barriles

No hay `index.ts` que reexporte. Se importa el archivo directamente
(`@/components/atoms/button`), para que la ruta del import diga a qué nivel
pertenece lo que estás usando y un ciclo de dependencias se vea a simple vista.

## Extensiones `.web.tsx`

`animated-icon` y `app-tabs` tienen variante web al lado de la nativa. Metro
elige por plataforma; el import no lleva extensión y no cambia.
