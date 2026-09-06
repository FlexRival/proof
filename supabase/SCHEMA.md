# ProofIt — Estructura de la base de datos

Referencia de la capa de datos (Supabase / Postgres). Léela antes de tocar
`supabase/migrations/`.

## Archivos de migración

| Archivo | Contenido |
|---|---|
| `migrations/20260903135409_init_migration.sql` | Tablas base (`profiles`, `step_logs`, `duels`), enum `duel_status`, trigger de creación de perfil, RLS, grants a nivel de columna, realtime. |
| `migrations/20260903140914_duel_rpcs.sql` | Ciclo de vida de duelos: RPCs `request_duel` / `respond_to_duel` / `sync_duel_steps` / `resolve_duel`, helpers `level_for_xp` y `duel_step_total`. |
| `migrations/20260903141500_streaks.sql` | Rachas: `daily_step_goal`, `recompute_streak` y el trigger que mantiene `profiles.streak_days`. |
| `migrations/20260903150000_clans.sql` | Clanes: tablas `clans`, `clan_members`, `clan_join_requests`, `clan_invites`; roles LÍDER/OFICIAL/MIEMBRO; solicitudes e invitaciones por código; helper `clan_tier_for_points`; vista `clan_leaderboard`; 13 RPCs de membresía. |
| `migrations/20260903150500_clan_wars.sql` | Guerras de clanes: tablas `clan_wars`, `clan_war_participants` (roster congelado); helper `clan_war_step_total`; RPCs `request_clan_war` / `respond_to_clan_war` / `sync_clan_war_steps` / `resolve_clan_war`; ajuste de `clans.rank_points`. |
| `migrations/20260904090000_resolve_expired_competitions_cron.sql` | Activa `pg_cron` / `pg_net` y programa una llamada HTTP cada hora a la Edge Function `resolve-expired-competitions`, que cierra duelos y guerras vencidos. Ver §12. |
| `migrations/20260904100000_clan_war_stats_view.sql` | Vista `clan_war_stats`: victorias / derrotas / empates / pasos totales de cada clan en guerras, agregados desde `clan_wars`. Ver §11. |
| `migrations/20260904110000_friendships.sql` | Amistades: tabla `friendships` (solicitud → aceptada/rechazada/cancelada), índice único parcial que impide duplicados en cualquier dirección; RPCs `send_friend_request` / `respond_to_friend_request` / `cancel_friend_request` / `remove_friend`. Ver §13. |
| `migrations/20260905130000_profile_avatar.sql` | Foto de perfil: columna `profiles.avatar_url`, bucket público `avatars` en Storage, policies de `storage.objects` que solo dejan subir/reemplazar/borrar dentro de la propia carpeta `<user_id>/...`. Ver §14. |
| `migrations/20260906120000_subscriptions.sql` | Suscripciones (RevenueCat): tablas `subscriptions` (una fila por usuario, entitlement único `pro`) y `subscription_events` (idempotencia + auditoría de webhooks); enums `subscription_status` / `subscription_store` / `subscription_environment`; `profiles.is_pro` pasa a ser cache derivado; funciones `refresh_is_pro` / `apply_subscription_event` / `reconcile_subscription` / `expire_subscription` / `expire_stale_subscriptions` (`SECURITY DEFINER`, solo `service_role`). Ver §15. |
| `migrations/20260906121000_expire_subscriptions_cron.sql` | Programa un job de `pg_cron` cada hora que llama a `expire_stale_subscriptions()` — red de seguridad para webhooks `EXPIRATION` perdidos. Sin `pg_net` ni secretos: la lógica es SQL. Ver §15. |

Estado de aplicación:

- Las tres primeras (`…135409`, `…140914`, `…141500`) están aplicadas en el
  proyecto vinculado (`tirhukkivndhmlknvbfr`).
- Las de clanes (`…150000_clans`, `…150500_clan_wars`), la del cron
  (`…090000_resolve_expired_competitions_cron`), la de amistades
  (`…110000_friendships`), la de foto de perfil (`…130000_profile_avatar`) y
  las dos de suscripciones (`…120000_subscriptions`,
  `…121000_expire_subscriptions_cron`) **todavía no se han hecho
  `supabase db push`**. Las de clanes y la de amistades se validaron
  ejecutándolas sobre un Postgres 18 efímero (PGlite) con su flujo completo;
  la de foto de perfil se validó sobre el stack local real de Supabase
  (`supabase start`, Docker), incluso contra la API real de Storage, no solo
  SQL (ver §14). `…120000_subscriptions` se validó sobre PGlite con su flujo
  completo (30 asserts: alta, idempotencia, cancelación, expiración, sandbox,
  app_user_id anónimo, grace period, reconciliación, TRANSFER, cron de
  caducidad, RLS, grants de columna). Los dos ficheros de cron
  (`…090000_…`, `…121000_…`) **no se pueden validar así** porque ni PGlite ni
  el stack local por defecto traen `pg_cron`/`pg_net` activos — solo se
  prueban contra un proyecto Supabase real.

