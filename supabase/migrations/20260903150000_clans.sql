-- ============================================================================
-- MIGRACIÓN: CLANES — Prooffit
--
-- Capa social sobre profiles/step_logs/duels. Un clan tiene un LÍDER, oficiales
-- y miembros. La gente pide entrar (el líder / oficiales aceptan) o entra con un
-- código de invitación compartible. El líder / oficiales expulsan miembros.
--
-- Modelo de seguridad (igual que el resto del esquema):
--   - El cliente (rol `authenticated`) NUNCA escribe estas tablas directamente:
--     REVOKE ALL + GRANT SELECT. Toda mutación pasa por funciones
--     `SECURITY DEFINER` con `SET search_path = ''` y nombres cualificados.
--   - `clans.rank_points` y `clans.member_count` son AUTORITATIVOS DEL SERVIDOR.
--   - Un usuario pertenece como mucho a UN clan (UNIQUE en clan_members.user_id).
--
-- Las guerras de clanes y el rango competitivo van en la migración siguiente
-- (`20260903150500_clan_wars.sql`).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TIPOS
-- ----------------------------------------------------------------------------
CREATE TYPE public.clan_role AS ENUM ('LEADER', 'OFFICER', 'MEMBER');
CREATE TYPE public.clan_join_request_status AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

-- ----------------------------------------------------------------------------
-- 2. TABLA DE CLANES
-- ----------------------------------------------------------------------------
CREATE TABLE public.clans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL UNIQUE,
  tag           TEXT NOT NULL UNIQUE,
  description   TEXT,
  leader_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  rank_points   INT NOT NULL DEFAULT 0,
  member_count  INT NOT NULL DEFAULT 0,
  max_members   INT NOT NULL DEFAULT 20,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clans_name_length   CHECK (char_length(name) BETWEEN 3 AND 24),
  CONSTRAINT clans_tag_length    CHECK (char_length(tag) BETWEEN 2 AND 5),
  CONSTRAINT clans_desc_length   CHECK (description IS NULL OR char_length(description) <= 200),
  CONSTRAINT clans_rank_non_neg  CHECK (rank_points >= 0),
  CONSTRAINT clans_count_non_neg CHECK (member_count >= 0),
  CONSTRAINT clans_max_members_range CHECK (max_members BETWEEN 2 AND 50)
);

-- ----------------------------------------------------------------------------
-- 3. MIEMBROS DE CLAN
-- Un solo clan por usuario (UNIQUE user_id) y un solo líder por clan
-- (índice único parcial).
-- ----------------------------------------------------------------------------
CREATE TABLE public.clan_members (
  clan_id         UUID NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role            public.clan_role NOT NULL DEFAULT 'MEMBER',
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (clan_id, user_id),
  CONSTRAINT clan_members_one_clan_per_user UNIQUE (user_id)
);

CREATE UNIQUE INDEX clan_members_one_leader
  ON public.clan_members (clan_id)
  WHERE role = 'LEADER';

CREATE INDEX clan_members_user_idx ON public.clan_members (user_id);

-- ----------------------------------------------------------------------------
-- 4. SOLICITUDES DE INGRESO
-- ----------------------------------------------------------------------------
CREATE TABLE public.clan_join_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id       UUID NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status        public.clan_join_request_status NOT NULL DEFAULT 'PENDING',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,
  responded_by  UUID REFERENCES public.profiles (id) ON DELETE SET NULL
);

-- Una única solicitud viva por (clan, usuario).
CREATE UNIQUE INDEX clan_join_requests_one_pending
  ON public.clan_join_requests (clan_id, user_id)
  WHERE status = 'PENDING';

CREATE INDEX clan_join_requests_clan_idx ON public.clan_join_requests (clan_id);
CREATE INDEX clan_join_requests_user_idx ON public.clan_join_requests (user_id);

-- ----------------------------------------------------------------------------
-- 5. INVITACIONES POR CÓDIGO (compartir el clan)
-- ----------------------------------------------------------------------------
CREATE TABLE public.clan_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clan_id     UUID NOT NULL REFERENCES public.clans (id) ON DELETE CASCADE,
  code        TEXT NOT NULL UNIQUE,
  created_by  UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  max_uses    INT NOT NULL DEFAULT 0,   -- 0 = ilimitado
  uses        INT NOT NULL DEFAULT 0,
  revoked     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT clan_invites_max_uses_non_neg CHECK (max_uses >= 0),
  CONSTRAINT clan_invites_uses_non_neg     CHECK (uses >= 0)
);

