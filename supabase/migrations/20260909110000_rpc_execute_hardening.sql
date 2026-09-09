-- Cierra una escalada de privilegios real: cualquiera con la clave `anon`
-- —que viaja dentro del APK— podía hacerse Pro gratis.
--
-- ══════════════════════════════════════════════════════════════════════════
-- QUÉ PASABA
-- ══════════════════════════════════════════════════════════════════════════
--
-- `public.reconcile_subscription(...)` es SECURITY DEFINER, recibe el
-- `p_user_id` como PARÁMETRO y **no comprueba `auth.uid()` en ningún sitio**.
-- Es correcto que no lo haga: está pensada para que la llame solo la Edge
-- Function `revenuecat-reconcile` con la `service_role`, que sí es de fiar.
--
-- El problema es que estaba expuesta en PostgREST a `anon`. Un POST a
-- `/rest/v1/rpc/reconcile_subscription` con `p_status = 'ACTIVE'` y un
-- `p_period_end` lejano escribe en `subscriptions` y termina llamando a
-- `refresh_is_pro`, que pone `profiles.is_pro = true`. Resultado: Pro gratis
-- y para siempre, sin pasar por la tienda. Y como el `p_user_id` es un
-- parámetro más, se podía hacer sobre la cuenta de CUALQUIERA — incluido
-- `expire_subscription`, que cancela el Pro de otro.
--
-- ══════════════════════════════════════════════════════════════════════════
-- POR QUÉ NO LO PILLÓ EL REVOKE QUE YA HABÍA
-- ══════════════════════════════════════════════════════════════════════════
--
-- `20260906120000_subscriptions.sql` ya intentaba cerrarlo:
--
--     REVOKE EXECUTE ON FUNCTION public.reconcile_subscription(...) FROM PUBLIC;
--     GRANT  EXECUTE ON FUNCTION public.reconcile_subscription(...) TO service_role;
--
-- La intención era la correcta, pero `FROM PUBLIC` **no quita concesiones
-- directas**. Supabase trae un `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated, service_role` sobre el esquema `public`,
-- así que cada función nueva nace con el permiso concedido *nominalmente* a
-- esos dos roles, no heredado de PUBLIC. La ACL real lo enseñaba:
--
--     {postgres=X/postgres, anon=X/postgres,
--      authenticated=X/postgres, service_role=X/postgres}
--                    ^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^
--                    esto es lo que el REVOKE FROM PUBLIC no tocaba
--
-- Es un fallo silencioso: el código *parecía* asegurado. Por eso este fichero
-- revoca **nombrando los roles**, que es lo único que funciona.
--
-- ══════════════════════════════════════════════════════════════════════════
-- CÓMO SE ELIGIÓ LA LISTA (importante para no romper la app)
-- ══════════════════════════════════════════════════════════════════════════
--
-- Solo entran funciones que el cliente NO llama. Se comprobó grepando las
-- llamadas `.rpc('...')` reales de `src/` y de `supabase/functions/`:
--
--   * Las llama el cliente y SIGUEN accesibles: request_duel, respond_to_duel,
--     sync_duel_steps, resolve_duel, send_friend_request,
--     respond_to_friend_request, cancel_friend_request, remove_friend,
--     sync_daily_steps_batch.
--   * `prepare_account_deletion` se le quita a `anon` pero SE LE MANTIENE a
--     `authenticated`: `delete-account` la invoca con el JWT del usuario, no
--     con la service_role. Revocársela a `authenticated` rompería el borrado
--     de cuenta, que es requisito de tienda. Ver el bloque del final.
--   * Las Edge Functions que llaman a lo de aquí abajo
--     (`revenuecat-reconcile`, `revenuecat-webhook`,
--     `resolve-expired-competitions`) usan `SUPABASE_SERVICE_ROLE_KEY`, y a
--     `service_role` no se le revoca nada. Siguen funcionando igual.
--
-- Se revoca por NOMBRE y no por firma a propósito: evita que una firma mal
-- copiada haga fallar la migración, y salta sin ruido las funciones que no
-- existan en un proyecto dado (las de cosméticos son deriva de esquema —
-- ver KAN-80 — y pueden no estar).

