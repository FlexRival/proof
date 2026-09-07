# RevenueCat — el lado cliente de la suscripción Pro

**Estado: SDK, cableado y UI de compra hechos (KAN-9).** El SDK está
inicializado, la sesión de RevenueCat atada al usuario, la reconciliación con el
servidor funcionando, y el paywall (`/paywall`) compra y restaura de verdad
contra la oferta activa de RevenueCat. Fecha: 2026-09-07. SDK
`react-native-purchases` 10.9.0.

**Lo que sigue sin decidir es producto, no código:** qué separa Pro de gratis
más allá del cupo diario de duelos (KAN-25), y las páginas de términos y
privacidad que las stores exigen enlazar desde la pantalla de pago.

El backend ya estaba hecho antes de este trabajo — tablas `subscriptions` /
`subscription_events`, `profiles.is_pro` como cache derivado, Edge Functions
`revenuecat-webhook` y `revenuecat-reconcile`. Todo eso está documentado en
[`supabase/SCHEMA.md` §15](../supabase/SCHEMA.md). Este documento cubre solo lo
que se añadió en el cliente y las trampas de montarlo.

---

## 1. La regla que lo explica todo

**El cliente nunca decide si eres Pro.** La compra ocurre contra la store (App
Store / Play) a través del SDK, pero el flag que la app mira para desbloquear
nada es `profiles.is_pro`, que **solo mueve el servidor**. Mismo principio
anti-cheat que los pasos y los duelos.

Consecuencia práctica: después de cualquier operación que pueda cambiar el
entitlement (comprar, restaurar, un aviso del SDK, arrancar la app) el cliente
llama a la Edge Function `revenuecat-reconcile` — que consulta la REST API de
RevenueCat y recalcula `profiles.is_pro` — y **luego** recarga el perfil. El
`customerInfo` local del SDK no se usa para gating.

---

## 2. Piezas (lo que entró en este ticket)

| Archivo | Qué hace |
|---|---|
| `src/repositories/subscription-repository.ts` | Contrato. Tipos de dominio (`SubscriptionOffering`, `SubscriptionPackage`, `PurchaseOutcome`) e interfaz `SubscriptionRepository`. Sin imports de backend. |
| `src/repositories/revenuecat/subscription-repository.ts` | Implementación contra el SDK. **Único archivo que importa `react-native-purchases`.** Traduce la oferta de RevenueCat al modelo de dominio, mapea la cancelación del usuario a `'cancelled'` (no es error). |
| `src/repositories/revenuecat/subscription-repository.web.ts` | Stub para que el bundle web no cargue el módulo nativo (mismo patrón que `lib/storage.web.ts`). En web todo es «no disponible». |
| `src/repositories/supabase/subscription-repository.ts` | `SupabaseSubscriptionGateway`: la llamada a `revenuecat-reconcile`. Se inyecta en el repo de RevenueCat como `SubscriptionServerGateway` para no cruzar la frontera del patrón repositorio. |
| `src/repositories/index.ts` | `subscriptionRepository` — compone las dos piezas. |
| `src/hooks/use-subscription-sync.ts` | Montado en el layout raíz. `configure()` al arrancar, `identify(uuid)` tras el login, `signOut()` al cerrar sesión, reconcile al arrancar y en cada aviso del SDK. |
| `src/hooks/use-subscription.ts` | **El hook de gating para la UI.** `const { isPro, status, requirePro } = useSubscription()`. Lee `profiles.is_pro` del perfil, no habla con el SDK. Ver §7. |
| `src/repositories/profile-repository.ts` | Método nuevo `invalidate()` (no-op en la impl Supabase, caduca el caché en `CachedProfileRepository`): lo usa el sync porque el reconcile cambia `is_pro` por fuera del repositorio de perfil. |
| `src/hooks/use-paywall.ts` | `usePaywall(reloadProfile)`: los planes comprables y las acciones que cambian el entitlement, para **una** pantalla (el paywall). Tras `purchase`/`restore` reconcilia y recarga el perfil que le pasan. No confundir con `use-subscription` (que solo dice si **es** Pro) ni con `use-subscription-sync`, que va en el layout raíz y solo atiende la sesión. |
| `src/app/paywall.tsx` | La pantalla de pago. Pinta la oferta de la store, deja elegir plan, compra, restaura, y enseña el estado Pro cuando ya hay suscripción. |
| `src/lib/paywall.ts` | Aritmética de los planes: contra qué plan se mide el ahorro, cuánto ahorra cada uno, cuál viene marcado. Sobre `monthlyPrice` (número), nunca sobre el precio formateado. |
| `src/app/settings.tsx` | Sección «SUSCRIPCIÓN»: el plan actual leído de `is_pro` y el acceso «Hazte Pro» al paywall. |