CREATE INDEX clan_invites_clan_idx ON public.clan_invites (clan_id);

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- 6.1 updated_at automático en clans.
CREATE TRIGGER clans_set_updated_at
  BEFORE UPDATE ON public.clans
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime (updated_at);

-- 6.2 clans.member_count derivado de clan_members.
CREATE OR REPLACE FUNCTION public.clan_members_maintain_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_clan_id UUID := COALESCE(NEW.clan_id, OLD.clan_id);
BEGIN
  -- Si el clan ya no existe (cascada de disband) el UPDATE no afecta filas.
  UPDATE public.clans
  SET member_count = (
    SELECT count(*) FROM public.clan_members WHERE clan_id = v_clan_id
  )
  WHERE id = v_clan_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER clan_members_count
  AFTER INSERT OR DELETE ON public.clan_members
  FOR EACH ROW
  EXECUTE FUNCTION public.clan_members_maintain_count();

-- ============================================================================
-- 7. HELPERS
-- SECURITY DEFINER para que las policies RLS puedan consultarlos sin recursión
-- sobre clan_members.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clan_role_of(p_clan_id UUID, p_user_id UUID)
RETURNS public.clan_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.clan_members
  WHERE clan_id = p_clan_id AND user_id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_clan_member(p_clan_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = p_clan_id AND user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_clan(p_clan_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = p_clan_id
      AND user_id = p_user_id
      AND role IN ('LEADER', 'OFFICER')
  );
$$;

-- Tier a partir de rank_points. PLACEHOLDER tuneable (igual que level_for_xp).
CREATE OR REPLACE FUNCTION public.clan_tier_for_points(p_points INT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_points, 0) < 100  THEN 'BRONZE'
    WHEN p_points < 300               THEN 'SILVER'
    WHEN p_points < 700               THEN 'GOLD'
    WHEN p_points < 1500              THEN 'PLATINUM'
    ELSE 'DIAMOND'
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.clan_role_of(UUID, UUID)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_clan_member(UUID, UUID)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_clan(UUID, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.clan_role_of(UUID, UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_clan_member(UUID, UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_clan(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clan_tier_for_points(INT)   TO authenticated, anon;

-- ============================================================================
-- 8. VISTA: LEADERBOARD DE CLANES
-- ============================================================================
CREATE VIEW public.clan_leaderboard
WITH (security_invoker = on)
AS
  SELECT
    c.id,
    c.name,
    c.tag,
    c.rank_points,
    public.clan_tier_for_points(c.rank_points) AS tier,
    RANK() OVER (ORDER BY c.rank_points DESC, c.created_at ASC) AS "position",
    c.member_count
  FROM public.clans c;

GRANT SELECT ON public.clan_leaderboard TO authenticated, anon;

-- ============================================================================
-- 9. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.clans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clan_invites       ENABLE ROW LEVEL SECURITY;

-- ---- CLANS: listado / búsqueda público ------------------------------------
CREATE POLICY "clans_select_all"
  ON public.clans FOR SELECT
  TO authenticated, anon
  USING (true);

-- ---- CLAN_MEMBERS: rosters públicos (factor viral) -----------------------
CREATE POLICY "clan_members_select_all"
  ON public.clan_members FOR SELECT
  TO authenticated, anon
  USING (true);

-- ---- CLAN_JOIN_REQUESTS: el solicitante y quien gestiona el clan ---------
CREATE POLICY "clan_join_requests_select_involved"
  ON public.clan_join_requests FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.can_manage_clan(clan_id, (SELECT auth.uid()))
  );

-- ---- CLAN_INVITES: solo miembros del clan --------------------------------
CREATE POLICY "clan_invites_select_members"
  ON public.clan_invites FOR SELECT
  TO authenticated
  USING (public.is_clan_member(clan_id, (SELECT auth.uid())));

-- No hay policies de INSERT/UPDATE/DELETE: todo pasa por las RPCs de abajo.

-- ============================================================================
-- 10. GRANTS DE TABLA (el cliente solo lee)
-- ============================================================================
REVOKE ALL ON public.clans              FROM anon, authenticated;
REVOKE ALL ON public.clan_members       FROM anon, authenticated;
REVOKE ALL ON public.clan_join_requests FROM anon, authenticated;
REVOKE ALL ON public.clan_invites       FROM anon, authenticated;

GRANT SELECT ON public.clans              TO anon, authenticated;
GRANT SELECT ON public.clan_members       TO anon, authenticated;
GRANT SELECT ON public.clan_join_requests TO authenticated;
GRANT SELECT ON public.clan_invites       TO authenticated;

-- ============================================================================
-- 11. RPCs DE MEMBRESÍA
-- Todas: SECURITY DEFINER, search_path = '', nombres cualificados, y bloqueo
-- FOR UPDATE de la fila del clan cuando cambian miembros o capacidad.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- create_clan: el llamante funda un clan y queda como LEADER.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_clan(
  p_name        TEXT,
  p_tag         TEXT,
  p_description  TEXT DEFAULT NULL
)
RETURNS public.clans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_clan   public.clans;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_caller) THEN
    RAISE EXCEPTION 'Ya perteneces a un clan';
  END IF;
  IF char_length(coalesce(trim(p_name), '')) NOT BETWEEN 3 AND 24 THEN
    RAISE EXCEPTION 'El nombre del clan debe tener entre 3 y 24 caracteres';
  END IF;
  IF char_length(coalesce(trim(p_tag), '')) NOT BETWEEN 2 AND 5 THEN
    RAISE EXCEPTION 'La etiqueta del clan debe tener entre 2 y 5 caracteres';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE lower(name) = lower(trim(p_name))) THEN
    RAISE EXCEPTION 'Ya existe un clan con ese nombre';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clans WHERE lower(tag) = lower(trim(p_tag))) THEN
    RAISE EXCEPTION 'Ya existe un clan con esa etiqueta';
  END IF;

  INSERT INTO public.clans (name, tag, description, leader_id)
  VALUES (trim(p_name), upper(trim(p_tag)), NULLIF(trim(p_description), ''), v_caller)
  RETURNING * INTO v_clan;

  INSERT INTO public.clan_members (clan_id, user_id, role)
  VALUES (v_clan.id, v_caller, 'LEADER');

  RETURN v_clan;
END;
$$;

-- ----------------------------------------------------------------------------
-- request_to_join_clan: crea una solicitud PENDING.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_to_join_clan(p_clan_id UUID)
RETURNS public.clan_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_clan    public.clans;
  v_request public.clan_join_requests;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_caller) THEN
    RAISE EXCEPTION 'Ya perteneces a un clan';
  END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = p_clan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El clan no existe';
  END IF;
  IF v_clan.member_count >= v_clan.max_members THEN
    RAISE EXCEPTION 'El clan está lleno';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.clan_join_requests
    WHERE clan_id = p_clan_id AND user_id = v_caller AND status = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'Ya tienes una solicitud pendiente para este clan';
  END IF;

  INSERT INTO public.clan_join_requests (clan_id, user_id)
  VALUES (p_clan_id, v_caller)
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