DO $$
DECLARE
  v_fn   TEXT;
  v_proc RECORD;
  v_n    INT := 0;
  -- Funciones que solo debe poder ejecutar el servidor (service_role /
  -- postgres) o que son de trigger y no deberían ser RPC nunca.
  v_solo_servidor TEXT[] := ARRAY[
    -- Suscripciones: la escalada de privilegios de arriba.
    'reconcile_subscription',
    'apply_subscription_event',
    'expire_subscription',
    'expire_stale_subscriptions',
    'refresh_is_pro',
    -- Lectura de datos de salud de terceros: `duel_step_total(p_user_id,...)`
    -- devolvía los pasos de cualquier usuario a quien preguntara.
    'duel_step_total',
    'clan_war_step_total',
    -- Internas: las llama un trigger o otra función, nunca el cliente.
    'recompute_streak',
    -- Funciones de TRIGGER. PostgREST las publica como RPC igualmente.
    'step_logs_touch_streak',
    'clan_members_maintain_count',
    'profiles_touch_level_cosmetics',
    -- Cosméticos: funcionalidad descartada que seguía expuesta (KAN-80).
    'equip_cosmetic',
    'unequip_cosmetic',
    'grant_level_cosmetics'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_solo_servidor LOOP
    FOR v_proc IN
      SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', v_proc.firma);
      v_n := v_n + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'EXECUTE revocado a anon/authenticated en % funciones', v_n;
END $$;

-- Las que sí usa el cliente van solo para usuarios con sesión: `anon` no
-- pinta nada llamándolas (todas resuelven la identidad con `auth.uid()`, que
-- sin sesión es NULL). Defensa en profundidad, no arregla ningún agujero
-- conocido.
DO $$
DECLARE
  v_fn   TEXT;
  v_proc RECORD;
  v_solo_con_sesion TEXT[] := ARRAY[
    'request_duel', 'respond_to_duel', 'sync_duel_steps', 'resolve_duel',
    'send_friend_request', 'respond_to_friend_request',
    'cancel_friend_request', 'remove_friend',
    'sync_daily_steps', 'sync_daily_steps_batch',
    'prepare_account_deletion'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_solo_con_sesion LOOP
    FOR v_proc IN
      SELECT p.oid::regprocedure AS firma
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_proc.firma);
      -- Se reafirma el GRANT por si acaso: revocar de más aquí sí rompería
      -- la app, y esta línea la deja explícitamente en su sitio.
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_proc.firma);
    END LOOP;
  END LOOP;
END $$;

-- Que no vuelva a pasar: a partir de ahora las funciones nuevas del esquema
-- `public` no nacen con EXECUTE para anon/authenticated. Cada RPC que deba
-- ser pública tendrá que pedirlo con un GRANT explícito, que es justo la
-- decisión que uno quiere ver escrita en la migración.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;

-- `prepare_account_deletion` era el mismo fallo por otra vía: ahí el EXECUTE
-- no venía de un grant directo a `anon` sino de PUBLIC, así que el bucle de
-- arriba (que revoca nombrando roles) no lo alcanzaba. Hay que quitar las dos
-- cosas. Se reafirma a `authenticated` porque es con ese rol —el JWT del
-- usuario— con el que la llama la Edge Function `delete-account`.
REVOKE EXECUTE ON FUNCTION public.prepare_account_deletion() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.prepare_account_deletion() TO authenticated, service_role;

-- Mismo caso que `prepare_account_deletion`: en estas tres el EXECUTE también
-- venía de PUBLIC. Son funciones de TRIGGER, así que revocarlas no puede
-- romper nada —un trigger no se dispara por el permiso de quien llama, sino
-- como parte de la sentencia sobre la tabla—, y deja de publicarlas PostgREST
-- como si fueran RPC.
REVOKE EXECUTE ON FUNCTION public.step_logs_touch_streak()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clan_members_maintain_count()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.profiles_touch_level_cosmetics()  FROM PUBLIC, anon, authenticated;
