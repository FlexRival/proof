-- ============================================================================
-- MIGRACIÓN: ANTI-CHEAT DE step_logs — ProofIt (KAN-52)
--
-- EL AGUJERO QUE CIERRA (ver docs/conteo-de-pasos.md §6):
--   `step_logs.steps_count` es el marcador que decide los duelos y las guerras
--   de clanes, y hasta ahora era LA ÚNICA cosa que el cliente escribía a pelo:
--
--     GRANT INSERT (user_id, date, steps_count) ON public.step_logs TO authenticated;
--     GRANT UPDATE (steps_count)               ON public.step_logs TO authenticated;
--
--   El único CHECK era `>= 0`. Cualquiera con la clave publicable —que viaja
--   dentro de la app y es pública por diseño— podía meter 900.000 pasos con un
--   `curl`. Las RLS solo garantizaban que lo hiciera en SU fila.
--
--   Dicho de otra forma: el anti-cheat protegía el premio (xp, level) pero no
--   el marcador que lo reparte. Esta migración lo alinea con el resto del
--   esquema: el cliente ya no escribe la tabla, llama a una RPC.
--
-- HASTA DÓNDE LLEGA (y hasta dónde NO):
--   1. Tope de cordura por día      -> `daily_step_cap()`. El servidor recorta.
--   2. Ventana temporal             -> ni futuro ni rellenar días viejos.
--   3. Monotonía dentro del día     -> el contador sube, nunca baja.
--   4. Procedencia del dato         -> se guarda `source`, pero NO es una
--                                      defensa: el cliente la declara y puede
--                                      mentir. Es calidad de dato y auditoría.
--   Fuera de alcance de la v1: atestación de dispositivo (App Attest / Play
--   Integrity), que es lo único que probaría que quien escribe es la app de
--   verdad. Ninguna de estas medidas cierra el agujero del todo.
--
-- EL FILTRO DE PASOS METIDOS A MANO SE HACE EN EL CLIENTE, y tiene que ser así:
--   Health Connect expone `recordingMethod` (AUTOMATIC / ACTIVELY_RECORDED /
--   MANUAL / UNKNOWN) y HealthKit expone `HKWasUserEntered`. Esos metadatos
--   NUNCA llegan al servidor —solo el total ya agregado—, así que descartar lo
--   introducido a mano es responsabilidad de `src/lib/steps/`. Aquí solo se
--   registra qué dijo el cliente que estaba haciendo.
--
-- SEÑALES AL CLIENTE (misma convención que `ERRCODE = 'PRO01'` de §6):
--   'STP01' -> fecha fuera de la ventana permitida (futuro o demasiado atrás).
--   'STP02' -> origen de datos no reconocido.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helpers tuneables (mismo patrón que `daily_step_goal()` y
--    `free_tier_daily_duel_limit()`: PLACEHOLDERS, no verdades reveladas).
-- ----------------------------------------------------------------------------

-- Máximo de pasos que el servidor acepta para un día. Por encima, recorta.
-- 60.000 pasos ~ 45 km andando: generoso para un senderista y absurdo para un
-- sedentario. Un ultrafondista real toparía aquí; se asume a cambio de que el
-- tramposo casual no pueda ganar un duelo desde la terminal.
CREATE OR REPLACE FUNCTION public.daily_step_cap()
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 60000;
$$;

-- Cuántos días hacia atrás se puede sincronizar. Cubre el caso legítimo —el
-- móvil estuvo sin conexión, o el usuario no abrió la app en unos días— sin
-- dejar reescribir la historia de un duelo que empezó hace semanas.
CREATE OR REPLACE FUNCTION public.step_sync_backfill_days()
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT 7;
$$;

