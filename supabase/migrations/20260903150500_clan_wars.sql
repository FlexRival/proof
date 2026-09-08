-- ============================================================================
-- MIGRACIÓN: GUERRAS DE CLANES Y RANGO — Prooffit
--
-- Equivalente de grupo a los duelos 1v1 (`20260903140914_duel_rpcs.sql`):
--   - request_clan_war()      -> el líder reta a otro clan
--   - respond_to_clan_war()   -> el líder rival acepta / rechaza
--   - sync_clan_war_steps()   -> recalcula el marcador de una guerra activa
--   - resolve_clan_war()      -> cierra una guerra vencida y ajusta el rango
--
-- ROSTER CONGELADO: al aceptar la guerra se guarda una foto fija de ambos
-- rosters en `clan_war_participants`. Los pasos se cuentan SOLO de esos
-- usuarios, así meter "caminantes" a mitad de guerra no sirve de nada.
--
-- RANGO: `clans.rank_points` (autoritativo del servidor) sube/baja al resolver.
--   PLACEHOLDER tuneable:  ganador +25 · perdedor -15 (suelo 0) · empate +5 c/u.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TIPO
-- ----------------------------------------------------------------------------
CREATE TYPE public.clan_war_status AS ENUM ('PENDING', 'ACTIVE', 'FINISHED', 'DECLINED');

-- ----------------------------------------------------------------------------
-- 2. TABLA DE GUERRAS
-- ----------------------------------------------------------------------------
CREATE TABLE public.clan_wars (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_clan_id      UUID NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  opponent_clan_id        UUID NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  status                  public.clan_war_status NOT NULL DEFAULT 'PENDING',
  start_date              DATE NOT NULL,
  end_date                DATE NOT NULL,
  challenger_steps        BIGINT NOT NULL DEFAULT 0,
  opponent_steps          BIGINT NOT NULL DEFAULT 0,
  winner_clan_id          UUID REFERENCES public.clans (id) ON DELETE SET NULL,
  challenger_points_delta INT NOT NULL DEFAULT 0,
  opponent_points_delta   INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clan_wars_clans_distinct CHECK (challenger_clan_id <> opponent_clan_id),
  CONSTRAINT clan_wars_date_range     CHECK (end_date >= start_date),
  CONSTRAINT clan_wars_steps_non_neg  CHECK (challenger_steps >= 0 AND opponent_steps >= 0),
  CONSTRAINT clan_wars_winner_is_participant
    CHECK (winner_clan_id IS NULL
           OR winner_clan_id = challenger_clan_id
           OR winner_clan_id = opponent_clan_id)
);

CREATE INDEX clan_wars_challenger_idx ON public.clan_wars (challenger_clan_id);
CREATE INDEX clan_wars_opponent_idx   ON public.clan_wars (opponent_clan_id);
CREATE INDEX clan_wars_status_idx     ON public.clan_wars (status);

-- ----------------------------------------------------------------------------
-- 3. ROSTER CONGELADO
-- ----------------------------------------------------------------------------
CREATE TABLE public.clan_war_participants (
  war_id  UUID NOT NULL REFERENCES public.clan_wars (id) ON DELETE CASCADE,
  clan_id UUID NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,

  PRIMARY KEY (war_id, user_id)
);

CREATE INDEX clan_war_participants_war_clan_idx
  ON public.clan_war_participants (war_id, clan_id);

-- ============================================================================
-- 4. HELPER INTERNO: suma de pasos del roster congelado de un lado.
-- SECURITY DEFINER (lee step_logs de todos los participantes); execute revocado.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.clan_war_step_total(
  p_war_id  UUID,
  p_clan_id UUID,
  p_start   DATE,
  p_end     DATE
)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(SUM(sl.steps_count), 0)::BIGINT
  FROM public.clan_war_participants p
  JOIN public.step_logs sl ON sl.user_id = p.user_id
  WHERE p.war_id = p_war_id
    AND p.clan_id = p_clan_id
    AND sl.date BETWEEN p_start AND p_end;
$$;

REVOKE EXECUTE ON FUNCTION public.clan_war_step_total(UUID, UUID, DATE, DATE) FROM PUBLIC;

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.clan_wars             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_war_participants ENABLE ROW LEVEL SECURITY;

-- Un usuario ve las guerras de los clanes en los que participa.
CREATE POLICY "clan_wars_select_participant"
  ON public.clan_wars FOR SELECT
  TO authenticated
  USING (
    public.is_clan_member(challenger_clan_id, (SELECT auth.uid()))
    OR public.is_clan_member(opponent_clan_id, (SELECT auth.uid()))
  );

CREATE POLICY "clan_war_participants_select_involved"
  ON public.clan_war_participants FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clan_wars w
      WHERE w.id = war_id
        AND ( public.is_clan_member(w.challenger_clan_id, (SELECT auth.uid()))
           OR public.is_clan_member(w.opponent_clan_id, (SELECT auth.uid())) )
    )
  );