-- ----------------------------------------------------------------------------
-- cancel_join_request: el solicitante retira su propia solicitud PENDING.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_join_request(p_request_id UUID)
RETURNS public.clan_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_request public.clan_join_requests;
BEGIN
  SELECT * INTO v_request FROM public.clan_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  IF v_request.user_id <> v_caller THEN
    RAISE EXCEPTION 'Solo puedes cancelar tus propias solicitudes';
  END IF;
  IF v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente';
  END IF;

  UPDATE public.clan_join_requests
  SET status = 'CANCELLED', responded_at = NOW(), responded_by = v_caller
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

-- ----------------------------------------------------------------------------
-- respond_to_join_request: líder u oficial acepta / rechaza.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_join_request(
  p_request_id UUID,
  p_accept     BOOLEAN
)
RETURNS public.clan_join_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_request public.clan_join_requests;
  v_clan    public.clans;
BEGIN
  SELECT * INTO v_request FROM public.clan_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  IF NOT public.can_manage_clan(v_request.clan_id, v_caller) THEN
    RAISE EXCEPTION 'No puedes gestionar solicitudes de este clan';
  END IF;
  IF v_request.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente';
  END IF;

  IF p_accept THEN
    SELECT * INTO v_clan FROM public.clans WHERE id = v_request.clan_id FOR UPDATE;

    IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_request.user_id) THEN
      RAISE EXCEPTION 'El usuario ya pertenece a un clan';
    END IF;
    IF v_clan.member_count >= v_clan.max_members THEN
      RAISE EXCEPTION 'El clan está lleno';
    END IF;

    INSERT INTO public.clan_members (clan_id, user_id, role)
    VALUES (v_request.clan_id, v_request.user_id, 'MEMBER');

    UPDATE public.clan_join_requests
    SET status = 'ACCEPTED', responded_at = NOW(), responded_by = v_caller
    WHERE id = p_request_id
    RETURNING * INTO v_request;
  ELSE
    UPDATE public.clan_join_requests
    SET status = 'REJECTED', responded_at = NOW(), responded_by = v_caller
    WHERE id = p_request_id
    RETURNING * INTO v_request;
  END IF;

  RETURN v_request;