GRANT EXECUTE ON FUNCTION public.daily_step_cap()          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.step_sync_backfill_days() TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- 2. Columnas de auditoría en `step_logs`
--
-- Nullable a propósito: las filas que ya existan no tienen procedencia y no se
-- puede inventar. `reported_steps` guarda el MÁXIMO que el cliente ha llegado a
-- reclamar para ese día antes de recortar —no la última cifra—, que es justo el
-- dato que hace falta para detectar a alguien chocando contra el tope un día
-- tras otro. Que sea mayor que `steps_count` significa que hubo recorte.
-- ----------------------------------------------------------------------------
ALTER TABLE public.step_logs
  ADD COLUMN IF NOT EXISTS source         TEXT,
  ADD COLUMN IF NOT EXISTS reported_steps INT,
  ADD COLUMN IF NOT EXISTS synced_at      TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'step_logs_source_known'
  ) THEN
    ALTER TABLE public.step_logs
      ADD CONSTRAINT step_logs_source_known
      CHECK (source IS NULL OR source IN ('healthkit', 'health-connect', 'pedometer'));
  END IF;

  -- Tope estructural, independiente del recorte de la RPC. Es un cinturón de
  -- seguridad frente a un bug del servidor o un seed mal hecho, no el límite de
  -- juego: ese es `daily_step_cap()`, que se puede subir o bajar sin migrar.
  --
  -- `NOT VALID` a propósito: rige sobre todo lo que se escriba a partir de
  -- ahora, pero no escanea la tabla entera al aplicar la migración. Si en la
  -- base ya viviera una fila absurda —de las que se metían cuando el cliente
  -- escribía directo— un `ADD CONSTRAINT` normal tumbaría el `db push`. Se
  -- puede validar a posteriori con `VALIDATE CONSTRAINT` cuando se sepa que
  -- los datos están limpios.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'step_logs_steps_physically_plausible'
  ) THEN
    ALTER TABLE public.step_logs
      ADD CONSTRAINT step_logs_steps_physically_plausible
      CHECK (steps_count <= 250000) NOT VALID;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. La RPC: única vía por la que el cliente escribe pasos
