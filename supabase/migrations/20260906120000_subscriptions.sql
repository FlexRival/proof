-- ============================================================================
-- MIGRACIÓN: SUSCRIPCIONES (RevenueCat) — Prooffit
--
-- RevenueCat es la FUENTE DE VERDAD de los entitlements. El SDK cliente
-- (`react-native-purchases`) hace la compra con la store; el backend NO
-- procesa pagos: solo mantiene sincronizado el estado de suscripción aquí,
-- desde los webhooks de RevenueCat, y NUNCA confía en el cliente para saber
-- quién es Pro.
--
-- Un solo entitlement: `pro`. Free vs Pro, sin tiers. Mensual y anual otorgan
-- el mismo entitlement.
--
-- Modelo de seguridad (igual que el resto del esquema, ver SCHEMA.md §1):
--   - `subscriptions` y `subscription_events`: `REVOKE ALL`. El cliente solo
--     lee su PROPIA fila de `subscriptions` (RLS + `GRANT SELECT` de las
--     columnas no sensibles). Cero `INSERT`/`UPDATE` de cliente.
--   - `profiles.is_pro` sigue siendo SOLO SERVIDOR y pasa a ser un CACHE
--     DERIVADO de `subscriptions`: lo recalcula `refresh_is_pro()`, que solo
--     invocan el webhook, la reconciliación y el cron de caducidad (todos con
--     la `service_role` key o desde `pg_cron`).
--   - Toda escritura de estado viene de `apply_subscription_event()` /
--     `reconcile_subscription()` (`SECURITY DEFINER`, `search_path = ''`),
--     nunca de una RPC del rol `authenticated`.
--
-- REQUISITO MANUAL (secretos de la Edge Function, no versionables) — ver
-- `supabase/functions/revenuecat-webhook/`:
--   - `REVENUECAT_WEBHOOK_AUTH`   — el valor del header `Authorization` que se
--     configura en el dashboard de RevenueCat al dar de alta el webhook; la
--     función lo compara contra este secreto y rechaza lo demás.
--   - `REVENUECAT_SECRET_API_KEY` — clave secreta de la REST API v1 de
--     RevenueCat; solo la usa `revenuecat-reconcile`.
--   Se dan de alta con `supabase secrets set …` (o dashboard → Edge Functions
--   → Secrets). No van en Supabase Vault: no los lee SQL, los leen las
--   funciones vía `Deno.env`.
--
-- VALIDACIÓN: esta migración es SQL puro (tablas + funciones, sin `pg_cron`),
-- así que se valida sobre el Postgres efímero (PGlite) como las de clanes. El
-- cron de caducidad va aparte (`20260906121000_expire_subscriptions_cron.sql`)
-- porque `pg_cron` no existe en PGlite.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TIPOS
-- ----------------------------------------------------------------------------

-- Estado de la suscripción. `IN_GRACE_PERIOD` y `CANCELLED` siguen contando
-- como Pro mientras `current_period_end` esté en el futuro (ver
-- `refresh_is_pro`): cancelar el auto-renovado no quita Pro de inmediato, se
-- disfruta hasta el fin del periodo pagado.
CREATE TYPE public.subscription_status AS ENUM (
  'ACTIVE',           -- viva y al día
  'IN_GRACE_PERIOD',  -- fallo de cobro; la store reintenta; aún es Pro
  'CANCELLED',        -- no renovará; Pro hasta current_period_end
  'EXPIRED',          -- terminó; ya no es Pro
  'PAUSED'            -- pausa de Google Play; no es Pro mientras dure
);

CREATE TYPE public.subscription_store AS ENUM (
  'APP_STORE',
  'PLAY_STORE',
  'STRIPE',
  'PROMOTIONAL'  -- concedida desde el dashboard de RevenueCat, sin cobro
);

-- Las compras de sandbox (TestFlight / license testers de Play) llegan por el
-- mismo webhook. Se registran, pero NO tocan el `is_pro` de producción.
CREATE TYPE public.subscription_environment AS ENUM ('SANDBOX', 'PRODUCTION');

-- ----------------------------------------------------------------------------
-- 2. TABLAS
-- ----------------------------------------------------------------------------