Hubo una migración de cosméticos de personaje
(`20260905120000_cosmetics.sql`) que se borró sin más: nunca se hizo
`supabase db push` de ella a ningún proyecto real, así que no hacía falta una
migración de reversa — la funcionalidad completa (personaje RPG equipable) se
descartó.


---

## 1. Principio central: el servidor no confía en el cliente

Es un RPG donde los pasos reales dan poder, así que es un imán para trampas. El
esquema se construye sobre una regla: **el cliente solo escribe entradas crudas;
todo lo que da ventaja lo calcula el servidor.**

El rol `authenticated` (cualquier usuario logueado desde la app) solo puede:

- editar su propio `username`
- insertar/actualizar su `steps_count` diario
- llamar a las RPCs de duelos, de clanes y de guerras de clanes

**No puede** escribir directamente `xp`, `level`, `streak_days`, `is_pro`, los
marcadores de duelos, el ganador, ni nada de las tablas de clanes
(`clan_members`, `rank_points`, `member_count`, marcadores de guerra…). Eso solo
se mueve mediante funciones `SECURITY DEFINER` o la clave `service_role` (solo
servidor).

Se refuerza con **dos capas independientes** que deben pasar ambas:

- **Row Level Security (RLS)** — qué *filas* puedes tocar.
- **Grants a nivel de columna** — qué *columnas* puedes tocar.

---

## 2. Tablas

### `profiles`

Una fila por usuario. PK = `auth.users.id` con `ON DELETE CASCADE` (borrar el
usuario de auth borra el perfil y todo lo que cuelga de él).

| Columna | Notas |
|---|---|
| `username` | único, `CHECK` longitud 3–24 |
| `level` | `CHECK >= 1`, solo servidor |
| `xp` | `CHECK >= 0`, solo servidor |
| `streak_days` | `CHECK >= 0`, solo servidor |
| `is_pro` | flag de RevenueCat, solo servidor |
| `avatar_url` | `NULL` hasta que el usuario suba una foto; el cliente la escribe directo (`GRANT UPDATE`), igual que `username` — no es un dato anti-cheat. Ver §14. |
| `created_at` / `updated_at` | `updated_at` lo mantiene un trigger `moddatetime` en cada UPDATE |

No hay clases de personaje: el enum `user_class` y la columna `avatar_class` se
eliminaron.

### `step_logs`

El registro crudo de pasos diarios.

- `UNIQUE (user_id, date)` → exactamente una fila por usuario por día (la app
  hace upsert).
- `date` tiene default `CURRENT_DATE`, **pero se espera que el cliente envíe su
  fecha local** — si no, el "día" cambiaría a medianoche UTC y atribuiría mal
  pasos y rachas a quien no esté en UTC.
- `CHECK (steps_count >= 0)`.
- índice en `date` para consultas tipo ranking.

No hay columna de XP por día: el XP solo se gana ganando duelos.

### `duels`

- `challenger_id`, `opponent_id`, `winner_id` → todas FK a `profiles`.
- `status` enum `duel_status`: `PENDING → ACTIVE → FINISHED`, o `PENDING → DECLINED`.
- `start_date` / `end_date` — la ventana de competición.
- `challenger_steps` / `opponent_steps` — el marcador, lo rellenan las RPCs.
- `CHECK`s: los jugadores deben ser distintos, `end_date >= start_date`, pasos
  no negativos, y `winner_id` debe ser uno de los dos participantes.
- índices en `challenger_id`, `opponent_id`, `status`.

---

## 3. Creación automática de perfil

`handle_new_user()` es un trigger `SECURITY DEFINER` sobre
`auth.users AFTER INSERT`. Al registrarse un usuario:

1. Toma `username` de la metadata de registro, o genera `Heroe_<8 chars del uuid>`
   si falta o está vacío.
2. Si ese username ya existe, añade `_<4 chars del uuid>` en vez de fallar (una
   colisión antes tumbaba todo el registro con un 500).
3. Inserta el perfil.

Tiene `SET search_path = ''` y todas las referencias van cualificadas por
esquema — esto cierra el hueco de "search_path hijacking" que el linter de
Supabase marca en funciones `SECURITY DEFINER`. Su `EXECUTE` está revocado para
todos (es solo para el trigger).

Como este trigger es la **única** forma de que nazca una fila de `profiles` (no
hay policy de INSERT en `profiles`), cada perfil corresponde con seguridad a un
usuario real de auth.

---

## 4. Políticas RLS (qué filas)

