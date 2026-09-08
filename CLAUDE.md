@AGENTS.md

# Prooffit — Contexto del Proyecto

## Visión General
Prooffit es una app RPG móvil desarrollada con Expo (React Native) donde los pasos reales diarios del usuario suben de nivel a su personaje y le permiten retar a sus amigos en duelos 1v1 basados en su actividad física real.

## Core Loop & Funcionalidades Principales
- **Conteo de Pasos & XP:** Tracking de pasos diarios (mediante Podómetro / sensores del dispositivo) convertidos automáticamente en XP para subir de nivel al personaje.
- **Sistema de Progresión:** Barra de progreso de XP y pantalla de subida de nivel. Sin avatar/personaje RPG visual: se probó un sistema de cosméticos equipables y se descartó (ver Notas de implementación).
- **Duelos 1v1 Competitivos:** Comparación de pasos y XP acumulado contra amigos en períodos fijos (ej. semanal) consultados en Supabase.
- **Clanes & Guerras de Clanes:** Grupos con líder, oficiales y miembros. La gente pide entrar (líder/oficiales aceptan) o entra con un código de invitación compartible; se puede expulsar. El líder inicia guerras de clanes (pasos sumados del roster congelado); ganar sube `rank_points` y el tier del clan. Leaderboard de clanes.
- **Factor Viral / Social:** Generación de imágenes compartibles de duelos y nivel del personaje para redes sociales (`react-native-view-shot`).
- **Monetización (RevenueCat):**
  - *Gratis:* Por definir
  - *Pro:* Por definir.

## Stack Tecnológico
- **Frontend:** React Native con Expo (SDK actual), React Navigation, React Native Reanimated.
- **Backend:** Supabase (Auth, PostgreSQL con Row Level Security, Edge Functions en Deno/TypeScript).
- **Monetización:** SDK de RevenueCat (`react-native-purchases`).
- **NUNCA usar:** Librerías de React Web (`react-dom`, `div`, `span`, `framer-motion`). Usar exclusivamente componentes nativos (`View`, `Text`, `Image`).

## Estructura del Proyecto
- `src/`: Código fuente de la app Expo (pantallas, componentes, hooks, servicios).
- `supabase/`: Migraciones SQL y Edge Functions. **`supabase/SCHEMA.md` es la
  referencia autoritativa de la capa de datos** (tablas `profiles`, `step_logs`,
  `duels`, `clans` / `clan_members` / `clan_join_requests` / `clan_invites` /
  `clan_wars` / `clan_war_participants` / `friendships`; modelo anti-cheat;
  RPCs de duelos, clanes, guerras y amistades; rachas; rango de clanes). Léela
  antes de tocar `supabase/migrations/`.
- `docs/`: Investigación y decisiones de arquitectura pendientes.
  **`docs/conteo-de-pasos.md`** — de dónde salen los pasos: Google Fit está
  muerto, la vía es HealthKit + Health Connect, lo que eso obliga en build, y el
  hueco anti-cheat de `step_logs`.
  **`docs/healthkit-y-health-connect.md`** — cómo funcionan las dos por dentro:
  permisos, límites de histórico y las trampas (en iOS un permiso denegado es
  indistinguible de cero pasos). Léelos antes de escribir código de pasos.
  **`docs/design.md`** — referencia autoritativa del sistema de diseño (paleta,
  tokens semánticos, huecos pendientes). Contraparte legible de
  `src/constants/colors.ts`. Léela antes de escribir cualquier color en un
  componente; la skill `design-system` lo hace cumplir.
  **`docs/revenuecat.md`** — el lado cliente de la suscripción Pro: dónde ocurre
  la compra (store, vía SDK) vs dónde vive la verdad (`profiles.is_pro` en
  Supabase), las claves de env, el flujo `logIn` → compra → `revenuecat-reconcile`
  → recarga, y por qué el paywall va detrás del login. Léela antes de tocar
  `src/repositories/revenuecat/` o el paywall.
- `.claude/skills/`: Skills de desarrollo y seguridad (anti-leaks, UI, Supabase,
  sistema de diseño, patrón repositorio).

## Notas de implementación (estado actual)
- **XP:** solo se gana al ganar un duelo (`floor(pasos_ganador / 10)`), no por
  pasos diarios. Ver `supabase/SCHEMA.md`.