-- Sin policies de escritura: todo pasa por las RPCs.

REVOKE ALL ON public.clan_wars             FROM anon, authenticated;
REVOKE ALL ON public.clan_war_participants FROM anon, authenticated;
GRANT SELECT ON public.clan_wars             TO authenticated;
GRANT SELECT ON public.clan_war_participants TO authenticated;

-- ============================================================================
-- 6. RPCs DE GUERRA
-- SECURITY DEFINER, search_path = '', bloqueo FOR UPDATE de la fila de la guerra.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- request_clan_war: el líder del clan retador crea una guerra PENDING.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_clan_war(
  p_opponent_clan_id UUID,
  p_duration_days    INT DEFAULT 7
)
RETURNS public.clan_wars
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller      UUID := (SELECT auth.uid());
  v_challenger  UUID;
  v_opponent    public.clans;
  v_war         public.clan_wars;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT clan_id INTO v_challenger
  FROM public.clan_members
  WHERE user_id = v_caller AND role = 'LEADER';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo el líder de un clan puede iniciar una guerra';
  END IF;

  IF p_opponent_clan_id IS NULL OR p_opponent_clan_id = v_challenger THEN
    RAISE EXCEPTION 'Clan rival inválido';
  END IF;
  IF p_duration_days < 1 OR p_duration_days > 30 THEN
    RAISE EXCEPTION 'La duración debe estar entre 1 y 30 días';
  END IF;

  SELECT * INTO v_opponent FROM public.clans WHERE id = p_opponent_clan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El clan rival no existe';
  END IF;
  IF v_opponent.member_count < 1 THEN
    RAISE EXCEPTION 'El clan rival no tiene miembros';
  END IF;

  -- Una única guerra PENDING/ACTIVE por par de clanes (en cualquier dirección).
  IF EXISTS (
    SELECT 1 FROM public.clan_wars
    WHERE status IN ('PENDING', 'ACTIVE')
      AND ( (challenger_clan_id = v_challenger       AND opponent_clan_id = p_opponent_clan_id)
         OR (challenger_clan_id = p_opponent_clan_id AND opponent_clan_id = v_challenger) )
  ) THEN
    RAISE EXCEPTION 'Ya existe una guerra pendiente o activa con ese clan';
  END IF;

  INSERT INTO public.clan_wars (challenger_clan_id, opponent_clan_id, status, start_date, end_date)
  VALUES (v_challenger, p_opponent_clan_id, 'PENDING', CURRENT_DATE, CURRENT_DATE + p_duration_days)
  RETURNING * INTO v_war;

  RETURN v_war;
END;
$$;

-- ----------------------------------------------------------------------------
-- respond_to_clan_war: el líder del clan rival acepta (ACTIVE) o rechaza.
-- Al aceptar se re-ancla la ventana a hoy y se CONGELA el roster de ambos.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_clan_war(
  p_war_id UUID,
  p_accept BOOLEAN
)
RETURNS public.clan_wars
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_war    public.clan_wars;
  v_len    INT;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guerra no encontrada';
  END IF;
  -- clan_role_of devuelve NULL si el llamante no es miembro; IS DISTINCT FROM
  -- trata ese NULL como "no es líder".
  IF public.clan_role_of(v_war.opponent_clan_id, v_caller) IS DISTINCT FROM 'LEADER' THEN
    RAISE EXCEPTION 'Solo el líder del clan retado puede responder';
  END IF;
  IF v_war.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La guerra ya no está pendiente';
  END IF;

  IF p_accept THEN
    v_len := v_war.end_date - v_war.start_date;

    UPDATE public.clan_wars
    SET status     = 'ACTIVE',
        start_date = CURRENT_DATE,
        end_date   = CURRENT_DATE + v_len
    WHERE id = p_war_id
    RETURNING * INTO v_war;

    INSERT INTO public.clan_war_participants (war_id, clan_id, user_id)
    SELECT p_war_id, cm.clan_id, cm.user_id
    FROM public.clan_members cm
    WHERE cm.clan_id IN (v_war.challenger_clan_id, v_war.opponent_clan_id);
  ELSE
    UPDATE public.clan_wars
    SET status = 'DECLINED'
    WHERE id = p_war_id
    RETURNING * INTO v_war;
  END IF;

  RETURN v_war;
END;
$$;