-- Una fila por usuario (un solo entitlement `pro`). El estado real y completo:
-- lo que un booleano `is_pro` no puede guardar (fecha de renovación, grace
-- period, store, si se canceló pero sigue activo, sandbox vs prod).
CREATE TABLE public.subscriptions (
  user_id            UUID PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- App User ID de RevenueCat. El cliente llama a `Purchases.logIn(user.id)`
  -- tras el login de Supabase, así que esto ES `auth.users.id` en texto — pero
  -- se guarda explícito para depurar y por si algún alias no coincide.
  rc_app_user_id     TEXT NOT NULL,
  entitlement        TEXT NOT NULL DEFAULT 'pro',
  status             public.subscription_status NOT NULL,
  store              public.subscription_store,
  product_id         TEXT,
  -- Fin del periodo pagado. `NULL` para una concesión sin caducidad
  -- (PROMOTIONAL de por vida). El anti-cheat de Pro se apoya en esta fecha.
  current_period_end TIMESTAMPTZ,
  will_renew         BOOLEAN NOT NULL DEFAULT FALSE,
  environment        public.subscription_environment NOT NULL DEFAULT 'PRODUCTION',
  -- Último evento de RevenueCat que tocó esta fila (auditoría rápida).
  last_event_id      TEXT,
  last_event_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un App User ID de RevenueCat mapea a un solo perfil.
CREATE UNIQUE INDEX subscriptions_rc_app_user_id_idx
  ON public.subscriptions (rc_app_user_id);

-- Para el cron de caducidad (`20260906121000_…`): barre solo las que podrían
-- necesitar expirarse.
CREATE INDEX subscriptions_period_end_idx
  ON public.subscriptions (current_period_end)
  WHERE status IN ('ACTIVE', 'IN_GRACE_PERIOD', 'CANCELLED');

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- Log crudo de cada webhook de RevenueCat. Doble función:
--   1. IDEMPOTENCIA: RevenueCat reintenta los webhooks (hasta ~72 h). El
--      `event_id` es PK; un evento ya visto se ignora sin volver a aplicarlo.
--   2. AUDITORÍA: el payload completo queda para depurar disputas de cobro.
-- Privada: sin RLS de lectura para `authenticated`/`anon`, solo servidor.
CREATE TABLE public.subscription_events (
  event_id       TEXT PRIMARY KEY,
  -- `SET NULL` (no CASCADE): si el usuario borra su cuenta, el rastro de
  -- facturación se conserva para contabilidad.
  user_id        UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  rc_app_user_id TEXT,
  event_type     TEXT NOT NULL,
  environment    public.subscription_environment,
  payload        JSONB NOT NULL,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX subscription_events_user_idx
  ON public.subscription_events (user_id, received_at DESC);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- El usuario ve SOLO su propia suscripción (para pintar "renueva el X",
-- estado del plan, etc.). A diferencia de clanes, esto no es público.
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- `subscription_events`: sin ninguna policy -> ningún rol no-servidor la lee.

-- No hay policies de INSERT/UPDATE/DELETE en ninguna de las dos: todo pasa por
-- las funciones `SECURITY DEFINER` de abajo, invocadas con la `service_role`.

-- ============================================================================
-- 4. GRANTS DE TABLA (el cliente solo lee, y solo lo suyo y lo no sensible)
-- ============================================================================
REVOKE ALL ON public.subscriptions FROM anon, authenticated;
GRANT SELECT (
  user_id, entitlement, status, store, product_id,
  current_period_end, will_renew, environment, created_at, updated_at
) ON public.subscriptions TO authenticated;
-- `rc_app_user_id`, `last_event_id`, `last_event_at` -> solo servidor.

REVOKE ALL ON public.subscription_events FROM anon, authenticated;

-- ============================================================================
-- 5. `refresh_is_pro` — recalcula el cache `profiles.is_pro`
--
-- ÚNICO sitio que escribe `profiles.is_pro`. Es Pro si tiene una fila de
-- `subscriptions` de PRODUCCIÓN que:
--   - está `ACTIVE`, o
--   - está `IN_GRACE_PERIOD` / `CANCELLED` con el periodo pagado aún vigente.
-- `PAUSED` y `EXPIRED` nunca son Pro.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.refresh_is_pro(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_pro BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions
    WHERE user_id = p_user_id
      AND environment = 'PRODUCTION'
      AND (
        status = 'ACTIVE'
        OR (
          status IN ('IN_GRACE_PERIOD', 'CANCELLED')
          AND current_period_end IS NOT NULL
          AND current_period_end > NOW()
        )
      )
  ) INTO v_is_pro;

  UPDATE public.profiles
  SET is_pro = v_is_pro
  WHERE id = p_user_id
    AND is_pro IS DISTINCT FROM v_is_pro;

  RETURN v_is_pro;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_is_pro(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_is_pro(UUID) TO service_role;

-- ============================================================================
-- 6. `apply_subscription_event` — aplica un webhook de RevenueCat
--
-- La Edge Function `revenuecat-webhook` traduce el JSON del evento a estos
-- parámetros y llama aquí. Toda la lógica de estado vive en SQL (testable en
-- PGlite), la función solo hace de traductor HTTP.
--
-- Devuelve `applied` (FALSE si el evento era duplicado) e `is_pro` (el nuevo
-- valor del cache, o NULL si el evento no mapea a ningún perfil).
--
-- `p_status = NULL` -> solo registra el evento (idempotencia + auditoría) sin
-- tocar `subscriptions`: lo usa `revenuecat-webhook` para eventos como
-- `TRANSFER`, donde el cambio de estado lo aplica aparte
-- (`expire_subscription` sobre cada usuario que pierde el entitlement).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.apply_subscription_event(
  p_event_id       TEXT,
  p_user_id        UUID,
  p_rc_app_user_id TEXT,
  p_event_type     TEXT,
  p_environment    public.subscription_environment,
  p_status         public.subscription_status,
  p_store          public.subscription_store,
  p_product_id     TEXT,
  p_period_end     TIMESTAMPTZ,
  p_will_renew     BOOLEAN,
  p_entitlement    TEXT,
  p_payload        JSONB
)
RETURNS TABLE (applied BOOLEAN, is_pro BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := p_user_id;
  v_fresh   INT;
  v_is_pro  BOOLEAN;
BEGIN
  -- Si el App User ID no corresponde a ningún perfil (p. ej. un id anónimo
  -- `$RCAnonymousID:…` de alguien que nunca hizo login), se registra el
  -- evento sin usuario en vez de reventar por la FK.
  IF v_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    v_user_id := NULL;
  END IF;

  -- Idempotencia: si el evento ya se procesó, `ROW_COUNT` es 0 y salimos.
  INSERT INTO public.subscription_events (
    event_id, user_id, rc_app_user_id, event_type, environment, payload
  )
  VALUES (
    p_event_id, v_user_id, p_rc_app_user_id, p_event_type, p_environment, p_payload
  )
  ON CONFLICT (event_id) DO NOTHING;

  GET DIAGNOSTICS v_fresh = ROW_COUNT;
  IF v_fresh = 0 THEN
    RETURN QUERY
      SELECT FALSE, (SELECT p.is_pro FROM public.profiles p WHERE p.id = p_user_id);
    RETURN;
  END IF;

  -- Evento sin perfil mapeable: queda logueado para depurar, nada que tocar.
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT TRUE, NULL::BOOLEAN;
    RETURN;
  END IF;

  -- Sandbox: se registra pero no altera el estado de producción.
  IF p_environment = 'SANDBOX' THEN
    RETURN QUERY
      SELECT TRUE, (SELECT p.is_pro FROM public.profiles p WHERE p.id = v_user_id);
    RETURN;
  END IF;

  -- Evento solo-registro (p. ej. TRANSFER): el cambio de estado se aplica
  -- aparte por quien llama.
  IF p_status IS NULL THEN
    RETURN QUERY
      SELECT TRUE, (SELECT p.is_pro FROM public.profiles p WHERE p.id = v_user_id);
    RETURN;
  END IF;

  INSERT INTO public.subscriptions AS s (
    user_id, rc_app_user_id, entitlement, status, store, product_id,
    current_period_end, will_renew, environment, last_event_id, last_event_at
  )
  VALUES (
    v_user_id, p_rc_app_user_id, COALESCE(p_entitlement, 'pro'), p_status, p_store,
    p_product_id, p_period_end, COALESCE(p_will_renew, FALSE), p_environment,
    p_event_id, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    rc_app_user_id     = EXCLUDED.rc_app_user_id,
    entitlement        = EXCLUDED.entitlement,
    status             = EXCLUDED.status,
    store              = EXCLUDED.store,
    product_id         = EXCLUDED.product_id,
    current_period_end = EXCLUDED.current_period_end,
    will_renew         = EXCLUDED.will_renew,
    environment        = EXCLUDED.environment,
    last_event_id      = EXCLUDED.last_event_id,
    last_event_at      = EXCLUDED.last_event_at;

  v_is_pro := public.refresh_is_pro(v_user_id);
  RETURN QUERY SELECT TRUE, v_is_pro;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_subscription_event(
  TEXT, UUID, TEXT, TEXT, public.subscription_environment,
  public.subscription_status, public.subscription_store, TEXT,
  TIMESTAMPTZ, BOOLEAN, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_subscription_event(
  TEXT, UUID, TEXT, TEXT, public.subscription_environment,
  public.subscription_status, public.subscription_store, TEXT,
  TIMESTAMPTZ, BOOLEAN, TEXT, JSONB
) TO service_role;

-- ============================================================================
-- 7. `reconcile_subscription` — estado autoritativo desde la REST API
--
-- La Edge Function `revenuecat-reconcile` consulta
-- `GET /v1/subscribers/{app_user_id}` (fuente de verdad de RevenueCat) y
-- vuelca aquí el estado. Sin tabla de eventos: no hay `event_id`, es una
-- foto completa que sustituye lo que hubiera. Cierra la ventana entre la
-- compra y la llegada del webhook, y cura cualquier desincronía.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_subscription(
  p_user_id        UUID,
  p_rc_app_user_id TEXT,
  p_entitlement    TEXT,
  p_status         public.subscription_status,
  p_store          public.subscription_store,
  p_product_id     TEXT,
  p_period_end     TIMESTAMPTZ,
  p_will_renew     BOOLEAN,
  p_environment    public.subscription_environment
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Perfil % inexistente', p_user_id;
  END IF;

  IF p_environment = 'SANDBOX' THEN
    -- Nada que reconciliar contra producción; devuelve el cache actual.
    RETURN (SELECT is_pro FROM public.profiles WHERE id = p_user_id);
  END IF;

  INSERT INTO public.subscriptions AS s (
    user_id, rc_app_user_id, entitlement, status, store, product_id,
    current_period_end, will_renew, environment
  )
  VALUES (
    p_user_id, p_rc_app_user_id, COALESCE(p_entitlement, 'pro'), p_status, p_store,
    p_product_id, p_period_end, COALESCE(p_will_renew, FALSE), p_environment
  )
  ON CONFLICT (user_id) DO UPDATE SET
    rc_app_user_id     = EXCLUDED.rc_app_user_id,
    entitlement        = EXCLUDED.entitlement,
    status             = EXCLUDED.status,
    store              = EXCLUDED.store,
    product_id         = EXCLUDED.product_id,
    current_period_end = EXCLUDED.current_period_end,
    will_renew         = EXCLUDED.will_renew,
    environment        = EXCLUDED.environment;

  RETURN public.refresh_is_pro(p_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_subscription(
  UUID, TEXT, TEXT, public.subscription_status, public.subscription_store,
  TEXT, TIMESTAMPTZ, BOOLEAN, public.subscription_environment
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_subscription(
  UUID, TEXT, TEXT, public.subscription_status, public.subscription_store,
  TEXT, TIMESTAMPTZ, BOOLEAN, public.subscription_environment
) TO service_role;

-- ============================================================================
-- 8. `expire_subscription` — corta Pro para un usuario (TRANSFER, refund)
--
-- La usa `revenuecat-webhook` cuando un evento TRANSFER mueve el entitlement
-- FUERA de un usuario: su fila pasa a `EXPIRED` y se recalcula el cache.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.subscriptions
  SET status = 'EXPIRED', will_renew = FALSE
  WHERE user_id = p_user_id;

  RETURN public.refresh_is_pro(p_user_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_subscription(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_subscription(UUID) TO service_role;

-- ============================================================================
-- 9. `expire_stale_subscriptions` — red de seguridad para webhooks perdidos
--
-- La llama el cron cada hora (`20260906121000_expire_subscriptions_cron.sql`).
-- Un webhook `EXPIRATION` que RevenueCat no logre entregar dejaría a alguien
-- como Pro para siempre; esto lo cierra.
--
-- Conservador a propósito:
--   - NO toca `IN_GRACE_PERIOD`: el grace period puede durar semanas y es
--     RevenueCat quien lo resuelve con RENEWAL o EXPIRATION.
--   - Solo expira `ACTIVE` / `CANCELLED` cuyo periodo pagado venció hace más
--     de 3 días sin que llegara ningún evento — a esas alturas un webhook
--     perdido es mucho más probable que un retraso legítimo.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_stale_subscriptions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  r       RECORD;
  v_count INT := 0;
BEGIN
  FOR r IN
    SELECT user_id
    FROM public.subscriptions
    WHERE status IN ('ACTIVE', 'CANCELLED')
      AND current_period_end IS NOT NULL
      AND current_period_end < NOW() - INTERVAL '3 days'
  LOOP
    UPDATE public.subscriptions
    SET status = 'EXPIRED', will_renew = FALSE
    WHERE user_id = r.user_id;

    PERFORM public.refresh_is_pro(r.user_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_subscriptions() FROM PUBLIC;
-- `postgres` la ejecuta el cron; `service_role` para poder dispararla a mano.
GRANT EXECUTE ON FUNCTION public.expire_stale_subscriptions() TO postgres, service_role;

-- ============================================================================
-- 10. REALTIME
-- La app se suscribe a su fila para reaccionar al alta/baja de Pro sin
-- refetch (RLS ya limita a la propia fila).
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