- **Pasos:** implementados (KAN-50). `src/lib/steps/` **lee** del teléfono
  (`expo-sensors`/CoreMotion en iOS, `react-native-health-connect` en Android)
  y `stepsRepository` **escribe** en el servidor por `sync_daily_steps_batch`;
  el hook `useSteps` los une y es lo que pinta la pantalla principal. La cifra
  que se enseña es siempre **la que guardó el servidor**, no la del móvil: el
  servidor recorta por `daily_step_cap()`. HealthKit sigue sin usarse (el
  podómetro ya cubre los 7 días que acepta el servidor). Todo esto son módulos
  nativos, así que **rompe Expo Go** y exige un development build (KAN-49).
  Ver `docs/conteo-de-pasos.md`.
- **Duelos y compartir:** el ciclo completo está conectado (KAN-32, KAN-31,
  KAN-34/35). `duelRepository` envuelve `request_duel` / `respond_to_duel` /
  `sync_duel_steps` / `resolve_duel`; `useDuels` cierra solo los duelos
  vencidos al abrir la app sin esperar al cron. La pantalla `/duel-result`
  enseña victoria **y derrota**, y su lámina 4:5 (`DuelShareCard`) es la vista
  que `react-native-view-shot` captura a 1080×1350 para compartir con
  `expo-sharing`. El cupo de duelos gratis llega como
  `DuelLimitReachedError` y abre el paywall, no un toast de error.
- **Sin clases de personaje.** Se descartaron: el esquema ya eliminó el enum
  `user_class` y la columna `avatar_class`, y los tokens de color de clase se
  quitaron del sistema de diseño.
- **Sin personaje RPG ni cosméticos.** Se construyó y probó un sistema
  completo de cosméticos equipables (catálogo, desbloqueo por nivel/Pro,
  `CharacterAvatar`) y se descartó por decisión de producto — nunca se hizo
  `supabase db push` de su migración, así que se borró sin más (ver
  `supabase/SCHEMA.md`, nota al principio). Los recuadros de avatar/personaje
  de las pantallas son huecos reservados del diseño (comentarios "KAN-19"),
  no un render real. La foto de perfil real (Ajustes) es un dato de cuenta
  aparte, sin relación con esto.
- **Diseño: tema único, oscuro.** No hay modo claro (`Colors` en
  `src/constants/colors.ts` no tiene `.light`). Paleta y reglas en
  `docs/design.md`.
- **Tipografía:** dos familias y nada más — **Chakra Petch 700** (cifras,
  niveles, títulos, botones) y **Space Grotesk 400/500** (cuerpo y labels).
  La familia es el peso: no hay Space Grotesk Bold, lo que sería negrita sube
  a Chakra. Se cargan en `src/app/_layout.tsx` desde `src/constants/fonts.ts`.
- **Primitivos de UI:** `Button`, `Card`, `Chip`, `SegmentedControl`, `XpBar`,
  `Notice`, `SearchField` (filtro de listas) y `TextField` (campo de
  formulario genérico: login, altas). Monta las pantallas con ellos antes de
  escribir un `borderRadius` a mano.
- **Componentes por diseño atómico.** `src/components/` está partido en
  `atoms/` (indivisibles: `ThemedText`, `ThemedView`, `Button`, `Card`,
  `Chip`, `MeterBar`, `AnimatedSplashOverlay`), `molecules/` (un puñado de
  átomos con un solo trabajo: `TextField`, `SearchField`, `SegmentedControl`,
  `StatTile`, `Notice`, `XpBar`, `LevelUpBadge`, `CharacterAvatar`) y
  `organisms/` (secciones completas: `XpProgress`, `EmptyState`, `AppTabs`).
  Un componente nuevo va al nivel de lo que compone, y **nunca importa hacia
  arriba** — un átomo no puede importar una molécula.
  Las pantallas de `src/app/` son las *pages*: no se mueven a una carpeta
  `pages/` porque esa carpeta **es** el enrutado de Expo Router y renombrarla
  cambiaría todas las rutas de la app. `src/components/README.md` tiene la
  regla completa.
