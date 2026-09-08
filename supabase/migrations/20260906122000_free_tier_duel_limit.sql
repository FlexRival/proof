-- ============================================================================
-- MIGRACIÓN: LÍMITE DE DUELOS DE LA VERSIÓN GRATUITA — Prooffit
--
-- Primera puerta de pago del proyecto (ver SCHEMA.md §15 y §6):
--   - Un usuario GRATIS (`profiles.is_pro = false`) solo puede CREAR un número
--     limitado de duelos por día natural del servidor.
--   - Un usuario PRO no tiene límite.
--
-- El límite vive DENTRO de `request_duel`, no en una Edge Function: es la única
-- vía por la que el cliente puede crear un duelo (`INSERT` directo está
-- revocado desde `20260903140914_duel_rpcs.sql`), así que aquí es infranqueable
-- y coherente con el modelo anti-cheat — el servidor no se fía del cliente.
--
-- QUÉ CUENTA PARA EL CUPO: duelos creados hoy por el usuario como retador cuyo
-- estado NO sea `DECLINED`. Que el oponente rechace un duelo que le mandaste no
-- te gasta el cupo; y como no puedes rechazar tus propios duelos salientes, no
-- es explotable. `respond_to_duel` (aceptar un duelo que te mandan) no cuenta:
-- el límite es solo sobre CREAR.
--
-- SEÑAL AL CLIENTE: el rechazo por cupo se lanza con `ERRCODE = 'PRO01'` para
-- que el repositorio del cliente lo distinga de un error genérico y enrute al
-- paywall en vez de mostrar un toast de error.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: cuántos duelos puede crear al día un usuario gratis.
-- PLACEHOLDER tuneable (igual que `daily_step_goal()` para la racha).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.free_tier_daily_duel_limit()
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 1;
$$;

GRANT EXECUTE ON FUNCTION public.free_tier_daily_duel_limit() TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- request_duel: redefinición. Idéntica a `20260903140914_duel_rpcs.sql` salvo
-- por el bloque "Límite de la versión gratuita" antes del INSERT.
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
  v_is_pro     BOOLEAN;
  v_limit      INT;
  v_used       INT;
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

  -- Límite de la versión gratuita: N duelos creados al día. Pro sin límite.
  SELECT is_pro INTO v_is_pro FROM public.profiles WHERE id = v_challenger;
  IF NOT COALESCE(v_is_pro, FALSE) THEN
    v_limit := public.free_tier_daily_duel_limit();
    SELECT COUNT(*) INTO v_used
    FROM public.duels
    WHERE challenger_id = v_challenger
      AND status <> 'DECLINED'
      AND created_at >= date_trunc('day', now());

    IF v_used >= v_limit THEN
      RAISE EXCEPTION
        'Límite de la versión gratuita: % duelo(s) al día. Hazte Pro para retar sin límite.', v_limit
        USING ERRCODE = 'PRO01';
    END IF;
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

-- Los grants de `request_duel` sobreviven a CREATE OR REPLACE, pero se
-- re-afirman para que esta migración sea legible por sí sola.
REVOKE EXECUTE ON FUNCTION public.request_duel(UUID, INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.request_duel(UUID, INT) TO authenticated;