| Tabla | Lectura | Escritura |
|---|---|---|
| `profiles` | cualquier autenticado lee cualquier perfil (para buscar amigos/rivales) | actualizar **solo tu propia fila** (`USING` + `WITH CHECK`, ambos `auth.uid() = id`) |
| `step_logs` | solo tus filas | insertar/actualizar solo tus filas |
| `duels` | solo duelos donde participas | **sin policy de escritura** — todo pasa por RPCs |
| `clans`, `clan_members` | público (`authenticated` + `anon`) | sin policy de escritura — ver §10 |
| `clan_join_requests` | solicitante + gestores del clan | sin policy de escritura — ver §10 |
| `clan_invites` | solo miembros del clan | sin policy de escritura — ver §10 |
| `clan_wars`, `clan_war_participants` | miembros de los clanes implicados | sin policy de escritura — ver §11 |

`auth.uid()` va envuelto como `(SELECT auth.uid())` en cada policy para que
Postgres lo evalúe una vez por consulta y no una vez por fila.

---

## 5. Grants a nivel de columna (qué columnas) — los dientes del anti-cheat

Para cada tabla la migración hace `REVOKE ALL ... FROM authenticated` y luego
concede de vuelta solo lo seguro:

- **`profiles`**: `SELECT` + `UPDATE (username)` + `UPDATE (avatar_url)`
  (§14: no es anti-cheat, no da ventaja de juego). `xp`, `level`,
  `streak_days`, `is_pro` son físicamente no escribibles por la app aunque la
  fila sea del usuario.
- **`step_logs`**: `SELECT` + `INSERT (user_id, date, steps_count)` +
  `UPDATE (steps_count)`.
- **`duels`**: solo `SELECT` (el INSERT se concedió en la migración inicial y
  luego se **revocó** en la migración de RPCs, una vez existió `request_duel`).
- **Tablas de clanes** (`clans`, `clan_members`, `clan_join_requests`,
  `clan_invites`, `clan_wars`, `clan_war_participants`): `REVOKE ALL` + solo
  `SELECT` (y solo a `anon` en `clans` / `clan_members`). Cero `INSERT`/`UPDATE`
  para el cliente: todo pasa por RPCs.

A `service_role` nunca lo tocan estos revokes, así que el servidor conserva
acceso completo.

---

## 6. Ciclo de vida del duelo — las cuatro RPCs

Todas son `SECURITY DEFINER`, `search_path = ''`, y bloquean la fila del duelo
con `FOR UPDATE` para evitar carreras.

### `request_duel(opponent_id, duration_days = 7)`

El retador crea un duelo `PENDING`. Rechaza: duelos contra uno mismo, duraciones
fuera de 1–30, oponentes inexistentes, y un segundo duelo cuando ya hay uno
`PENDING`/`ACTIVE` entre esas dos personas (en cualquier dirección). La ventana
en este punto es provisional.

### `respond_to_duel(duel_id, accept)`

Solo el oponente, solo mientras está `PENDING`.

- `accept = true` → estado `ACTIVE`, y la ventana se **re-ancla a hoy**
  conservando la duración pedida (para que un duelo aceptado 3 días tarde no
  arranque con el retador ya por delante).
- `accept = false` → estado `DECLINED`.

### `sync_duel_steps(duel_id)`

Cualquier participante, mientras está `ACTIVE`. Recalcula los totales de pasos de
ambos jugadores desde `step_logs` sobre `start_date … min(hoy, end_date)` y los
escribe en `challenger_steps` / `opponent_steps`.

Este es el mecanismo que te deja **ver el progreso del rival sin poder leer sus
`step_logs`** — la función corre como owner y salta RLS, devolviendo solo el
agregado.

### `resolve_duel(duel_id)`

Cualquier participante, o un job de `service_role` (ver §12: la Edge Function
`resolve-expired-competitions` lo llama automáticamente por cron). Solo
después de `end_date`. Idempotente (si ya está `FINISHED` devuelve sin
cambios).

1. Totales finales de pasos sobre toda la ventana.
2. Más pasos gana; empate exacto → sin ganador.
3. Estado → `FINISHED`, marcador y `winner_id` escritos.
4. **El ganador** recibe `xp += floor(pasos_ganador / 10)` y se recalcula
   `level`. El perdedor no recibe nada.

El helper interno `duel_step_total(user, start, end)` hace el `SUM` — es
`SECURITY DEFINER` y su execute está revocado para todos, así que solo las RPCs
lo usan.

---

## 7. XP y nivel

- **El XP solo se gana ganando un duelo.** No hay ruta de pasos → XP. Los pasos
  solo importan como marcador del duelo.
- Fórmula: `floor(pasos del ganador durante el duelo / 10)`.
- `level_for_xp(xp)` → `1 + xp/1000`, marcada `IMMUTABLE`. El cliente también
  puede llamarla para previsualizar "XP para el siguiente nivel" sin duplicar la
  fórmula.
- `profiles.xp` y `profiles.level` se escriben en un único sitio: `resolve_duel`.