END;
$$;

-- ----------------------------------------------------------------------------
-- create_clan_invite: líder u oficial genera un código compartible.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_clan_invite(
  p_clan_id          UUID,
  p_expires_in_hours INT DEFAULT 168,
  p_max_uses         INT DEFAULT 0
)
RETURNS public.clan_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_code   TEXT;
  v_invite public.clan_invites;
  v_try    INT := 0;
BEGIN
  IF NOT public.can_manage_clan(p_clan_id, v_caller) THEN
    RAISE EXCEPTION 'No puedes crear invitaciones para este clan';
  END IF;
  IF p_expires_in_hours < 1 OR p_expires_in_hours > 720 THEN
    RAISE EXCEPTION 'La caducidad debe estar entre 1 y 720 horas';
  END IF;
  IF p_max_uses < 0 OR p_max_uses > 1000 THEN
    RAISE EXCEPTION 'max_uses debe estar entre 0 (ilimitado) y 1000';
  END IF;

  LOOP
    v_try := v_try + 1;
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) FROM 1 FOR 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clan_invites WHERE code = v_code);
    IF v_try >= 10 THEN
      RAISE EXCEPTION 'No se pudo generar un código de invitación único';
    END IF;
  END LOOP;

  INSERT INTO public.clan_invites (clan_id, code, created_by, expires_at, max_uses)
  VALUES (
    p_clan_id,
    v_code,
    v_caller,
    NOW() + make_interval(hours => p_expires_in_hours),
    p_max_uses
  )
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

-- ----------------------------------------------------------------------------
-- revoke_clan_invite: líder u oficial invalida un código.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_clan_invite(p_invite_id UUID)
RETURNS public.clan_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_invite public.clan_invites;
BEGIN
  SELECT * INTO v_invite FROM public.clan_invites WHERE id = p_invite_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitación no encontrada';
  END IF;
  IF NOT public.can_manage_clan(v_invite.clan_id, v_caller) THEN
    RAISE EXCEPTION 'No puedes gestionar invitaciones de este clan';
  END IF;

  UPDATE public.clan_invites
  SET revoked = TRUE
  WHERE id = p_invite_id
  RETURNING * INTO v_invite;

  RETURN v_invite;
END;
$$;

