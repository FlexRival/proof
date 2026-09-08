-- ============================================================================
-- MIGRACIÓN: PASOS TOTALES — Prooffit
--
-- POR QUÉ EXISTE:
--   La casilla «PASOS TOTALES» de Perfil estaba escrita a fuego en `0` porque
--   no había de dónde sacarla. Traerse todas las filas de `step_logs` al
--   cliente para sumarlas sería absurdo: crece sin techo con cada día jugado y
--   la app solo quiere un número.
--
-- POR QUÉ **NO** ES `SECURITY DEFINER`:
--   A diferencia del resto de RPCs del proyecto, esta no necesita saltarse
--   RLS: la policy `step_logs_select_own` ya limita la tabla a las filas
--   propias, así que como INVOKER suma exactamente lo que el usuario podría
--   leer de todos modos. Hacerla DEFINER solo añadiría otra función con
--   privilegios a la lista del linter de seguridad sin ganar nada.
--
--   El `WHERE` es redundante con la policy y está a propósito: deja la
--   intención escrita y protege el día que alguien toque las policies.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.total_steps()
RETURNS BIGINT
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(steps_count), 0)::BIGINT
  FROM public.step_logs
  WHERE user_id = (SELECT auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.total_steps() TO authenticated;

COMMENT ON FUNCTION public.total_steps() IS
  'Suma de todos los pasos guardados del usuario de la sesión. INVOKER a '
  'propósito: RLS ya limita step_logs a las filas propias.';
