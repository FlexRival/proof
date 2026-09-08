-- ============================================================================
-- MIGRACIÓN: LÓGICA DE DUELOS (RPC) — Prooffit
--
-- Toda mutación de un duelo pasa por funciones SECURITY DEFINER. El cliente
-- (rol `authenticated`) solo puede:
--   - request_duel()      -> pedir un duelo
--   - respond_to_duel()   -> aceptar / rechazar un duelo pendiente
--   - sync_duel_steps()   -> recalcular el marcador de un duelo activo
--   - resolve_duel()      -> cerrar un duelo cuya ventana terminó
-- Nunca escribe pasos, estado ni ganador directamente.
--
-- REGLA DE XP: solo el GANADOR de un duelo gana XP.
--   xp_ganada = floor(pasos_del_ganador_durante_el_duelo / 10)
--   En caso de empate nadie gana XP.
-- El nivel se deriva del XP total (public.level_for_xp).
-- ============================================================================

-- El cliente ya no inserta duelos a mano: se usa request_duel().
DROP POLICY IF EXISTS "duels_insert_as_challenger" ON public.duels;
REVOKE INSERT ON public.duels FROM authenticated;

-- ----------------------------------------------------------------------------
-- Helper: nivel a partir del XP total.
-- PLACEHOLDER tuneable: 1 nivel por cada 1000 XP.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.level_for_xp(p_xp INT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT GREATEST(1, 1 + (GREATEST(p_xp, 0) / 1000));
$$;

-- ----------------------------------------------------------------------------
-- Helper interno: suma de pasos de un usuario dentro de una ventana de fechas.
-- SECURITY DEFINER porque necesita leer step_logs de AMBOS jugadores; por eso
-- se revoca su ejecución directa (solo lo llaman las RPC de abajo).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.duel_step_total(
  p_user_id UUID,
  p_start   DATE,
  p_end     DATE
)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(sl.steps_count), 0)::INT
  FROM public.step_logs sl
  WHERE sl.user_id = p_user_id
    AND sl.date BETWEEN p_start AND p_end;
$$;

REVOKE EXECUTE ON FUNCTION public.duel_step_total(UUID, DATE, DATE) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- request_duel: el retador crea un duelo PENDING contra un oponente.
-- La ventana (start_date..end_date) se ancla de verdad al aceptar.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_duel(
  p_opponent_id   UUID,
  p_duration_days INT DEFAULT 7
)
RETURNS public.duels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenger UUID := (SELECT auth.uid());
  v_duel       public.duels;
BEGIN
  IF v_challenger IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF p_opponent_id IS NULL OR p_opponent_id = v_challenger THEN
    RAISE EXCEPTION 'Oponente inválido';
  END IF;
  IF p_duration_days < 1 OR p_duration_days > 30 THEN
    RAISE EXCEPTION 'La duración debe estar entre 1 y 30 días';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_opponent_id) THEN
    RAISE EXCEPTION 'El oponente no existe';
  END IF;

  -- Un único duelo activo o pendiente por pareja (en cualquier dirección).
  IF EXISTS (
    SELECT 1 FROM public.duels
    WHERE status IN ('PENDING', 'ACTIVE')
      AND ( (challenger_id = v_challenger  AND opponent_id = p_opponent_id)
         OR (challenger_id = p_opponent_id AND opponent_id = v_challenger) )
  ) THEN
    RAISE EXCEPTION 'Ya existe un duelo activo o pendiente con este usuario';
  END IF;

  INSERT INTO public.duels (challenger_id, opponent_id, status, start_date, end_date)
  VALUES (
    v_challenger,
    p_opponent_id,
    'PENDING',
    CURRENT_DATE,
    CURRENT_DATE + p_duration_days
  )
  RETURNING * INTO v_duel;

  RETURN v_duel;
END;
$$;

-- ----------------------------------------------------------------------------
-- respond_to_duel: el oponente acepta (ACTIVE) o rechaza (DECLINED).
-- Al aceptar, la ventana se re-ancla a la fecha de aceptación conservando
-- la duración pedida.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_duel(
  p_duel_id UUID,
  p_accept  BOOLEAN
)
RETURNS public.duels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_duel   public.duels;
  v_len    INT;
BEGIN
  SELECT * INTO v_duel FROM public.duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duelo no encontrado';
  END IF;
  IF v_duel.opponent_id <> v_caller THEN
    RAISE EXCEPTION 'Solo el oponente puede responder a este duelo';
  END IF;
  IF v_duel.status <> 'PENDING' THEN
    RAISE EXCEPTION 'El duelo ya no está pendiente';
  END IF;

  IF p_accept THEN
    v_len := v_duel.end_date - v_duel.start_date;
    UPDATE public.duels
    SET status     = 'ACTIVE',
        start_date = CURRENT_DATE,
        end_date   = CURRENT_DATE + v_len
    WHERE id = p_duel_id
    RETURNING * INTO v_duel;
  ELSE
    UPDATE public.duels
    SET status = 'DECLINED'
    WHERE id = p_duel_id
    RETURNING * INTO v_duel;
  END IF;

  RETURN v_duel;
