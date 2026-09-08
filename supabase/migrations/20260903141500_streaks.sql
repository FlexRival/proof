-- ============================================================================
-- MIGRACIÓN: RACHAS DE PASOS (STREAKS) — Prooffit
--
-- `profiles.streak_days` es estado derivado: NÚMERO de días consecutivos en los
-- que el usuario alcanzó la meta diaria de pasos. Lo mantiene el servidor a
-- partir de step_logs; el cliente nunca lo escribe.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Meta diaria de pasos que "cuenta" para la racha.
-- PLACEHOLDER tuneable (igual que pasos/10 para XP y xp/1000 para nivel).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_step_goal()
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 6000;
$$;

GRANT EXECUTE ON FUNCTION public.daily_step_goal() TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- recompute_streak: recalcula profiles.streak_days para un usuario.
--
-- Cuenta hacia atrás desde hoy los días consecutivos con steps_count >= meta.
-- Si HOY todavía no llega a la meta, se empieza a contar desde AYER (día de
-- gracia: un día en curso sin terminar no rompe la racha anterior).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_streak(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_goal   INT  := public.daily_step_goal();
  v_streak INT  := 0;
  v_cursor DATE := CURRENT_DATE;
  v_met    BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.step_logs
    WHERE user_id = p_user_id AND date = CURRENT_DATE AND steps_count >= v_goal
  ) INTO v_met;

  IF NOT v_met THEN
    v_cursor := CURRENT_DATE - 1;
  END IF;

  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.step_logs
      WHERE user_id = p_user_id AND date = v_cursor AND steps_count >= v_goal
    ) INTO v_met;

    EXIT WHEN NOT v_met;

    v_streak := v_streak + 1;
    v_cursor := v_cursor - 1;
  END LOOP;

  UPDATE public.profiles
  SET streak_days = v_streak
  WHERE id = p_user_id
    AND streak_days IS DISTINCT FROM v_streak;

  RETURN v_streak;
END;
$$;

-- Solo se llama desde el trigger (que corre como owner) y desde jobs
-- service_role; el cliente no la ejecuta directamente.
REVOKE EXECUTE ON FUNCTION public.recompute_streak(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_streak(UUID) TO service_role;

-- ----------------------------------------------------------------------------
-- Trigger: cada vez que cambian los pasos de un día, recalcular la racha.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.step_logs_touch_streak()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.recompute_streak(NEW.user_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER step_logs_streak
  AFTER INSERT OR UPDATE OF steps_count ON public.step_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.step_logs_touch_streak();