--
-- MONOTONÍA (`GREATEST`): dentro de un mismo día el contador solo puede subir.
-- HealthKit y Health Connect acumulan a lo largo del día, así que una lectura
-- menor que la guardada significa casi siempre una fuente peor informada —un
-- móvil recién reinstalado devolviendo 0, o un segundo dispositivo que no
-- estaba en el bolsillo— y dejarla pisar el valor borraría pasos reales en
-- mitad de un duelo. Efecto colateral aceptado: una corrección legítima a la
-- baja no se puede hacer desde la app, hace falta `service_role`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_daily_steps(
  p_date   DATE,
  p_steps  INT,
  p_source TEXT
)
RETURNS public.step_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user     UUID := (SELECT auth.uid());
  v_capped   INT;
  v_earliest DATE;
  v_row      public.step_logs;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  IF p_date IS NULL OR p_steps IS NULL THEN
    RAISE EXCEPTION 'Fecha y pasos son obligatorios';
  END IF;

  IF p_steps < 0 THEN
    RAISE EXCEPTION 'Los pasos no pueden ser negativos';
  END IF;

  IF p_source IS NULL OR p_source NOT IN ('healthkit', 'health-connect', 'pedometer') THEN
    RAISE EXCEPTION 'Origen de datos no reconocido: %', p_source
      USING ERRCODE = 'STP02';
  END IF;

  -- El cliente manda su fecha LOCAL y `CURRENT_DATE` es UTC, así que el día del
  -- usuario puede ir uno por delante (UTC+14 existe) o uno por detrás (toda
  -- América, cada madrugada de UTC). El margen es de un día POR LOS DOS LADOS:
  -- sin el de atrás, quien sincroniza desde Los Ángeles manda un día que el
  -- servidor considera demasiado viejo y lo pierde.
  v_earliest := CURRENT_DATE - (public.step_sync_backfill_days() + 1);
  IF p_date > CURRENT_DATE + 1 OR p_date < v_earliest THEN
    RAISE EXCEPTION
      'Fecha fuera de la ventana sincronizable (% .. %)', v_earliest, CURRENT_DATE + 1
      USING ERRCODE = 'STP01';
  END IF;

  v_capped := LEAST(p_steps, public.daily_step_cap());

  -- El alias `sl` es la fila que YA está guardada; `EXCLUDED`, la que se
  -- intentaba insertar. Sin alias habría que escribir `public.step_logs.col`,
  -- que es válido pero se lee fatal justo donde importa entender cuál es cuál.
  INSERT INTO public.step_logs AS sl (user_id, date, steps_count, source, reported_steps, synced_at)
  VALUES (v_user, p_date, v_capped, p_source, p_steps, NOW())
  ON CONFLICT (user_id, date) DO UPDATE
    SET steps_count    = GREATEST(sl.steps_count, EXCLUDED.steps_count),
        -- El origen tiene que describir la lectura que GANA, no la última que
        -- llegó: si el podómetro reporta menos que lo ya guardado por Health
        -- Connect, la fila seguiría diciendo `pedometer` sobre unos pasos que
        -- midió Health Connect, y la columna de auditoría mentiría.
        source         = CASE
                           WHEN EXCLUDED.steps_count >= sl.steps_count THEN EXCLUDED.source
                           ELSE sl.source
                         END,
        reported_steps = GREATEST(COALESCE(sl.reported_steps, 0), EXCLUDED.reported_steps),
        -- Siempre la última: es "cuándo se sincronizó por última vez", no
        -- "cuándo se guardó el valor que hay". Una sincronización que no cambia
        -- nada sigue siendo una sincronización.
        synced_at      = EXCLUDED.synced_at
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Versión por lotes
--
-- `readDailySteps(desde, hasta)` devuelve un rango, y en móvil una petición de
-- red por día es un desperdicio. Recibe un array JSON de
-- `{"date": "YYYY-MM-DD", "steps": 1234, "source": "healthkit"}` y reutiliza
-- entera la RPC de arriba: las validaciones no se duplican, así que no pueden
-- divergir.
--
-- TODO O NADA, MENOS PARA `STP01`. Un lote es UNA transacción: si un día
-- revienta, se pierden todos los demás. Para un origen inventado o un JSON mal
-- formado eso es lo correcto —es un bug del cliente y hay que verlo—, pero para
-- una fecha fuera de ventana no: el cliente y el servidor calculan «hoy» en
-- husos distintos, así que un día de más en el borde es divergencia normal, y
-- dejar que se lleve por delante los pasos de HOY en mitad de un duelo sería un
-- desastre por un problema cosmético. Esos días se saltan.
--
-- El cliente se entera igual: la función devuelve UNA FILA POR DÍA GUARDADO, no
-- por día enviado, así que comparar lo que mandó con lo que le vuelve dice
-- exactamente qué se descartó. No es un fallo silencioso, es un fallo que se
-- reporta en el valor de retorno en vez de en una excepción.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_daily_steps_batch(p_days JSONB)
RETURNS SETOF public.step_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_day JSONB;
BEGIN
  IF p_days IS NULL OR jsonb_typeof(p_days) <> 'array' THEN
    RAISE EXCEPTION 'Se esperaba un array de días';
  END IF;

  -- Tope de lote: exactamente la ventana que acepta `sync_daily_steps` —los
  -- días de backfill, hoy, y un día de margen de huso a cada lado—, ni uno más.
  -- Impide usar esta RPC como un bucle de escritura masiva.
  IF jsonb_array_length(p_days) > public.step_sync_backfill_days() + 3 THEN
    RAISE EXCEPTION 'Demasiados días en un solo lote';
  END IF;

  FOR v_day IN SELECT * FROM jsonb_array_elements(p_days)
  LOOP
    BEGIN
      RETURN QUERY
        SELECT * FROM public.sync_daily_steps(
          (v_day ->> 'date')::DATE,
          (v_day ->> 'steps')::INT,
          v_day ->> 'source'
        );
    EXCEPTION
      -- Solo esta. Cualquier otro error sigue subiendo y abortando el lote.
      WHEN SQLSTATE 'STP01' THEN
        CONTINUE;
    END;
  END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Los dientes: quitarle al cliente la escritura directa
--
-- Mismo movimiento que hizo `20260903140914_duel_rpcs.sql` con `duels` en
-- cuanto existió `request_duel`. A partir de aquí `authenticated` solo LEE
-- `step_logs`; escribir es exclusivamente vía RPC.
--
-- Las policies RLS de INSERT/UPDATE se dejan vivas a propósito: sin grants no
-- hacen nada, pero si alguien reintroduce un GRANT por error siguen acotando la
-- escritura a las filas propias. Defensa en profundidad, coste cero.
-- ----------------------------------------------------------------------------
REVOKE INSERT (user_id, date, steps_count) ON public.step_logs FROM authenticated;
REVOKE UPDATE (steps_count)                ON public.step_logs FROM authenticated;
REVOKE INSERT, UPDATE                      ON public.step_logs FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_daily_steps(DATE, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sync_daily_steps(DATE, INT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_daily_steps_batch(JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.sync_daily_steps_batch(JSONB) TO authenticated;