- **Autenticación:** email/contraseña vía Supabase Auth
  (`src/app/login.tsx`), sin proveedores OAuth configurados todavía.
  `src/app/_layout.tsx` usa `Stack.Protected` para mostrar `login` o el
  resto de la app según haya sesión — nunca `router.replace` a mano tras un
  login/logout, el guard reacciona solo a `onAuthStateChange` vía
  `useProfile()`. `ProfileRepository` expone `signInWithPassword`/`signUp`/
  `signOut`; ninguna pantalla llama a `supabase.auth` directamente.
- **Clanes:** un usuario pertenece como mucho a **un** clan (`UNIQUE` en
  `clan_members.user_id`). Roles `LEADER` / `OFFICER` / `MEMBER`. Toda mutación
  pasa por RPCs `SECURITY DEFINER` (`create_clan`, `request_to_join_clan`,
  `respond_to_join_request`, `join_clan_with_invite`, `leave_clan`,
  `remove_clan_member`, `transfer_clan_leadership`, `set_clan_member_role`,
  `disband_clan`, …). Al salir el líder, el mando pasa al oficial más antiguo.
- **Guerras de clanes:** espejo de los duelos. `request_clan_war` (solo líder) →
  `respond_to_clan_war` congela el roster de ambos clanes en
  `clan_war_participants` → `sync_clan_war_steps` / `resolve_clan_war`. Los pasos
  se cuentan solo del roster congelado.
- **Rango de clanes:** `clans.rank_points` (solo servidor) sube/baja al resolver
  una guerra (placeholder `+25 / -15` con suelo 0, empate `+5`).
  `clan_tier_for_points()` da el tier; vista `clan_leaderboard` da la posición.
- **Amistades:** tabla `friendships` (par `requester_id`/`addressee_id`,
  estado `PENDING` → `ACCEPTED`/`DECLINED`/`CANCELLED`). Un índice único
  parcial impide una segunda solicitud o amistad activa entre el mismo par en
  cualquier dirección. Toda mutación pasa por RPCs `SECURITY DEFINER`
  (`send_friend_request`, `respond_to_friend_request`,
  `cancel_friend_request`, `remove_friend`). A diferencia de clanes, la tabla
  no es pública — solo la ven los dos implicados. Ver `supabase/SCHEMA.md` §13.
- **Legal y borrado de cuenta (KAN-53, parte de KAN-54/56):**
  `docs/legal.md` es la referencia — qué se hizo, qué falta y las respuestas
  exactas de los tres formularios de tienda. Los textos viven en
  `src/lib/legal/` (privacidad y términos, ES/EN, como **datos** y no JSX, para
  que la landing salga del mismo objeto) y se pintan en `/privacy` y `/terms`,
  **fuera de los dos `Stack.Protected`**: hay que poder leerlos sin cuenta, y en
  Android el diálogo de permisos de Health Connect abre `/privacy` desde fuera
  de la app. El borrado es `Ajustes → Cuenta → Borrar cuenta` →
  `profileRepository.deleteAccount()` → Edge Function `delete-account`; la RPC
  `prepare_account_deletion()` traspasa antes el liderazgo de clan porque
  `clans.leader_id` es `ON DELETE CASCADE` y si no se llevaría el clan entero
  por delante. **`LEGAL_CONTACT` en `src/lib/legal/types.ts` son placeholders
  sin rellenar y bloquean publicar.**
- **Estado de migraciones:** las 2 migraciones de clanes
  (`20260903150000_clans.sql`, `20260903150500_clan_wars.sql`), la de
  amistades (`20260904110000_friendships.sql`) y las de suscripciones
  (`20260906120000_subscriptions.sql`,
  `20260906121000_expire_subscriptions_cron.sql`) aún no se han hecho
  `supabase db push` al proyecto vinculado. Tampoco lo están la del anti-cheat
  de pasos (`20260906130000_step_sync_anticheat.sql`), la del email
  (`20260907120000_profile_email.sql`) ni la del borrado de cuenta
  (`20260907130000_account_deletion.sql`), que además necesita
  `supabase functions deploy delete-account`. Es KAN-48.