Tanto `/10` como `/1000` son placeholders deliberados.

---

## 8. Rachas (`20260903141500_streaks.sql`)

`streak_days` = días consecutivos en que el usuario alcanzó la meta diaria de
pasos.

- `daily_step_goal()` → `6000` (placeholder).
- `recompute_streak(user_id)`: cuenta hacia atrás desde hoy los días que cumplen
  la meta. Hoy cuenta en cuanto se cumple; si hoy aún no se cumple, la cuenta
  empieza desde ayer — un **día de gracia** para que un día en curso no rompa la
  racha. Escribe el resultado en `profiles.streak_days` (omite la escritura si no
  cambia).
- El trigger `step_logs_streak` corre `AFTER INSERT OR UPDATE OF steps_count` y
  recalcula para ese usuario. Así la racha se mantiene correcta automáticamente
  según la app hace upsert de los pasos — sin intervención del cliente.

---

## 9. Realtime

`duels`, `clans`, `clan_members`, `clan_join_requests`, `clan_wars` y
`clan_war_participants` están en la publicación `supabase_realtime`, así la app
puede suscribirse a cambios en vivo. Realtime también respeta RLS, así que un
usuario solo recibe eventos de las filas que su RLS le deja ver (duelos y
guerras en los que participa; clanes y rosters son públicos).

---

## 10. Clanes (`20260903150000_clans.sql`)

Capa social sobre `profiles`. Mismo principio anti-cheat: el cliente solo lee
(`REVOKE ALL` + `GRANT SELECT`); toda mutación pasa por RPCs `SECURITY DEFINER`.

### Tablas

- **`clans`** — `name` (único, 3–24), `tag` (único, 2–5, se guarda en mayúsculas),
  `description` (≤ 200), `leader_id` (FK a `profiles`), `rank_points` y
  `member_count` **solo servidor**, `max_members` (default 20, rango 2–50).
  `member_count` lo mantiene el trigger `clan_members_count`.
- **`clan_members`** — `(clan_id, user_id)` PK, `role` enum
  `clan_role` (`LEADER` / `OFFICER` / `MEMBER`), `joined_at`, `role_changed_at`.
  **`UNIQUE (user_id)`** → un usuario pertenece a un solo clan. Índice único
  parcial `WHERE role = 'LEADER'` → exactamente un líder por clan.
- **`clan_join_requests`** — `status` enum `clan_join_request_status`
  (`PENDING` → `ACCEPTED` / `REJECTED` / `CANCELLED`). Índice único parcial
  `(clan_id, user_id) WHERE status = 'PENDING'` → una solicitud viva por par.
- **`clan_invites`** — `code` único (8 hex en mayúsculas), `expires_at`,
  `max_uses` (`0` = ilimitado), `uses`, `revoked`.

### Roles

- **MIEMBRO**: entra/sale, pide entrar a otros clanes tras salir.
- **OFICIAL**: además acepta/rechaza solicitudes, crea/revoca invitaciones,
  expulsa **miembros** (no a otros oficiales ni al líder).
- **LÍDER**: además asciende/degrada (`set_clan_member_role`), traspasa el
  liderazgo, edita el perfil del clan, disuelve el clan e inicia guerras.

### RLS

| Tabla | Lectura |
|---|---|
| `clans` | pública (`authenticated` + `anon`) — buscar clanes y leaderboard |
| `clan_members` | pública — rosters visibles (factor viral) |
| `clan_join_requests` | el solicitante + quien gestiona el clan (`can_manage_clan`) |
| `clan_invites` | solo miembros del clan |

Los helpers `is_clan_member`, `clan_role_of` y `can_manage_clan` son
`SECURITY DEFINER` para que las policies los consulten sin recursión de RLS
sobre `clan_members`.

### RPCs de membresía

| RPC | Quién | Qué hace |
|---|---|---|
| `create_clan(name, tag, description?)` | cualquiera sin clan | funda el clan y queda como `LEADER` |
| `request_to_join_clan(clan_id)` | cualquiera sin clan | crea solicitud `PENDING` (falla si el clan está lleno) |
| `cancel_join_request(request_id)` | el solicitante | `PENDING` → `CANCELLED` |
| `respond_to_join_request(request_id, accept)` | líder / oficial | acepta (inserta `MEMBER`, re-valida cupo y que siga sin clan) o rechaza |
| `create_clan_invite(clan_id, expires_in_hours=168, max_uses=0)` | líder / oficial | genera un código compartible |
| `revoke_clan_invite(invite_id)` | líder / oficial | invalida el código |
| `join_clan_with_invite(code)` | cualquiera sin clan | valida código (no revocado, no caducado, usos), entra como `MEMBER`, `uses++` |
| `leave_clan()` | cualquier miembro | ver "traspaso de liderazgo" abajo |
| `remove_clan_member(user_id)` | líder / oficial | expulsa (oficial solo a `MEMBER`) |
| `transfer_clan_leadership(new_leader_id)` | líder | el objetivo → `LEADER`, el líder → `OFFICER` |
| `set_clan_member_role(user_id, role)` | líder | asigna `OFFICER` o `MEMBER` |
| `disband_clan()` | líder | disuelve (bloqueado si hay guerra `PENDING`/`ACTIVE`) |
| `update_clan_profile(description?, tag?)` | líder | edita campos no nulos |

