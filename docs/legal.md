# Lo legal: borrado de cuenta, textos y trámites de tienda

Cubre KAN-53 (borrado de cuenta), KAN-56 (textos públicos) y KAN-54 (los tres
formularios). Está en un solo sitio porque las tres cosas se contestan con la
misma información y contradecirse entre ellas es motivo de rechazo.

**Regla que lo ordena todo:** lo que dice el código, lo que dice la política de
privacidad y lo que se marca en los formularios tiene que ser **la misma
respuesta**. Un revisor que encuentre que la app lee un dato que el formulario
no declara rechaza; uno que vea una política que promete algo que el código no
hace, también.

---

## 1. Qué se hizo (código, ya en el repo)

### Borrado de cuenta — KAN-53

| Pieza | Dónde |
| --- | --- |
| Traspaso de liderazgo antes del borrado | `supabase/migrations/20260907130000_account_deletion.sql` → `prepare_account_deletion()` |
| Borrado real (Auth + Storage) | `supabase/functions/delete-account/` |
| Contrato | `ProfileRepository.deleteAccount()` |
| Implementación | `src/repositories/supabase/profile-repository.ts` |
| Interfaz | `src/app/settings.tsx` → Ajustes → Cuenta → Borrar cuenta |

Lo que hay que entender del diseño: **casi todo lo borra el `ON DELETE
CASCADE`**. `profiles.id` referencia `auth.users(id)` con cascade, y el resto de
tablas cuelgan de `profiles`, así que borrar el usuario de Auth se lleva pasos,
duelos, amistades, membresías y suscripción sin un solo `DELETE` escrito a mano.

Solo hay dos cosas que el cascade haría mal, y son las dos que el código trata
aparte:

1. **El liderazgo de clan.** `clans.leader_id` también es cascade: borrar al
   líder borraría **el clan entero y a todos sus miembros**. Por eso el mando se
   traspasa antes (oficial más antiguo; si no hay oficiales, miembro más
   antiguo). A diferencia de `leave_clan()`, aquí no se puede lanzar una
   excepción: el borrado es un derecho, no una negociación.
2. **La foto de perfil.** Los objetos de Storage no cuelgan de ninguna foreign
   key, así que el cascade no los toca. Se borran a mano, y **antes** que el
   usuario: si se hiciera después y fallara, quedarían huérfanos para siempre.

Decisiones que conviene no revertir sin pensarlo:

- **Los duelos activos no se resuelven a favor del superviviente.** Regalar la
  victoria convertiría «creo cuenta, reto a mi amigo, la borro» en una fábrica
  de XP gratis. Desaparecen y nadie gana nada.
- **Los eventos de facturación sobreviven sin dueño** (`subscription_events`
  es `ON DELETE SET NULL`). Es la retención por obligación fiscal, y está
  declarada en el apartado 7 de la política.
- **Borrar la cuenta no cancela la suscripción.** No podemos: la gestiona la
  tienda. Se avisa en el texto de confirmación y en los términos.

### Textos legales — parte de KAN-56

Fuente única en `src/lib/legal/`, en español e inglés:

- `privacy-policy.ts`, `terms.ts` — el contenido, como datos estructurados.
- `types.ts` — el tipo y **`LEGAL_CONTACT`, que son placeholders sin rellenar**.
- Se pintan en `/privacy` y `/terms` con `LegalDocumentView`.

Son datos y no JSX a propósito: la landing pública puede generarse del mismo
objeto sin reescribir el texto, y así las dos versiones no pueden divergir.

Están enganchados en tres sitios, y los tres son exigencias de tienda:

- Ajustes → Cuenta → Política de privacidad / Términos de uso.
- Pie del paywall (Apple no aprueba una suscripción sin estos dos enlaces).
- **Android, desde fuera de la app:** el diálogo de permisos de Health Connect
  tiene un enlace de privacidad que abre Prooffit con el intent
  `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`. El plugin de
  `react-native-health-connect` ya escribe ese intent-filter en el manifiesto,
  apuntando a la MainActivity.

Por eso `/privacy` y `/terms` viven **fuera de los dos `Stack.Protected`**: hay
que poder leerlas sin cuenta.

> ⚠️ **Pendiente y bloqueante:** el intent de Health Connect abre la app, pero
> hoy aterriza en la pantalla principal, no en `/privacy`. Falta enrutarlo
> (mismo patrón que `useAuthLink`). Google comprueba ese enlace.

---

## 2. Lo que falta y solo puedes hacer tú

### 2.1 Rellenar `LEGAL_CONTACT` — bloquea publicar

En `src/lib/legal/types.ts`. Cuatro valores, todos obligatorios:

