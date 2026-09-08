-- ============================================================================
-- MIGRACIÓN INICIAL — Prooffit
-- Tablas base: profiles, step_logs, duels + RLS + grants a nivel de columna.
--
-- Modelo de seguridad (anti-cheat):
--   - El cliente (rol `authenticated`) solo puede escribir columnas "cosméticas"
--     o de entrada cruda (p. ej. steps_count).
--   - XP, nivel, racha, is_pro y los resultados de duelos son AUTORITATIVOS DEL
--     SERVIDOR: solo se modifican vía `service_role` (Edge Functions / webhooks)
--     o funciones `SECURITY DEFINER` que se añadirán en migraciones posteriores.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONES
-- ----------------------------------------------------------------------------
-- `moddatetime` mantiene `updated_at` automáticamente en cada UPDATE.
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. TIPOS PERSONALIZADOS (ENUMS)
-- ----------------------------------------------------------------------------
CREATE TYPE public.duel_status AS ENUM ('PENDING', 'ACTIVE', 'FINISHED', 'DECLINED');

-- ----------------------------------------------------------------------------
-- 2. TABLA DE PERFILES (PROFILES)
-- Se vincula directamente con la tabla interna auth.users de Supabase.
-- ----------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username     TEXT NOT NULL UNIQUE,
  level        INT NOT NULL DEFAULT 1,
  xp           INT NOT NULL DEFAULT 0,
  streak_days  INT NOT NULL DEFAULT 0,
  is_pro       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_username_length CHECK (char_length(username) BETWEEN 3 AND 24),
  CONSTRAINT profiles_level_positive  CHECK (level >= 1),
  CONSTRAINT profiles_xp_non_negative CHECK (xp >= 0),
  CONSTRAINT profiles_streak_non_negative CHECK (streak_days >= 0)
);

-- ----------------------------------------------------------------------------
-- 3. TABLA DE REGISTRO DE PASOS (STEP LOGS)
-- `date` la envía el cliente con SU fecha local para evitar que el corte de
-- día se produzca a medianoche UTC.
-- ----------------------------------------------------------------------------
CREATE TABLE public.step_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  steps_count INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Garantiza solo un registro por usuario por día.
  CONSTRAINT step_logs_unique_user_daily UNIQUE (user_id, date),
  CONSTRAINT step_logs_steps_non_negative CHECK (steps_count >= 0)
);

CREATE INDEX step_logs_date_idx ON public.step_logs (date);

-- ----------------------------------------------------------------------------
-- 4. TABLA DE DUELOS (DUELS)
-- ----------------------------------------------------------------------------
CREATE TABLE public.duels (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id    UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  opponent_id      UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status           public.duel_status NOT NULL DEFAULT 'PENDING',
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  challenger_steps INT NOT NULL DEFAULT 0,
  opponent_steps   INT NOT NULL DEFAULT 0,
  winner_id        UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT duels_players_distinct CHECK (challenger_id <> opponent_id),
  CONSTRAINT duels_date_range CHECK (end_date >= start_date),
  CONSTRAINT duels_steps_non_negative CHECK (challenger_steps >= 0 AND opponent_steps >= 0),
  CONSTRAINT duels_winner_is_participant
    CHECK (winner_id IS NULL OR winner_id = challenger_id OR winner_id = opponent_id)
);

CREATE INDEX duels_challenger_idx ON public.duels (challenger_id);
CREATE INDEX duels_opponent_idx   ON public.duels (opponent_id);
CREATE INDEX duels_status_idx     ON public.duels (status);

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- 5.1 updated_at automático en profiles.
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- 5.2 Creación automática de perfil al registrarse (auth.users -> profiles).
--     SECURITY DEFINER con search_path fijado y nombres cualificados para
--     evitar secuestro de search_path.
--     Nota: el XP solo se gana al ganar duelos (ver migración de RPC de duelos),
--     por eso step_logs no calcula XP por día.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username TEXT;
BEGIN
  v_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'username'), ''),
    'Heroe_' || substring(NEW.id::text FROM 1 FOR 8)
  );

  -- Colisión de username: añade un sufijo derivado del id en vez de fallar.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    v_username := v_username || '_' || substring(NEW.id::text FROM 1 FOR 4);
  END IF;

  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, v_username)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.step_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duels     ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES --------------------------------------------------------------
-- Cualquiera autenticado puede leer perfiles (buscar amigos / rivales).
CREATE POLICY "profiles_select_authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Solo el dueño puede actualizar su fila (qué columnas -> ver GRANTs).
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- No hay policy de INSERT/DELETE: los perfiles se crean únicamente por el
-- trigger handle_new_user() y se borran vía cascada de auth.users.

-- ---- STEP_LOGS ------------------------------------------------------------
CREATE POLICY "step_logs_select_own"
  ON public.step_logs FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "step_logs_insert_own"
  ON public.step_logs FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "step_logs_update_own"
  ON public.step_logs FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ---- DUELS --------------------------------------------------------------
-- Un usuario solo ve duelos donde participa.
CREATE POLICY "duels_select_participant"
  ON public.duels FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) IN (challenger_id, opponent_id));

-- Crear duelo solo como retador.
CREATE POLICY "duels_insert_as_challenger"
  ON public.duels FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = challenger_id
    AND challenger_id <> opponent_id
  );

-- No hay policy de UPDATE en duels: aceptar/rechazar un reto, sincronizar
-- pasos y determinar el ganador se harán mediante funciones SECURITY DEFINER
-- (RPC) o Edge Functions en una migración posterior, para que ningún
-- participante pueda editar sus propios pasos ni el resultado.

-- ============================================================================
-- 7. GRANTS A NIVEL DE COLUMNA (refuerzo del modelo anti-cheat)
-- `service_role` conserva acceso completo (no se toca aquí).
-- ============================================================================

-- ---- PROFILES: el cliente solo escribe columnas cosméticas ---------------
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (username) ON public.profiles TO authenticated;
-- level, xp, streak_days, is_pro -> solo service_role.

-- ---- STEP_LOGS: el cliente aporta la lectura cruda de pasos -------------
REVOKE ALL ON public.step_logs FROM anon;
REVOKE ALL ON public.step_logs FROM authenticated;
GRANT SELECT ON public.step_logs TO authenticated;
GRANT INSERT (user_id, date, steps_count) ON public.step_logs TO authenticated;
GRANT UPDATE (steps_count) ON public.step_logs TO authenticated;

-- ---- DUELS: el cliente solo crea el reto -------------------------------
REVOKE ALL ON public.duels FROM anon;
REVOKE ALL ON public.duels FROM authenticated;
GRANT SELECT ON public.duels TO authenticated;
GRANT INSERT (challenger_id, opponent_id, start_date, end_date) ON public.duels TO authenticated;
-- status, *_steps, winner_id -> solo service_role / RPC.

-- ============================================================================
-- 8. REALTIME
-- Duelos en vivo: el cliente se suscribe a cambios de la tabla duels.
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.duels;