END;
$$;

-- ----------------------------------------------------------------------------
-- sync_duel_steps: recalcula challenger_steps / opponent_steps de un duelo
-- ACTIVE a partir de step_logs. La puede llamar cualquier participante.
-- Solo cuenta hasta hoy o hasta end_date (lo que ocurra antes).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_duel_steps(p_duel_id UUID)
RETURNS public.duels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_duel   public.duels;
  v_cutoff DATE;
BEGIN
  SELECT * INTO v_duel FROM public.duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duelo no encontrado';
  END IF;
  IF v_caller IS NOT NULL
     AND v_caller <> v_duel.challenger_id
     AND v_caller <> v_duel.opponent_id THEN
    RAISE EXCEPTION 'No participas en este duelo';
  END IF;
  IF v_duel.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'El duelo no está activo';
  END IF;

  v_cutoff := LEAST(CURRENT_DATE, v_duel.end_date);

  UPDATE public.duels
  SET challenger_steps = public.duel_step_total(v_duel.challenger_id, v_duel.start_date, v_cutoff),
      opponent_steps   = public.duel_step_total(v_duel.opponent_id,   v_duel.start_date, v_cutoff)
  WHERE id = p_duel_id
  RETURNING * INTO v_duel;

  RETURN v_duel;
END;
$$;

-- ----------------------------------------------------------------------------
-- resolve_duel: cierra un duelo cuya ventana ya terminó y otorga XP al
-- ganador. La pueden llamar los participantes o un job (service_role).
-- Idempotente: si el duelo ya está FINISHED, devuelve la fila sin cambios.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_duel(p_duel_id UUID)
RETURNS public.duels
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_duel    public.duels;
  v_c_steps INT;
  v_o_steps INT;
  v_winner  UUID;
  v_xp_gain INT;
BEGIN
  SELECT * INTO v_duel FROM public.duels WHERE id = p_duel_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duelo no encontrado';
  END IF;
  IF v_caller IS NOT NULL
     AND v_caller <> v_duel.challenger_id
     AND v_caller <> v_duel.opponent_id THEN
    RAISE EXCEPTION 'No participas en este duelo';
  END IF;
  IF v_duel.status = 'FINISHED' THEN
    RETURN v_duel;                       -- idempotente
  END IF;
  IF v_duel.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'El duelo no está activo';
  END IF;
  IF CURRENT_DATE <= v_duel.end_date THEN
    RAISE EXCEPTION 'El duelo aún no ha terminado';
  END IF;

  v_c_steps := public.duel_step_total(v_duel.challenger_id, v_duel.start_date, v_duel.end_date);
  v_o_steps := public.duel_step_total(v_duel.opponent_id,   v_duel.start_date, v_duel.end_date);

  IF v_c_steps > v_o_steps THEN
    v_winner  := v_duel.challenger_id;
    v_xp_gain := v_c_steps / 10;
  ELSIF v_o_steps > v_c_steps THEN
    v_winner  := v_duel.opponent_id;
    v_xp_gain := v_o_steps / 10;
  ELSE
    v_winner  := NULL;                   -- empate: nadie gana XP
    v_xp_gain := 0;
  END IF;

  UPDATE public.duels
  SET status          = 'FINISHED',
      challenger_steps = v_c_steps,
      opponent_steps   = v_o_steps,
      winner_id        = v_winner
  WHERE id = p_duel_id
  RETURNING * INTO v_duel;

  IF v_winner IS NOT NULL AND v_xp_gain > 0 THEN
    UPDATE public.profiles
    SET xp    = xp + v_xp_gain,
        level = public.level_for_xp(xp + v_xp_gain)
    WHERE id = v_winner;
  END IF;

  RETURN v_duel;
END;
$$;

-- ----------------------------------------------------------------------------
-- PERMISOS DE EJECUCIÓN
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.request_duel(UUID, INT)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_duel(UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_duel_steps(UUID)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_duel(UUID)             FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_duel(UUID, INT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_duel(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_duel_steps(UUID)          TO authenticated, service_role;
-- resolve_duel: también service_role, para un job programado que cierre duelos.
GRANT EXECUTE ON FUNCTION public.resolve_duel(UUID)             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.level_for_xp(INT)              TO authenticated, anon;