| Campo | Qué poner | Por qué |
| --- | --- | --- |
| `entity` | Nombre o razón social del responsable | RGPD art. 13: sin responsable identificable, la política no vale |
| `email` | Un correo vivo para ejercer derechos | Tiene que responder de verdad; es donde llegan las peticiones de borrado sin app |
| `site` | Dominio de la landing | Va en la ficha de ambas tiendas |
| `hostingRegion` | Región del proyecto de Supabase | Si es EE. UU. hay transferencia internacional que declarar; si es UE, no |

### 2.2 Landing pública — resto de KAN-56

Ambas tiendas piden una **URL pública, no un PDF, no geobloqueada**. Google Play
exige además una **ruta web de borrado de cuenta** accesible sin instalar la app.
Mínimo: `/privacy`, `/terms`, `/delete-account`.

### 2.3 Los tres formularios — KAN-54

**Ojo al orden:** la *Health apps declaration* es obligatoria **también para
pruebas cerradas**, no solo para producción. Es decir, **bloquea el closed test
de 12 testers de KAN-46**, que es el camino crítico hacia el 30 de septiembre.

#### a) Play Console → Contenido de la app → Health apps declaration

| Pregunta | Respuesta |
| --- | --- |
| ¿Ofrece funciones de salud? | Sí |
| Categoría | Fitness / bienestar. **No** es producto sanitario |
| Caso de uso | «Juego con mecánicas basadas en fitness» — está en la lista de casos aprobados, y es literalmente lo que es Prooffit |
| Tipos de dato de Health Connect | **Solo `READ_STEPS`.** Nada más |
| Justificación | Los pasos diarios del usuario son la puntuación de duelos 1v1 y guerras de clanes, y lo que da XP. Sin ellos el juego no tiene mecánica |

Pedir más tipos de dato de los que se usan es motivo de rechazo. `app.json` ya
declara únicamente `android.permission.health.READ_STEPS`: no añadas ninguno más
sin actualizar este formulario y la política a la vez.

#### b) Play Console → Data safety

- Se recoge: correo, nombre de usuario, foto (opcional), información de salud y
  forma física (recuento de pasos), estado de compra.
- ¿Se comparte con terceros? No. (Supabase y RevenueCat son **encargados del
  tratamiento**, no destinatarios en el sentido del formulario.)
- ¿Cifrado en tránsito? Sí.
- ¿Se puede pedir el borrado de los datos? **Sí, desde la app y por la web** —
  aquí es donde se pega la URL de `/delete-account`.

#### c) App Store Connect → App Privacy

- Datos recogidos y **vinculados a la identidad**: correo, nombre de usuario,
  foto, salud y forma física, información de compra.
- Uso: funcionalidad de la app. **Ni seguimiento, ni publicidad, ni analítica de
  terceros** — marcar «no se usa para seguimiento».
- Las reglas de HealthKit prohíben usar datos de salud para publicidad
  segmentada o cederlos a redes publicitarias. Prooffit no tiene anuncios, así
  que hoy no hay conflicto; **si algún día entran anuncios, esto se rompe.**

#### d) Cadenas de permiso en `app.json`

Aquí hay una diferencia con lo que asumía KAN-54: **iOS no usa HealthKit
todavía**. Los pasos vienen de CoreMotion vía `expo-sensors`, así que la cadena
que hace falta es la de movimiento —ya está puesta, en el plugin `expo-sensors`—
y **`NSHealthShareUsageDescription` no aplica**. El día que se añada HealthKit
(está fuera del alcance de la v1, ver `docs/conteo-de-pasos.md`), hay que añadir
esa cadena y volver a este documento.

### 2.4 Revisión humana

Estos textos los ha redactado un modelo de lenguaje a partir de los requisitos
de Apple, Google y el RGPD, ajustados a lo que el código hace de verdad. Cubren
lo que las tiendas comprueban, pero **no son asesoramiento jurídico**. Si algo
va a mirarlo un abogado, que sea la política de privacidad.

---

## 3. Antes de dar KAN-53 por cerrado

El código está escrito pero **no se ha ejecutado nunca contra un Postgres
real**: la migración y la Edge Function siguen sin desplegar, igual que las
otras seis pendientes (ver KAN-48). Hay que:

1. `supabase db push` y `supabase functions deploy delete-account`.
2. Probar el camino feliz: cuenta nueva → borrarla → intentar entrar con ella.
3. Probar **el caso que rompe cosas**: crear un clan con dos cuentas, borrar la
   del líder, y comprobar que el clan sigue vivo y el otro miembro es el nuevo
   líder. Es el único camino donde un fallo daña a un tercero.
4. Comprobar que la foto desaparece del bucket `avatars`.
