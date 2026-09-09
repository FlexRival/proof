-- ============================================================================
-- MIGRACIÓN: MARCOS DE FOTO (PHOTO FRAMES) — ProofIt
--
-- Personalización de la foto de perfil (`ProfilePhoto`): un marco decorativo
-- alrededor de la foto, en tres escaleras de desbloqueo:
--   - `bronze`  — por NIVEL (`profiles.level`).
--   - `silver`  — por RACHA (`profiles.streak_days`).
--   - `gold`    — por MONEDA VIRTUAL. Sin moneda todavía (no hay tabla de
--     saldo/gasto en el esquema), así que esta migración deja el tipo
--     `currency` listo en el CHECK pero NO siembra ninguna fila `gold` ni da
--     ninguna vía para desbloquearlas. `equip_frame` las rechaza explícitamente
--     hasta que exista esa economía.
--
-- Bronce y plata no necesitan una tabla de "desbloqueos": la elegibilidad es
-- 100% derivable de datos que ya existen (nivel y racha del propio usuario),
-- así que `equip_frame` la recalcula en cada llamada contra `profiles`, igual
-- que `level_for_xp`/`recompute_streak` recalculan en vez de cachear.
--
-- `frames` es un catálogo ESTÁTICO: lo puebla esta misma migración con
-- INSERT, no hay RPC de escritura para él en esta fase — mismo patrón de
-- "solo lectura para el cliente" que el resto del esquema
-- (`REVOKE ALL` + `GRANT SELECT`), pero aquí ni siquiera hay una vía
-- `SECURITY DEFINER` para escribirlo, porque nadie más que una migración
-- futura necesita añadir filas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CATÁLOGO
-- ----------------------------------------------------------------------------
CREATE TABLE public.frames (
  id            TEXT PRIMARY KEY,
  tier          TEXT NOT NULL,
  rung          SMALLINT NOT NULL,
  unlock_type   TEXT NOT NULL,
  unlock_value  INT NOT NULL,
  animated      BOOLEAN NOT NULL,
  sort_order    SMALLINT NOT NULL,

  CONSTRAINT frames_tier_valid        CHECK (tier IN ('bronze', 'silver', 'gold')),
  CONSTRAINT frames_rung_range        CHECK (rung BETWEEN 1 AND 5),
  CONSTRAINT frames_unlock_type_valid CHECK (unlock_type IN ('level', 'streak', 'currency')),
  CONSTRAINT frames_unlock_value_pos  CHECK (unlock_value >= 0)
);

COMMENT ON TABLE public.frames IS
  'Catálogo estático de marcos de foto. Se puebla por migración, no por RPC.';

-- ----------------------------------------------------------------------------
-- 2. QUÉ MARCO LLEVA PUESTO CADA USUARIO
-- NULL = sin marco (estado por defecto, no un hueco a rellenar).
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN equipped_frame_id TEXT REFERENCES public.frames (id);

-- ----------------------------------------------------------------------------
-- 3. equip_frame: comprueba elegibilidad contra el PROPIO perfil del caller
-- y, si cumple, lo equipa. `p_frame_id = NULL` desequipa (vuelve a la foto
-- sin marco), y siempre está permitido.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.equip_frame(p_frame_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_frame  public.frames;
  v_level  INT;
  v_streak INT;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF p_frame_id IS NULL THEN
    UPDATE public.profiles SET equipped_frame_id = NULL WHERE id = v_caller;
    RETURN;
  END IF;

  SELECT * INTO v_frame FROM public.frames WHERE id = p_frame_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese marco no existe';
  END IF;

  IF v_frame.unlock_type = 'currency' THEN
    RAISE EXCEPTION 'Ese marco todavía no está disponible';
  END IF;

  SELECT level, streak_days INTO v_level, v_streak
  FROM public.profiles WHERE id = v_caller;

  IF v_frame.unlock_type = 'level' AND v_level < v_frame.unlock_value THEN
    RAISE EXCEPTION 'Hace falta nivel % para este marco', v_frame.unlock_value;
  END IF;

  IF v_frame.unlock_type = 'streak' AND v_streak < v_frame.unlock_value THEN
    RAISE EXCEPTION 'Hace falta una racha de % días para este marco', v_frame.unlock_value;
  END IF;

  UPDATE public.profiles SET equipped_frame_id = p_frame_id WHERE id = v_caller;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.equip_frame(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equip_frame(TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. RLS: catálogo público de lectura; nada de INSERT/UPDATE/DELETE desde el
-- cliente, tampoco vía RPC en esta fase.
-- ----------------------------------------------------------------------------
ALTER TABLE public.frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frames_select_all"
  ON public.frames FOR SELECT
  TO authenticated, anon
  USING (true);

REVOKE ALL ON public.frames FROM anon, authenticated;
GRANT SELECT ON public.frames TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. SEMILLA: bronce (nivel) y plata (racha), 5 escalones cada uno. Oro se
-- añade en una migración futura junto con la moneda virtual.
-- Nombres, umbrales y si anima: reflejan el mockup aprobado
-- (avatar-frames-mockup.html) — el umbral de animación es el escalón donde
-- `animated` pasa a TRUE dentro de cada escalera.
-- ----------------------------------------------------------------------------
INSERT INTO public.frames (id, tier, rung, unlock_type, unlock_value, animated, sort_order) VALUES
  ('bronze_1', 'bronze', 1, 'level',  1,   false, 1),
  ('bronze_2', 'bronze', 2, 'level',  25,  false, 2),
  ('bronze_3', 'bronze', 3, 'level',  50,  false, 3),
  ('bronze_4', 'bronze', 4, 'level',  100, true,  4),
  ('bronze_5', 'bronze', 5, 'level',  200, true,  5),
  ('silver_1', 'silver', 1, 'streak', 3,   false, 6),
  ('silver_2', 'silver', 2, 'streak', 7,   true,  7),
  ('silver_3', 'silver', 3, 'streak', 14,  true,  8),
  ('silver_4', 'silver', 4, 'streak', 30,  true,  9),
  ('silver_5', 'silver', 5, 'streak', 60,  true,  10);