### Cómo se comporta la pantalla

- **Los precios los da la store**, ya formateados en la moneda del país
  (`priceLabel`, `monthlyPriceLabel`). La app no formatea ni inventa ninguno: si
  no hay oferta, no se enseña ningún número.
- **Sin oferta ≠ error.** `getCurrentOffering()` devolviendo `null` (SDK sin
  claves, bundle web, proyecto sin offering por defecto) se pinta como «las
  compras no están disponibles», en tono informativo. Un error de red sí sale en
  rojo y con «Reintentar».
- **Cancelar la hoja de pago no es un fallo**: vuelve como `'cancelled'` y la
  pantalla se queda igual, sin mensaje.
- **Tras comprar se confirma aunque `is_pro` siga en `false`.** El reconcile
  puede fallar (red) y no se convierte en «no se pudo comprar»: el cobro ya
  ocurrió y el webhook lo arreglará. Se dice que se está confirmando.
- **`configure()` se vuelve a llamar al abrir la pantalla.** Los efectos de
  React corren de hijo a padre, así que el paywall se monta antes de que
  `useSubscriptionSync` haya configurado el SDK; sin esa llamada (idempotente),
  abrir el paywall recién arrancada la app diría «no disponible» con las claves
  puestas.
- **Restaurar sin nada que restaurar** se dice explícitamente en vez de quedarse
  callado, que es indistinguible de un fallo.

---

## 3. El App User ID **es** el uuid de Supabase

`use-subscription-sync.ts` llama a `Purchases.logIn(session.user.id)` tras el
login. Por eso el webhook y el reconcile mapean el evento a un perfil sin tabla
de traducción (`rc_app_user_id === auth.users.id`).

Un `app_user_id` anónimo (`$RCAnonymousID:…`, de alguien que compró **antes** de
loguearse) no mapea a ningún perfil. Para evitar ese caso **el paywall tiene que
ir detrás del login**: `src/app/_layout.tsx` solo monta el resto de la app con
sesión iniciada (`Stack.Protected`), así que basta con no exponer la pantalla
fuera de ese árbol.

---

## 4. Claves y secretos — quién va dónde

