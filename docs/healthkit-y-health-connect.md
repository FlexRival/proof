# HealthKit y Health Connect — cómo funcionan de verdad

Documento técnico. El de al lado, [`conteo-de-pasos.md`](./conteo-de-pasos.md),
explica **por qué** estas dos y no otra cosa. Este explica **cómo son**, y sobre
todo dónde están las trampas.

Fecha de la investigación: 2026-09-03. Sigue sin haber código de pasos.

---

## Lo que las dos tienen que darnos

Da igual la plataforma, Prooffit necesita lo mismo:

```ts
readDailySteps(desde: string, hasta: string): Promise<DailySteps[]>
```

Pasos agrupados **por día local**, de un rango que cubra la ventana de un duelo,
y que se pueda leer sin que el usuario abra la app. Las dos plataformas lo dan,
pero con reglas muy distintas.

---

## HealthKit (iOS)

### Lo que hay que declarar

Tres cosas, y sin ellas la app ni arranca ni pasa revisión:

| Dónde | Qué |
|---|---|
| Entitlements | `com.apple.developer.healthkit` |
| `Info.plist` | `NSHealthShareUsageDescription` — por qué **lees** datos |
| `Info.plist` | `NSHealthUpdateUsageDescription` — solo si además **escribes** |

Prooffit solo lee pasos, así que la tercera en principio no hace falta. El texto
de la segunda lo lee el usuario en el diálogo del sistema: hay que escribirlo
bien, no poner «para que la app funcione».

### Trampa nº 1: no puedes saber si te han dado permiso de lectura

Esto es lo más importante de todo el documento.

`authorizationStatus` **nunca devuelve «autorizado» para permisos de lectura**.
Solo devuelve `notDetermined` o `sharingDenied`. Es deliberado: si la app supiera
que tiene permiso para leer pasos, eso ya filtraría información del usuario.

Y la consecuencia es peor de lo que parece:

> Si el usuario deniega la lectura, **las consultas no fallan**. Devuelven cero
> muestras, sin error. La app no puede distinguir «no me dejas leer» de «hoy no
> has andado».

**Qué significa para Prooffit:** alguien que deniegue el permiso aparecerá con 0
pasos, perderá todos los duelos, y no hay forma programática de decirle por qué.
Se resuelve por diseño, no por código:

- No presentar nunca un 0 como un hecho consumado. Si un día entero sale a 0,
  mostrar un «¿no ves tus pasos?» que lleve a Ajustes.
- Guardar si el usuario llegó a ver el diálogo en el onboarding, que es lo único
  que sí sabemos, y usarlo como pista.
- No bloquear la app detrás del permiso: sin datos de salud, dejar al menos el
  pedómetro en primer plano.

### Trampa nº 2: no sumes las muestras

El error clásico. Si el usuario tiene iPhone **y** Apple Watch, los dos escriben
pasos y las muestras **se solapan**. Sumarlas a mano con `HKSampleQuery`
**duplica el conteo**.

- ❌ `HKSampleQuery` + sumar → cuenta de más, y encima no coincide con lo que el
  usuario ve en la app Salud.
- ✅ `HKStatisticsCollectionQuery` con `.cumulativeSum` → HealthKit hace la
  deduplicación y el resultado **sí** coincide con la app Salud.

Para cubos diarios, `HKStatisticsCollectionQuery` es justo la herramienta: se le
pide un intervalo de un día y devuelve la serie ya agregada.

En un juego donde los pasos deciden quién gana, contar de más no es un detalle
cosmético: es un duelo mal resuelto.

### Histórico y segundo plano

- **Histórico:** largo, sin la limitación de 7 días que tiene `expo-sensors`.
- **Segundo plano:** `HKObserverQuery` más *background delivery* permite que iOS
  despierte la app cuando hay datos nuevos.

---

## Health Connect (Android)

### Antes de nada: comprobar que existe

No se puede dar por hecho. `HealthConnectClient.getSdkStatus(context)` devuelve
tres estados, y hay que tratar los tres:

| Estado | Qué hacer |
|---|---|
| `SDK_AVAILABLE` | Adelante |
| `SDK_UNAVAILABLE` | No se puede usar en ese dispositivo |
| `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` | Pedir al usuario que actualice |

Y la disponibilidad depende de la versión:

- **Android 14+**: viene integrado en el sistema.
- **Android 13 y anteriores**: el usuario tiene que **instalar Health Connect
  desde Play Store**. Si no lo tiene, no hay datos.

Ese segundo caso es una decisión de producto pendiente: ¿mandamos al usuario a
instalarse una app externa para poder jugar?

### Lo que hay que declarar en el manifest

Bastante más ceremonia que en iOS:

1. `<uses-permission android:name="android.permission.health.READ_STEPS"/>`
2. Una **actividad que muestre la política de privacidad**, respondiendo al
   intent `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`. **Es
   obligatoria**: es lo que se abre cuando el usuario pulsa el enlace de
   privacidad en la pantalla de permisos.
3. Un `activity-alias` para el `VIEW_PERMISSION_USAGE` de Android 14+.
4. Un bloque `<queries>` con `com.google.android.apps.healthdata` para poder
   comprobar si está instalado.

> **Ojo:** esa política de privacidad tiene que ser **la misma** que se declare
> en Play Console. **Nadie tiene asignada la tarea de escribir una política de
> privacidad para Prooffit**, y sin ella no se puede publicar con Health Connect.

### Trampa nº 3: solo 30 días de histórico, y leer más antiguo da error