-- ----------------------------------------------------------------------------
-- join_clan_with_invite: cualquiera con un código válido entra como MEMBER.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_clan_with_invite(p_code TEXT)
RETURNS public.clans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_invite public.clan_invites;
  v_clan   public.clans;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF EXISTS (SELECT 1 FROM public.clan_members WHERE user_id = v_caller) THEN
    RAISE EXCEPTION 'Ya perteneces a un clan';
  END IF;

  SELECT * INTO v_invite
  FROM public.clan_invites
  WHERE code = upper(trim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de invitación inválido';
  END IF;
  IF v_invite.revoked THEN
    RAISE EXCEPTION 'Esta invitación fue revocada';
  END IF;
  IF v_invite.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Esta invitación ha caducado';
  END IF;
  IF v_invite.max_uses <> 0 AND v_invite.uses >= v_invite.max_uses THEN
    RAISE EXCEPTION 'Esta invitación ya no tiene usos disponibles';
  END IF;

  SELECT * INTO v_clan FROM public.clans WHERE id = v_invite.clan_id FOR UPDATE;
  IF v_clan.member_count >= v_clan.max_members THEN
    RAISE EXCEPTION 'El clan está lleno';
  END IF;

  INSERT INTO public.clan_members (clan_id, user_id, role)
  VALUES (v_clan.id, v_caller, 'MEMBER');

  UPDATE public.clan_invites SET uses = uses + 1 WHERE id = v_invite.id;

  RETURN v_clan;
END;
$$;

-- ----------------------------------------------------------------------------
-- leave_clan: el llamante abandona su clan.
--   - MIEMBRO / OFICIAL: se borra su membresía.
--   - LÍDER sin más miembros: el clan se disuelve.
--   - LÍDER con miembros: el liderazgo pasa al OFICIAL más antiguo. Si no hay
--     oficiales, falla y pide ascender a alguien o disolver.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_clan()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller     UUID := (SELECT auth.uid());
  v_membership public.clan_members;
  v_others     INT;
  v_new_leader UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT * INTO v_membership FROM public.clan_members WHERE user_id = v_caller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No perteneces a ningún clan';
  END IF;

  PERFORM 1 FROM public.clans WHERE id = v_membership.clan_id FOR UPDATE;

  IF v_membership.role <> 'LEADER' THEN
    DELETE FROM public.clan_members
    WHERE clan_id = v_membership.clan_id AND user_id = v_caller;
    RETURN;
  END IF;

  SELECT count(*) INTO v_others
  FROM public.clan_members
  WHERE clan_id = v_membership.clan_id AND user_id <> v_caller;

  IF v_others = 0 THEN
    -- Disolver: borrar miembros explícitamente antes del clan para no ejecutar
    -- el trigger de recuento contra una fila de clan que se está borrando.
    DELETE FROM public.clan_members WHERE clan_id = v_membership.clan_id;
    DELETE FROM public.clans WHERE id = v_membership.clan_id;
    RETURN;
  END IF;

  SELECT user_id INTO v_new_leader
  FROM public.clan_members
  WHERE clan_id = v_membership.clan_id AND role = 'OFFICER'
  ORDER BY role_changed_at ASC, joined_at ASC
  LIMIT 1;

  IF v_new_leader IS NULL THEN
    RAISE EXCEPTION 'Asciende a un oficial o disuelve el clan antes de salir';
  END IF;

  -- Borrar primero al líder saliente libera el índice único parcial de LEADER.
  DELETE FROM public.clan_members
  WHERE clan_id = v_membership.clan_id AND user_id = v_caller;

  UPDATE public.clan_members
  SET role = 'LEADER', role_changed_at = NOW()
  WHERE clan_id = v_membership.clan_id AND user_id = v_new_leader;

  UPDATE public.clans SET leader_id = v_new_leader WHERE id = v_membership.clan_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- remove_clan_member: líder u oficial expulsa a un miembro.
--   - El LÍDER puede expulsar a cualquiera menos a sí mismo.
--   - Un OFICIAL solo puede expulsar a MIEMBROS.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_clan_member(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller      UUID := (SELECT auth.uid());
  v_caller_role public.clan_role;
  v_clan_id     UUID;
  v_target_role public.clan_role;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'Usa leave_clan para salir del clan';
  END IF;

  SELECT clan_id, role INTO v_clan_id, v_caller_role
  FROM public.clan_members WHERE user_id = v_caller;
  IF NOT FOUND OR v_caller_role NOT IN ('LEADER', 'OFFICER') THEN
    RAISE EXCEPTION 'No puedes expulsar miembros de este clan';
  END IF;

  PERFORM 1 FROM public.clans WHERE id = v_clan_id FOR UPDATE;

  SELECT role INTO v_target_role
  FROM public.clan_members
  WHERE clan_id = v_clan_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese usuario no está en tu clan';
  END IF;

  IF v_caller_role = 'OFFICER' AND v_target_role <> 'MEMBER' THEN
    RAISE EXCEPTION 'Un oficial solo puede expulsar a miembros';
  END IF;

  DELETE FROM public.clan_members
  WHERE clan_id = v_clan_id AND user_id = p_user_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- transfer_clan_leadership: el líder pasa el mando a otro miembro.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transfer_clan_leadership(p_new_leader_id UUID)
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
  IF p_new_leader_id = v_caller THEN
    RAISE EXCEPTION 'Ya eres el líder';
  END IF;

  SELECT clan_id INTO v_clan_id
  FROM public.clan_members
  WHERE user_id = v_caller AND role = 'LEADER';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo el líder puede traspasar el liderazgo';
  END IF;

  PERFORM 1 FROM public.clans WHERE id = v_clan_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = v_clan_id AND user_id = p_new_leader_id
  ) THEN
    RAISE EXCEPTION 'El nuevo líder debe ser miembro del clan';
  END IF;

  -- Degradar antes de promover: respeta el índice único parcial de LEADER.
  UPDATE public.clan_members
  SET role = 'OFFICER', role_changed_at = NOW()
  WHERE clan_id = v_clan_id AND user_id = v_caller;

  UPDATE public.clan_members
  SET role = 'LEADER', role_changed_at = NOW()
  WHERE clan_id = v_clan_id AND user_id = p_new_leader_id;

  UPDATE public.clans SET leader_id = p_new_leader_id WHERE id = v_clan_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- set_clan_member_role: el líder asciende (OFFICER) o degrada (MEMBER).
-- Para pasar el liderazgo se usa transfer_clan_leadership.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_clan_member_role(
  p_user_id UUID,
  p_role    public.clan_role
)
RETURNS public.clan_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_clan_id UUID;
  v_member  public.clan_members;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF p_role NOT IN ('OFFICER', 'MEMBER') THEN
    RAISE EXCEPTION 'Solo puedes asignar OFFICER o MEMBER';
  END IF;
  IF p_user_id = v_caller THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol';
  END IF;

  SELECT clan_id INTO v_clan_id
  FROM public.clan_members
  WHERE user_id = v_caller AND role = 'LEADER';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo el líder puede cambiar roles';
  END IF;

  UPDATE public.clan_members
  SET role = p_role, role_changed_at = NOW()
  WHERE clan_id = v_clan_id AND user_id = p_user_id
  RETURNING * INTO v_member;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese usuario no está en tu clan';
  END IF;

  RETURN v_member;
END;
$$;

-- ----------------------------------------------------------------------------
-- disband_clan: el líder disuelve el clan (cascada borra todo lo dependiente).
-- La migración de guerras de clanes reemplaza esta función para añadir el
-- bloqueo cuando hay una guerra PENDING/ACTIVE.
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

  DELETE FROM public.clan_members WHERE clan_id = v_clan_id;
  DELETE FROM public.clans WHERE id = v_clan_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- update_clan_profile: el líder edita descripción y/o etiqueta.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_clan_profile(
  p_description TEXT DEFAULT NULL,
  p_tag         TEXT DEFAULT NULL
)
RETURNS public.clans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller  UUID := (SELECT auth.uid());
  v_clan_id UUID;
  v_clan    public.clans;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;

  SELECT clan_id INTO v_clan_id
  FROM public.clan_members
  WHERE user_id = v_caller AND role = 'LEADER';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solo el líder puede editar el clan';
  END IF;

  IF p_tag IS NOT NULL THEN
    IF char_length(trim(p_tag)) NOT BETWEEN 2 AND 5 THEN
      RAISE EXCEPTION 'La etiqueta del clan debe tener entre 2 y 5 caracteres';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.clans
      WHERE lower(tag) = lower(trim(p_tag)) AND id <> v_clan_id
    ) THEN
      RAISE EXCEPTION 'Ya existe un clan con esa etiqueta';
    END IF;
  END IF;

  UPDATE public.clans
  SET description = CASE WHEN p_description IS NULL THEN description
                        ELSE NULLIF(trim(p_description), '') END,
      tag         = CASE WHEN p_tag IS NULL THEN tag
                        ELSE upper(trim(p_tag)) END
  WHERE id = v_clan_id
  RETURNING * INTO v_clan;

  RETURN v_clan;
END;
$$;

-- ----------------------------------------------------------------------------
-- PERMISOS DE EJECUCIÓN
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_clan(TEXT, TEXT, TEXT)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_to_join_clan(UUID)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_join_request(UUID)                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_join_request(UUID, BOOLEAN)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_clan_invite(UUID, INT, INT)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_clan_invite(UUID)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.join_clan_with_invite(TEXT)                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.leave_clan()                              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_clan_member(UUID)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_clan_leadership(UUID)             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_clan_member_role(UUID, public.clan_role) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.disband_clan()                            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_clan_profile(TEXT, TEXT)            FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_clan(TEXT, TEXT, TEXT)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_to_join_clan(UUID)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_join_request(UUID)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_join_request(UUID, BOOLEAN)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_clan_invite(UUID, INT, INT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_clan_invite(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_clan_with_invite(TEXT)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_clan()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_clan_member(UUID)                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_clan_leadership(UUID)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_clan_member_role(UUID, public.clan_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disband_clan()                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clan_profile(TEXT, TEXT)            TO authenticated;

-- ============================================================================
-- 12. REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.clans;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.clan_join_requests;