-- ----------------------------------------------------------------------------
-- sync_clan_war_steps: recalcula el marcador de una guerra ACTIVE.
-- La puede llamar cualquier miembro de cualquiera de los dos clanes.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_clan_war_steps(p_war_id UUID)
RETURNS public.clan_wars
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_war    public.clan_wars;
  v_cutoff DATE;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guerra no encontrada';
  END IF;
  IF v_caller IS NOT NULL
     AND NOT public.is_clan_member(v_war.challenger_clan_id, v_caller)
     AND NOT public.is_clan_member(v_war.opponent_clan_id, v_caller) THEN
    RAISE EXCEPTION 'No participas en esta guerra';
  END IF;
  IF v_war.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'La guerra no está activa';
  END IF;

  v_cutoff := LEAST(CURRENT_DATE, v_war.end_date);

  UPDATE public.clan_wars
  SET challenger_steps = public.clan_war_step_total(p_war_id, v_war.challenger_clan_id, v_war.start_date, v_cutoff),
      opponent_steps   = public.clan_war_step_total(p_war_id, v_war.opponent_clan_id,   v_war.start_date, v_cutoff)
  WHERE id = p_war_id
  RETURNING * INTO v_war;

  RETURN v_war;
END;
$$;

-- ----------------------------------------------------------------------------
-- resolve_clan_war: cierra una guerra vencida y ajusta rank_points.
-- Idempotente: si ya está FINISHED devuelve la fila sin cambios.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_clan_war(p_war_id UUID)
RETURNS public.clan_wars
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_war     public.clan_wars;
  v_c_steps BIGINT;
  v_o_steps BIGINT;
  v_winner  UUID;
  v_c_delta INT;
  v_o_delta INT;
BEGIN
  SELECT * INTO v_war FROM public.clan_wars WHERE id = p_war_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guerra no encontrada';
  END IF;
  IF v_caller IS NOT NULL
     AND NOT public.is_clan_member(v_war.challenger_clan_id, v_caller)
     AND NOT public.is_clan_member(v_war.opponent_clan_id, v_caller) THEN
    RAISE EXCEPTION 'No participas en esta guerra';
  END IF;
  IF v_war.status = 'FINISHED' THEN
    RETURN v_war;                        -- idempotente
  END IF;
  IF v_war.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'La guerra no está activa';
  END IF;
  IF CURRENT_DATE <= v_war.end_date THEN
    RAISE EXCEPTION 'La guerra aún no ha terminado';
  END IF;

  v_c_steps := public.clan_war_step_total(p_war_id, v_war.challenger_clan_id, v_war.start_date, v_war.end_date);
  v_o_steps := public.clan_war_step_total(p_war_id, v_war.opponent_clan_id,   v_war.start_date, v_war.end_date);

  IF v_c_steps > v_o_steps THEN
    v_winner  := v_war.challenger_clan_id;
    v_c_delta := 25;
    v_o_delta := -15;
  ELSIF v_o_steps > v_c_steps THEN
    v_winner  := v_war.opponent_clan_id;
    v_c_delta := -15;
    v_o_delta := 25;
  ELSE
    v_winner  := NULL;                   -- empate
    v_c_delta := 5;
    v_o_delta := 5;
  END IF;

  UPDATE public.clan_wars
  SET status                  = 'FINISHED',
      challenger_steps        = v_c_steps,
      opponent_steps          = v_o_steps,
      winner_clan_id          = v_winner,
      challenger_points_delta = v_c_delta,
      opponent_points_delta   = v_o_delta
  WHERE id = p_war_id
  RETURNING * INTO v_war;

  UPDATE public.clans
  SET rank_points = GREATEST(0, rank_points + v_c_delta)
  WHERE id = v_war.challenger_clan_id;

  UPDATE public.clans
  SET rank_points = GREATEST(0, rank_points + v_o_delta)
  WHERE id = v_war.opponent_clan_id;

  RETURN v_war;
END;
$$;

-- ----------------------------------------------------------------------------
-- disband_clan: reemplazo con el bloqueo de guerra PENDING/ACTIVE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disband_clan()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_clan_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT clan_id INTO v_clan_id
  FROM public.clan_members
  WHERE user_id = v_caller AND role = 'LEADER';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo el líder puede disolver el clan';
  END IF;

  PERFORM 1 FROM public.clans WHERE id = v_clan_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.clan_wars
    WHERE status IN ('PENDING', 'ACTIVE')
      AND (challenger_clan_id = v_clan_id OR opponent_clan_id = v_clan_id)
  ) THEN
    RAISE EXCEPTION 'No puedes disolver el clan con una guerra pendiente o activa';
  END IF;

  DELETE FROM public.clan_members WHERE clan_id = v_clan_id;
  DELETE FROM public.clans WHERE id = v_clan_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- PERMISOS DE EJECUCIÓN
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.request_clan_war(UUID, INT)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_clan_war(UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_clan_war_steps(UUID)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_clan_war(UUID)             FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_clan_war(UUID, INT)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_clan_war(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_clan_war_steps(UUID)          TO authenticated, service_role;
-- resolve_clan_war: también service_role, para un job que cierre guerras vencidas.
GRANT EXECUTE ON FUNCTION public.resolve_clan_war(UUID)             TO authenticated, service_role;

-- ============================================================================
-- 7. REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_wars;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_war_participants;