Todas bloquean la fila del clan con `FOR UPDATE` cuando cambian miembros o cupo.

### Traspaso de liderazgo al salir

`leave_clan()` para un `LEADER`:

- Sin más miembros → el clan se disuelve.
- Con miembros y **algún oficial** → el liderazgo pasa automáticamente al
  **oficial más antiguo** (por `role_changed_at`, luego `joined_at`).
- Con miembros pero **sin oficiales** → falla y pide ascender a un oficial
  (`set_clan_member_role`) o disolver.

Un `OFFICER` / `MEMBER` simplemente se borra de `clan_members`.

---

## 11. Guerras de clanes y rango (`20260903150500_clan_wars.sql`)

Equivalente de grupo a los duelos 1v1. Mismo ciclo `PENDING → ACTIVE → FINISHED`
(o `PENDING → DECLINED`), mismas garantías (`SECURITY DEFINER`, `search_path=''`,
`FOR UPDATE`).

### Tablas

- **`clan_wars`** — `challenger_clan_id`, `opponent_clan_id`, `status` enum
  `clan_war_status`, ventana `start_date`/`end_date`, marcador
  `challenger_steps`/`opponent_steps` (`BIGINT`), `winner_clan_id`,
  `challenger_points_delta`/`opponent_points_delta`. `CHECK`s: clanes distintos,
  `end_date >= start_date`, pasos ≥ 0, ganador es participante o `NULL`.
- **`clan_war_participants`** — **roster congelado**: `(war_id, user_id)` PK más
  `clan_id`. Se rellena al aceptar la guerra copiando `clan_members` de ambos
  clanes. Los pasos se cuentan SOLO de estos usuarios → meter "caminantes" a
  mitad de guerra no cambia el marcador.

### RLS

- `clan_wars`: miembros de cualquiera de los dos clanes.
- `clan_war_participants`: miembros de los clanes de esa guerra.

### RPCs

| RPC | Quién | Qué hace |
|---|---|---|
| `request_clan_war(opponent_clan_id, duration_days=7)` | líder del clan retador | crea `PENDING`; rechaza duración fuera de 1–30, clan inexistente/vacío, o guerra ya `PENDING`/`ACTIVE` entre esos dos clanes |
| `respond_to_clan_war(war_id, accept)` | líder del clan retado | acepta → `ACTIVE`, re-ancla la ventana a hoy y **congela ambos rosters**; rechaza → `DECLINED` |
| `sync_clan_war_steps(war_id)` | cualquier miembro de los dos clanes | recalcula el marcador sobre `start_date … min(hoy, end_date)` desde el roster congelado |
| `resolve_clan_war(war_id)` | participante o job `service_role` (ver §12) | solo tras `end_date`; idempotente; marcador final, ganador, y ajuste de `rank_points` |

El helper interno `clan_war_step_total(war_id, clan_id, start, end)` hace el
`SUM` sobre el roster congelado; su `EXECUTE` está revocado (solo lo usan las
RPCs).

### Rango

- `clans.rank_points` (≥ 0, solo servidor) sube/baja al resolver una guerra.
- **Deltas placeholder**: ganador `+25`, perdedor `-15` (con suelo en 0),
  empate `+5` cada uno.
- `clan_tier_for_points(points)` → `BRONZE` / `SILVER` / `GOLD` / `PLATINUM` /
  `DIAMOND` (umbrales placeholder 100 / 300 / 700 / 1500). Llamable por el
  cliente para previsualizar.
- Vista `clan_leaderboard`: `id, name, tag, rank_points, tier, position`
  (`RANK()` por `rank_points DESC`), `member_count`. `security_invoker`, pública.
- Vista `clan_war_stats` (`20260904100000_clan_war_stats_view.sql`):
  `clan_id, name, tag, wars_won, wars_lost, wars_drawn, wars_played,
  total_war_steps`, agregados en tiempo de consulta sobre `clan_wars`
  (`status = 'FINISHED'`, contando cada guerra desde el punto de vista de
  cada clan participante, sea retador u oponente). No hay contador
  equivalente en `clans` — a propósito, para no duplicar estado que haya que
  mantener sincronizado en `resolve_clan_war`. `security_invoker`, pública
  como `clan_leaderboard`.

### Limitaciones conocidas