- **Suscripciones (RevenueCat):** un solo entitlement `pro` (Free vs Pro, sin
  tiers). RevenueCat es la fuente de verdad; el backend sincroniza el estado
  vía webhook. Tabla `subscriptions` + `subscription_events` (idempotencia);
  `profiles.is_pro` pasa a ser un **cache derivado** que solo mueve
  `refresh_is_pro()`. Edge Functions `revenuecat-webhook` (`verify_jwt=false`,
  valida el secreto `REVENUECAT_WEBHOOK_AUTH`) y `revenuecat-reconcile`
  (la app al arrancar). Qué más desbloquea Pro sigue **por definir** — la capa
  de datos no depende de ello. Ver `supabase/SCHEMA.md` §15. Requiere dar de
  alta a mano `REVENUECAT_WEBHOOK_AUTH` y `REVENUECAT_SECRET_API_KEY`
  (`supabase secrets set`).
- **SDK cliente de RevenueCat (KAN-9):** `react-native-purchases` integrado
  detrás del patrón repositorio. `subscriptionRepository` (contrato en
  `src/repositories/subscription-repository.ts`) tiene dos backends: RevenueCat
  para comprar/restaurar/ofertas (SDK nativo aislado en
  `src/repositories/revenuecat/`, con stub `.web.ts`) y Supabase para la verdad
  (`revenuecat-reconcile`, inyectado como `SubscriptionServerGateway`).
  `src/hooks/use-subscription-sync.ts` (montado en el layout raíz) hace
  `Purchases.logIn(uuid)` tras el login y reconcilia con el servidor al arrancar
  y en cada aviso del SDK. El estado Pro que mira la app sigue siendo
  `profiles.is_pro`, nunca el SDK.
  Para bloquear/desbloquear una función Pro en la UI:
  **`const { isPro, status, requirePro } = useSubscription()`**
  (`src/hooks/use-subscription.ts`) — lee `profiles.is_pro`, no toca el SDK;
  `requirePro(action)` corre `action` si es Pro o abre el paywall si no.
  Módulo nativo → **rompe Expo Go, exige development build** (KAN-49). Claves
  públicas del SDK en `.env.local`: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` /
  `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY`. Ver `docs/revenuecat.md`.
- **Paywall (UI de compra):** `src/app/paywall.tsx` compra y restaura de verdad.
  Los planes salen de la oferta activa de RevenueCat vía `usePaywall`
  (`src/hooks/use-paywall.ts`) — **la app no formatea ningún precio**, los
  da la store ya localizados; `src/lib/paywall.ts` solo calcula el ahorro
  relativo. Sin oferta (sin claves, en web, sin offering configurada) la
  pantalla dice «no disponible» en vez de enseñar cifras inventadas. Se llega
  desde Ajustes → «Hazte Pro» y desde el cupo agotado de duelos. El estado Pro
  que se pinta sigue siendo `profiles.is_pro`, nunca el SDK. **Qué desbloquea
  Pro sigue por definir (KAN-25):** hoy la única ventaja real —y la única que la
  pantalla promete— es quitar el cupo diario de duelos. Faltan páginas de
  términos y privacidad para los enlaces del pie.
- **Límite de duelos gratis (primera puerta Pro):** `request_duel` limita a los
  usuarios con `is_pro = false` a `free_tier_daily_duel_limit()` duelos creados
  por día (hoy `1`); Pro sin límite. El check vive en la RPC, no en una Edge
  Function (es la única vía para crear un duelo). El rechazo por cupo llega con
  `ERRCODE 'PRO01'` para que el cliente abra el paywall en vez de un toast de
  error. Migración `20260906122000_free_tier_duel_limit.sql`, ver
  `supabase/SCHEMA.md` §6.
- **Cierre automático de duelos/guerras:** la Edge Function
  `supabase/functions/resolve-expired-competitions/` + un cron de `pg_cron`
  (migración `20260904090000_resolve_expired_competitions_cron.sql`) llaman a
  `resolve_duel` / `resolve_clan_war` cada hora para todo lo vencido — así el
  XP se calcula solo sin depender de que un jugador abra la app. Ver
  `supabase/SCHEMA.md` §12. Requiere dar de alta a mano dos secretos en
  Supabase Vault (`project_url`, `service_role_key`) antes de que el cron
  funcione; no se puede validar contra el Postgres efímero (PGlite) que se usa
  para las demás migraciones.
