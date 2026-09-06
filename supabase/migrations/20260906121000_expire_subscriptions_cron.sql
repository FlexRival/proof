-- ============================================================================
-- MIGRACIÓN: CRON DE CADUCIDAD DE SUSCRIPCIONES
--
-- Red de seguridad para webhooks de RevenueCat perdidos (ver SCHEMA.md §16).
-- Si RevenueCat no logra entregar un webhook `EXPIRATION`, el usuario se
-- quedaría como Pro indefinidamente porque `profiles.is_pro` es un cache que
-- solo se recalcula cuando llega un evento.
--
-- Este job llama cada hora a `public.expire_stale_subscriptions()`
-- (definida en `20260906120000_subscriptions.sql`), que pasa a `EXPIRED` las
-- suscripciones `ACTIVE`/`CANCELLED` cuyo periodo pagado venció hace > 3 días
-- y recalcula `is_pro`. A diferencia del cron de duelos/guerras
-- (`20260904090000_…`), aquí NO hace falta `pg_net` ni secretos en Vault: la
-- lógica es una función SQL y `pg_cron` la ejecuta directamente.
--
-- LIMITACIÓN CONOCIDA: `pg_cron` no está disponible en el Postgres efímero
-- (PGlite) con el que se validan las demás migraciones. Esta solo se puede
-- validar contra un proyecto Supabase real (`supabase start` o el vinculado).
-- La función que invoca sí se valida en PGlite con el resto de la migración
-- de suscripciones.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;

-- Re-programable: si ya existe un job con este nombre, `cron.schedule` lo
-- actualiza en vez de duplicarlo.
SELECT cron.schedule(
  'expire-stale-subscriptions',
  '30 * * * *', -- cada hora, en el minuto 30 (desfasado del cron de duelos)
  $$ SELECT public.expire_stale_subscriptions(); $$
);