- El cierre automático de guerras vencidas ahora corre por cron (§12), pero
  sigue habiendo hasta una hora de retraso entre que `end_date` pasa y el
  siguiente disparo del job — no es instantáneo.
- Un líder de un clan que quedó con un solo miembro puede disolverlo durante una
  guerra `ACTIVE` vía `leave_clan()` (forfeit silencioso). `disband_clan()` sí lo
  bloquea.
- Si el líder borra su cuenta de auth, el clan se disuelve en cascada
  (`clans.leader_id ... ON DELETE CASCADE`). Follow-up: trigger de traspaso.

---

## 12. Cierre automático de duelos y guerras (`resolve-expired-competitions`)

Antes de esta pieza, `resolve_duel` y `resolve_clan_war` solo se ejecutaban si
algún participante abría la app y algo del cliente las llamaba — un duelo
vencido con ambos jugadores ausentes se quedaba `ACTIVE` para siempre y el XP
del ganador nunca se otorgaba. Esto lo cierra:

- **Edge Function** `supabase/functions/resolve-expired-competitions/`
  (Deno). Corre con la `service_role` key: lista `duels` y `clan_wars` en
  estado `ACTIVE` con `end_date` anterior a hoy, y llama a `resolve_duel` /
  `resolve_clan_war` en cada uno. Cada fila se resuelve de forma
  independiente — el fallo de una no bloquea las demás — y la respuesta trae
  qué se resolvió y qué falló.
- Solo acepta llamadas cuyo JWT tenga `role = service_role` (comprueba el
  claim del `Authorization: Bearer`), así que no es una ruta invocable por la
  app ni por un usuario con la `anon key`.
- **Migración** `20260904090000_resolve_expired_competitions_cron.sql` activa
  `pg_cron` + `pg_net` y programa un `net.http_post` a esta función cada hora
  (`0 * * * *`, placeholder). La URL del proyecto y la `service_role_key` se
  leen de **Supabase Vault** en tiempo de ejecución (`vault.decrypted_secrets`)
  — nunca están en el código ni en la migración; hay que darlas de alta a mano
  una vez por proyecto (instrucciones en la cabecera de la migración).
- **No se puede validar sobre PGlite** (el Postgres efímero usado para las
  migraciones de clanes): `pg_cron` y `pg_net` no están disponibles ahí. Solo
  se prueba contra un proyecto Supabase real.

---

## 13. Amistades (`20260904110000_friendships.sql`)

Relación bidireccional entre dos `profiles`, base de "duelos contra amigos".
Mismo principio anti-cheat que clanes: el cliente solo lee (`REVOKE ALL` +
`GRANT SELECT`), toda mutación pasa por RPCs `SECURITY DEFINER`.

### Tabla `friendships`

Una fila por solicitud/relación: `requester_id`, `addressee_id`, `status` enum
`friendship_status` (`PENDING` → `ACCEPTED` / `DECLINED`, o `PENDING` →
`CANCELLED`). `user_low_id`/`user_high_id` son columnas generadas
(`LEAST`/`GREATEST` de los dos ids) que normalizan el par sin orden; un índice
único parcial sobre `(user_low_id, user_high_id) WHERE status IN
('PENDING','ACCEPTED')` impide una segunda solicitud u otra amistad activa
entre los mismos dos usuarios sin importar quién invita a quién. Tras
`DECLINED`/`CANCELLED` se puede volver a pedir amistad (nueva fila);
`remove_friend` borra la fila en vez de dejar un estado terminal, por la misma
razón.

A diferencia de `clans`/`clan_members`, esta tabla **no es pública**: la
policy de `SELECT` solo deja ver las filas donde el usuario es `requester_id` o
`addressee_id`.

### RPCs

| RPC | Quién | Qué hace |
|---|---|---|
| `send_friend_request(addressee_id)` | cualquiera | crea solicitud `PENDING`; rechaza a uno mismo, destinatario inexistente, o solicitud/amistad ya activa en cualquier dirección |
| `respond_to_friend_request(friendship_id, accept)` | el destinatario | acepta → `ACCEPTED`, o rechaza → `DECLINED`; solo mientras `PENDING` |
| `cancel_friend_request(friendship_id)` | el solicitante | `PENDING` → `CANCELLED` |
| `remove_friend(friendship_id)` | cualquiera de los dos | borra la fila; solo si está `ACCEPTED` |

Todas bloquean la fila con `FOR UPDATE` antes de mutarla.

### Validación

Igual que clanes: aplicada y probada sobre un Postgres 18 efímero (PGlite),
incluyendo el flujo completo (solicitud → duplicado rechazado → aceptar →
rechazar → reintentar tras rechazo → cancelar → eliminar amistad → RLS). Aún
sin `supabase db push` al proyecto vinculado — ver estado de aplicación al
principio de este documento.

---

## 14. Foto de perfil (`20260905130000_profile_avatar.sql`)