Por defecto, al conceder el permiso, la app puede leer los **30 días previos** a
ese momento. Para ir más atrás hace falta el permiso adicional
`PERMISSION_READ_HEALTH_DATA_HISTORY`.

Y lo importante: **leer fuera de la ventana no devuelve vacío, devuelve error**.
Al revés que en iOS, aquí sí te enteras — pero hay que manejarlo.

**Para Prooffit la noticia es buena:** los duelos duran de 1 a 30 días según el
esquema, así que la ventana por defecto cubre el caso normal de 7 días sin pedir
nada extra. Solo un duelo de 30 días rozaría el límite.

**El matiz que sí muerde:** si el usuario **reinstala** la app y vuelve a
conceder el permiso, la ventana se reinicia desde la nueva fecha. Un reinstall a
mitad de duelo puede dejar sin datos los primeros días.

### Segundo plano

Leer con la app cerrada necesita `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND`, y
**no está en todos los dispositivos**: depende de la versión de Health Connect
instalada. Hay que comprobar `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` con la
Feature Availability API antes de programar nada, y tener plan B para quien no lo
tenga (sincronizar al abrir la app).

### Procedencia del dato

Cada registro trae metadatos que en iOS no existen con tanto detalle:

- `recordingMethod`: `AUTOMATIC`, `ACTIVELY_RECORDED`, `MANUAL`, `UNKNOWN`.
- `dataOrigin`: el paquete de la app que escribió el registro.

Es la base del filtro anti-cheat que describe
[`conteo-de-pasos.md`](./conteo-de-pasos.md): se pueden descartar los pasos
marcados como `MANUAL`. Ninguna plataforma garantiza la clasificación al 100%,
pero es la mejor señal disponible.

---

## Las diferencias que nos afectan, en una tabla

| | HealthKit (iOS) | Health Connect (Android) |
|---|---|---|
| ¿Sabes si te denegaron lectura? | **No.** Devuelve vacío | **Sí.** Permiso explícito |
| Histórico por defecto | Largo | **30 días** desde la concesión |
| Leer fuera de rango | — | **Error**, no vacío |
| Deduplicación multi-fuente | La hace la query de estadísticas | La hace la agregación |
| Riesgo de contar de más | **Alto** si sumas muestras a mano | Menor |
| Disponibilidad | Siempre en iOS | 14+ nativo; antes, APK aparte |
| Política de privacidad | Textos en `Info.plist` | **Actividad dedicada obligatoria** |
| Segundo plano | `HKObserverQuery` | Permiso extra + comprobar disponibilidad |

La asimetría más incómoda: **iOS falla en silencio y Android falla
ruidosamente.** La capa `src/lib/steps/` tiene que normalizar eso, porque una
pantalla no puede tratar «cero pasos» de dos maneras según el móvil.

---

## Lo que esto obliga en la app

- **Un estado de «no sabemos» de primera clase.** No vale `steps: number`. Hace
  falta distinguir *tenemos el dato*, *no hay permiso*, *la plataforma no está
  disponible* y *aún no hemos preguntado* — igual que `ProfileState` en
  `src/hooks/use-profile.ts`.
- **Sincronizar al abrir siempre**, aunque haya lectura en segundo plano, porque
  el segundo plano no está garantizado en Android.
- **La fecha la pone el cliente, en local**, como exige `supabase/SCHEMA.md`.
  Cuidado con construirla en UTC sin darse cuenta.

---

## Checklist para cuando toque implementarlo

- [ ] Development build funcionando (`KAN-12`) — sin esto no se puede ni probar
- [ ] Elegir librería (ver `conteo-de-pasos.md`)
- [ ] **Escribir la política de privacidad** — no está asignada a nadie
- [ ] iOS: entitlement + `NSHealthShareUsageDescription` con un texto decente
- [ ] Android: permiso, actividad de rationale, activity-alias, `<queries>`
- [ ] Usar `HKStatisticsCollectionQuery`, **nunca** sumar muestras a mano
- [ ] Tratar los tres estados de `getSdkStatus`
- [ ] Comprobar `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` antes de usarlo
- [ ] Diseñar la pantalla para el caso «0 pasos porque denegó y no lo sabemos»
- [ ] Formulario de datos de salud en Play Console, pidiendo **solo** pasos

---

## Lo que no he verificado

Los límites de esta investigación, dichos claramente:

- **Qué pasa si el usuario deniega dos veces en Android.** El comportamiento
  estándar del sistema bloquea el diálogo tras dos negativas, pero no he
  encontrado confirmación de que Health Connect se comporte igual. Hay que
  probarlo en dispositivo.
- **Versiones concretas** de las librerías de React Native y su compatibilidad
  con SDK 57.
- **Cuánto tarda** la aprobación del formulario de Play Console.
- Si `expo-sensors` y una librería de salud **conviven** sin conflictos de build.

---

## Fuentes

- Autorizar acceso a datos de salud (Apple): <https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data>
- Empezar con Health Connect: <https://developer.android.com/health-and-fitness/health-connect/get-started>
- Leer datos en Health Connect: <https://developer.android.com/health-and-fitness/health-connect/read-data>
- Metadatos y `recordingMethod`: <https://developer.android.com/health-and-fitness/health-connect/metadata>
- Health Connect Jetpack SDK, histórico y lectura en segundo plano: <https://android-developers.googleblog.com/2025/03/health-connect-jetpack-sdk-now-in-beta.html>
- Publicar apps de salud en Google Play: <https://developer.android.com/health-and-fitness/health-connect/publish>