| Valor | Dónde vive | Qué es |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` / `_ANDROID_API_KEY` | `.env.local` (cliente) | Claves **públicas** del SDK, una por plataforma. RevenueCat → Project → API keys → «Apple» / «Google». Viajan dentro de la app, como la publishable key de Supabase. |
| `REVENUECAT_SECRET_API_KEY` | Secretos de Supabase (`supabase secrets set`) | «Secret API key» (v1). La lee `revenuecat-reconcile` para consultar la REST API. **Nunca** en el cliente. |
| `REVENUECAT_WEBHOOK_AUTH` | Secretos de Supabase + dashboard de RevenueCat | Valor fijo que valida el webhook. |

Si faltan las claves públicas, la app **arranca igual**: `configure()` avisa por
consola y no hace nada (`isConfigured()` se queda en `false`).

---

## 5. Development build obligatorio

`react-native-purchases` es un módulo nativo: **rompe Expo Go** (`Invariant
Violation: 'new NativeEventEmitter()' requires a non-null argument`). Hace falta
un development build — ya era el caso por los pasos (KAN-49). No necesita config
plugin de Expo; el autolinking basta. `expo-dev-client` está en `package.json`.

```
npx expo run:ios      # o run:android
```

---

## 6. Cómo probar lo que hay hoy

Prerrequisitos del backend (una vez por proyecto):

1. `supabase db push` de las migraciones de suscripciones (siguen sin aplicar,
   ver `supabase/SCHEMA.md`).
2. `supabase secrets set REVENUECAT_SECRET_API_KEY=…` y
   `REVENUECAT_WEBHOOK_AUTH=…`.
3. En RevenueCat: registrar la URL de `revenuecat-webhook` con ese
   `REVENUECAT_WEBHOOK_AUTH`; configurar el entitlement `pro`, una offering por
   defecto y sus productos.

En la app:

4. `EXPO_PUBLIC_REVENUECAT_*_API_KEY` en `.env.local`.
5. `npx expo run:ios` (o `run:android`) — no Expo Go.
6. Iniciar sesión → en los logs, `Purchases.logIn(<uuid>)` y `revenuecat-reconcile`
   respondiendo 200.
7. Si esa cuenta tiene Pro activo en RevenueCat (concedido a mano en el
   dashboard, o comprado antes), `profiles.is_pro` pasa a `true` tras el login y
   crear un segundo duelo el mismo día ya no rebota al paywall (`request_duel`
   mira `is_pro` en SQL).

8. Ajustes → «Hazte Pro» (o agotar el cupo diario de duelos) abre `/paywall`.
   Con la offering bien configurada salen los planes reales con su precio de la
   store; comprar con una cuenta de sandbox debe dejar la pantalla en «Ya eres
   Pro» y `profiles.is_pro` en `true`.

**En web no se puede probar la compra**: el stub `.web.ts` devuelve «no
disponible» a propósito, así que el paywall en `expo start --web` sirve para ver
la maqueta y ese estado, no el flujo de pago.

---

## 7. Gating de funciones Pro en la UI — `useSubscription()`

El hook para bloquear/desbloquear una función Pro en una línea. Lee
`profiles.is_pro` del perfil; no toca el SDK.

```tsx
import { useSubscription } from '@/hooks/use-subscription';

// Habilitar / deshabilitar un control:
const { isPro } = useSubscription();
<Button label="Export" disabled={!isPro} onPress={exportData} />

// Puerta sobre una acción — corre la función si es Pro, si no abre el paywall:
const { requirePro } = useSubscription();
<Button label="Export" onPress={() => requirePro(exportData)} />

// Pantalla entera solo-Pro:
const { status, isPro } = useSubscription();
if (status === 'loading') return <Splash />;
if (!isPro) return <Redirect href={ROUTES.paywall.href} />;
```

- `isPro: boolean` — `false` mientras el perfil carga, a propósito: una función
  Pro nunca debe parpadear desbloqueada.
- `status: 'loading' | 'free' | 'pro'` — cuando hace falta distinguir «cargando»
  de «gratis».
- `requirePro(action?)` — corre `action` y devuelve `true` si es Pro; si no,
  hace `router.push` al paywall y devuelve `false`.

El gate de verdad de cada función Pro sigue viviendo en el servidor (p. ej.
`request_duel` mira `is_pro` en SQL). Este hook es solo la capa de UI: qué se
enseña y a dónde se manda a quien no paga.

---

## 8. Límite conocido

`useProfile` no es estado global: cada pantalla tiene su instancia (también la
que hay dentro de `useSubscription`) y no comparten. Cuando la UI de compra
dispare un reconcile, solo se recarga la instancia de perfil de quien montó
`useSubscriptionSync` (el layout raíz) y la de quien disparó la acción; otras
pantallas ya montadas pueden seguir enseñando «Free» hasta remontarse o hasta un
cambio de sesión. **No afecta al gating de servidor** — solo a lo que se pinta.
Si molesta, la solución es mover el perfil a un store global (como el idioma en
`src/lib/i18n/`), no parchear cada pantalla.