Foto real subida por el usuario: es la identidad de la cuenta (Ajustes). No
hay ningún personaje RPG que la sustituya ni que dibuje encima — se descartó
a propósito, junto con un sistema de cosméticos que llegó a probarse en
local pero nunca se envió (ver la nota al principio de este documento). No es
un dato anti-cheat — no da ninguna ventaja de juego — así que no pasa por
RPC, va directo como `username`.

### Columna

`profiles.avatar_url` (`TEXT`, nullable). El cliente tiene
`GRANT UPDATE (avatar_url)` además de `GRANT UPDATE (username)` — mismo
principio, la RLS de `profiles` (§4: solo tu propia fila) ya cubre el resto.
La URL lleva un query param `?updated=<epoch>` que cambia en cada subida
nueva aunque la ruta del archivo sea la misma, para que ningún caché de
imagen (el propio `<Image>`, un CDN) siga enseñando la foto vieja con la
misma URL.

### Bucket de Storage

`avatars` — **público** (la URL sirve la imagen sin firmar, no hace falta
policy de lectura para que funcione, aunque se añade una explícita por
higiene). Límite `5 MiB`, solo `image/jpeg`/`image/png`/`image/webp`
(`allowed_mime_types` del bucket).

### Policies de `storage.objects`

Cada usuario solo puede subir/reemplazar/borrar dentro de su propia carpeta
`<user_id>/...` — `(storage.foldername(name))[1]` tiene que ser su propio
`auth.uid()`. Mismo patrón recomendado por Supabase para storage por-usuario.
`storage.objects` ya trae RLS activado por defecto (lo instala el propio
proyecto de Storage), así que la migración solo añade las policies, no el
`ENABLE ROW LEVEL SECURITY`.

### Cliente

`ProfileRepository.updateAvatar(image)` (`src/repositories/`): sube el
archivo (`base64-arraybuffer` para decodificar el base64 de
`expo-image-picker` a lo que espera `.storage.upload()`) con `upsert: true` a
la misma ruta de siempre, y actualiza `avatar_url` en el mismo perfil.
`CachedProfileRepository` invalida su caché a mano tras esta mutación: a
diferencia de login/signup/logout, no dispara `onAuthStateChange`, así que
sin la invalidación explícita `getCurrentProfile()` seguiría devolviendo la
foto vieja hasta que caducase el caché por su cuenta.

### Validación

Probada contra la **API real de Storage** del stack local (no solo SQL
simulado): usuario A sube a su propia carpeta (200); usuario A intenta subir
a la carpeta de usuario B (rechazado por RLS — el servicio de Storage lo
envuelve en HTTP 400, pero el cuerpo confirma `"new row violates row-level
security policy"`); lectura pública sin token (200); `PATCH` de
`avatar_url` vía REST (204) y confirmado en la tabla. Probada además de
punta a punta en el navegador: `expo-image-picker` en web abre un
`input[type=file]` real, se subió un PNG de verdad y `avatar_url` quedó
actualizado y visible en el `Image` de la pantalla. Aún sin
`supabase db push` al proyecto vinculado.

---

## 15. Suscripciones — RevenueCat (`20260906120000_subscriptions.sql`)

Monetización. **RevenueCat es la fuente de verdad de los entitlements**: el SDK
cliente (`react-native-purchases`) hace la compra con la store, y el backend
solo mantiene sincronizado el estado aquí desde los webhooks de RevenueCat.
Mismo principio anti-cheat que el resto: el cliente nunca escribe, y ni
siquiera confía en su propio SDK — `profiles.is_pro` solo lo mueve el servidor.

**Un solo entitlement: `pro`.** Free vs Pro, sin tiers. Mensual y anual otorgan
el mismo `pro`. Qué desbloquea Pro sigue por definir (ver CLAUDE.md); esta capa
no depende de ello — cada capacidad Pro nueva solo añade un check `is_pro` en
su RPC (o en la Edge Function correspondiente).

### Tablas

- **`subscriptions`** — una fila por usuario (`PRIMARY KEY (user_id)`). El
  estado real que un booleano no puede guardar: `status` (enum
  `subscription_status`: `ACTIVE` / `IN_GRACE_PERIOD` / `CANCELLED` / `EXPIRED`
  / `PAUSED`), `store`, `product_id`, `current_period_end`, `will_renew`,
  `environment` (`PRODUCTION` / `SANDBOX`), `rc_app_user_id`. RLS: cada quien
  ve **solo su propia fila**. `GRANT SELECT` de columnas — `rc_app_user_id`,
  `last_event_id`, `last_event_at` son solo servidor. En `supabase_realtime`.
- **`subscription_events`** — log crudo de cada webhook. `event_id` (el de
  RevenueCat) es PK → **idempotencia**: RevenueCat reintenta los webhooks y un
  evento ya visto se ignora. Privada (sin grants a `authenticated`/`anon`).
  `user_id` con `ON DELETE SET NULL` para conservar el rastro de facturación.

