-- ============================================================================
-- MIGRACIÓN: AMISTADES — Prooffit
--
-- Relación bidireccional entre dos profiles: solicitud → aceptar/rechazar →
-- amistad activa. Sirve de base para "duelos contra amigos" (ver CLAUDE.md).
--
-- Modelo de seguridad (igual que el resto del esquema):
--   - El cliente (rol `authenticated`) NUNCA escribe esta tabla directamente:
--     REVOKE ALL + GRANT SELECT. Toda mutación pasa por funciones
--     `SECURITY DEFINER` con `SET search_path = ''` y nombres cualificados.
--   - A diferencia de los clanes, `friendships` NO es pública: solo la ven
--     las dos personas implicadas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TIPO
-- ----------------------------------------------------------------------------
CREATE TYPE public.friendship_status AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- ----------------------------------------------------------------------------
-- 2. TABLA
-- Una fila por solicitud/relación. `user_low_id`/`user_high_id` son el mismo
-- par (requester, addressee) reordenado por valor (least/greatest) para que
-- un índice único parcial impida solicitudes duplicadas sin importar quién
-- invita a quién.
-- ----------------------------------------------------------------------------
CREATE TABLE public.friendships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id  UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  addressee_id  UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  user_low_id   UUID GENERATED ALWAYS AS (LEAST(requester_id, addressee_id)) STORED,
  user_high_id  UUID GENERATED ALWAYS AS (GREATEST(requester_id, addressee_id)) STORED,
  status        public.friendship_status NOT NULL DEFAULT 'PENDING',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at  TIMESTAMPTZ,

  CONSTRAINT friendships_not_self CHECK (requester_id <> addressee_id)
);

-- Como mucho una relación viva (PENDING o ACCEPTED) por par, en cualquier
-- dirección — mismo mecanismo que clan_join_requests_one_pending.
CREATE UNIQUE INDEX friendships_one_active_pair
  ON public.friendships (user_low_id, user_high_id)
  WHERE status IN ('PENDING', 'ACCEPTED');

CREATE INDEX friendships_requester_idx ON public.friendships (requester_id);
CREATE INDEX friendships_addressee_idx ON public.friendships (addressee_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Solo las dos personas implicadas ven la fila (a diferencia de clanes, esto
-- no es público).
CREATE POLICY "friendships_select_involved"
  ON public.friendships FOR SELECT
  TO authenticated
  USING (
    requester_id = (SELECT auth.uid())
    OR addressee_id = (SELECT auth.uid())
  );

-- No hay policies de INSERT/UPDATE/DELETE: todo pasa por las RPCs de abajo.

-- ============================================================================
-- 4. GRANTS DE TABLA (el cliente solo lee)
-- ============================================================================
REVOKE ALL ON public.friendships FROM anon, authenticated;
GRANT SELECT ON public.friendships TO authenticated;

-- ============================================================================
-- 5. RPCs
-- Todas: SECURITY DEFINER, search_path = '', nombres cualificados, y bloqueo
-- FOR UPDATE de la fila afectada.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- send_friend_request: el llamante invita a otro usuario.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_friend_request(p_addressee_id UUID)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_row    public.friendships;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Autenticación requerida';
  END IF;
  IF p_addressee_id = v_caller THEN
    RAISE EXCEPTION 'No puedes enviarte una solicitud a ti mismo';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_addressee_id) THEN
    RAISE EXCEPTION 'Ese usuario no existe';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships
    WHERE user_low_id = LEAST(v_caller, p_addressee_id)
      AND user_high_id = GREATEST(v_caller, p_addressee_id)
      AND status IN ('PENDING', 'ACCEPTED')
  ) THEN
    RAISE EXCEPTION 'Ya existe una solicitud o amistad con ese usuario';
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id)
  VALUES (v_caller, p_addressee_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- respond_to_friend_request: solo el destinatario, solo mientras PENDING.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(
  p_friendship_id UUID,
  p_accept        BOOLEAN
)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_row    public.friendships;
BEGIN
  SELECT * INTO v_row FROM public.friendships WHERE id = p_friendship_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  IF v_row.addressee_id <> v_caller THEN
    RAISE EXCEPTION 'Solo el destinatario puede responder a esta solicitud';
  END IF;
  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente';
  END IF;

  IF p_accept THEN
    UPDATE public.friendships
    SET status = 'ACCEPTED', responded_at = NOW()
    WHERE id = p_friendship_id
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.friendships
    SET status = 'DECLINED', responded_at = NOW()
    WHERE id = p_friendship_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- cancel_friend_request: el solicitante retira su propia solicitud PENDING.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_friendship_id UUID)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_row    public.friendships;
BEGIN
  SELECT * INTO v_row FROM public.friendships WHERE id = p_friendship_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;
  IF v_row.requester_id <> v_caller THEN
    RAISE EXCEPTION 'Solo puedes cancelar tus propias solicitudes';
  END IF;
  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'La solicitud ya no está pendiente';
  END IF;

  UPDATE public.friendships
  SET status = 'CANCELLED', responded_at = NOW()
  WHERE id = p_friendship_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ----------------------------------------------------------------------------
-- remove_friend: cualquiera de los dos termina una amistad ACCEPTED.
-- Borra la fila (no un estado terminal) para permitir una nueva solicitud
-- en el futuro sin chocar con friendships_one_active_pair.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_friend(p_friendship_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller UUID := (SELECT auth.uid());
  v_row    public.friendships;
BEGIN
  SELECT * INTO v_row FROM public.friendships WHERE id = p_friendship_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Amistad no encontrada';
  END IF;
  IF v_caller NOT IN (v_row.requester_id, v_row.addressee_id) THEN
    RAISE EXCEPTION 'No formas parte de esta amistad';
  END IF;
  IF v_row.status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'Esta relación no es una amistad activa';
  END IF;

  DELETE FROM public.friendships WHERE id = p_friendship_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- PERMISOS DE EJECUCIÓN
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.send_friend_request(UUID)             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.respond_to_friend_request(UUID, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_friend_request(UUID)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.remove_friend(UUID)                   FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_friend_request(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(UUID)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friend(UUID)                   TO authenticated;

-- ============================================================================
-- 6. REALTIME
-- ============================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