### `profiles.is_pro` es un cache derivado

Deja de ser un dato independiente. `refresh_is_pro(user_id)` (el **único** sitio
que lo escribe) lo recalcula: es Pro si tiene una fila de `subscriptions` de
**producción** que está `ACTIVE`, o `IN_GRACE_PERIOD` / `CANCELLED` con
`current_period_end` aún en el futuro. `PAUSED` y `EXPIRED` nunca son Pro.
Cancelar el auto-renovado (`CANCELLED`) **no** quita Pro de inmediato: se
disfruta hasta el fin del periodo pagado.

### Funciones (`SECURITY DEFINER`, `search_path = ''`, solo `service_role`)

| Función | Quién la llama | Qué hace |
|---|---|---|
| `refresh_is_pro(user_id)` | las demás funciones de esta lista | recalcula `profiles.is_pro` desde `subscriptions` |
| `apply_subscription_event(...)` | Edge Function `revenuecat-webhook` | idempotencia por `event_id`; upsert en `subscriptions`; `refresh_is_pro`. `p_status = NULL` → solo registra (TRANSFER, TEST). Devuelve `(applied, is_pro)` |
| `reconcile_subscription(...)` | Edge Function `revenuecat-reconcile` | foto autoritativa desde la REST API de RevenueCat; upsert + `refresh_is_pro` |
| `expire_subscription(user_id)` | `revenuecat-webhook` (TRANSFER) | fuerza `EXPIRED` para quien pierde el entitlement |
| `expire_stale_subscriptions()` | cron `pg_cron` cada hora | expira `ACTIVE`/`CANCELLED` cuyo periodo venció hace > 3 días sin que llegara ningún evento — red de seguridad para webhooks perdidos. No toca `IN_GRACE_PERIOD` (lo resuelve RevenueCat) |

### Edge Functions

- **`revenuecat-webhook`** — recibe los webhooks. `verify_jwt = false` (el
  webhook no manda un JWT de Supabase, manda un header `Authorization` de
  valor fijo); se valida contra el secreto `REVENUECAT_WEBHOOK_AUTH`. Traduce
  el evento (`event-mapping.ts`) y llama a `apply_subscription_event`. Trata
  `TRANSFER` aparte (expira a cada `transferred_from`), ignora eventos de
  otros entitlements, responde `200` al `TEST` del dashboard.
- **`revenuecat-reconcile`** — la llama la app al arrancar. `verify_jwt = true`;
  el `app_user_id` consultado es **siempre** el `sub` del JWT del usuario,
  nunca un parámetro. Consulta `GET /v1/subscribers/{id}` con
  `REVENUECAT_SECRET_API_KEY` y llama a `reconcile_subscription`.

### `rc_app_user_id` === uuid de Supabase

La app llama a `Purchases.logIn(session.user.id)` tras el login, así que el App
User ID de RevenueCat es el `auth.users.id`. Por eso el webhook mapea el evento
a un perfil sin tabla de traducción. Un `app_user_id` anónimo
(`$RCAnonymousID:…`, de alguien que compró antes de loguear) no mapea a ningún
perfil: el evento se registra en `subscription_events` con `user_id` nulo y no
toca nada. Para evitar ese caso, **el paywall va detrás del login**.

### Secretos (alta manual, una vez por proyecto)

No van en git ni en Vault (los leen las funciones, no SQL):

```
supabase secrets set REVENUECAT_WEBHOOK_AUTH='<valor del dashboard de RevenueCat>'
supabase secrets set REVENUECAT_SECRET_API_KEY='<Secret API key v1 de RevenueCat>'
```

Y en RevenueCat: Project → Integrations → Webhooks → URL de `revenuecat-webhook`
+ ese mismo `REVENUECAT_WEBHOOK_AUTH` en "Authorization header value".

### Validación

`20260906120000_subscriptions.sql` se ejecutó sobre PGlite con su flujo
completo (30 asserts, ver "Estado de aplicación" arriba). El cron
(`20260906121000_…`) no es validable sobre PGlite (`pg_cron`); la función que
invoca sí. Aún sin `supabase db push`.

---

## Placeholders a revisar

- Ratio pasos → XP (`/10`).
- Ratio XP → nivel (`/1000`).
- Meta diaria de pasos para la racha (`6000`).
- Deltas de `rank_points` por guerra de clanes (`+25 / -15 / +5`).
- Umbrales de tier de clan (`100 / 300 / 700 / 1500`).
- Cupo de clan `max_members` (`20`) y duración por defecto de guerra (`7` días).
- Frecuencia del cron de cierre de duelos/guerras (`cada hora`).
- Margen del cron de caducidad de suscripciones (`3 días` tras vencer el
  periodo sin evento) y su frecuencia (`cada hora`) — ver §15.
