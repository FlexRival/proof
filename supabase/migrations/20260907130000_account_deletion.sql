-- ============================================================================
-- MIGRACIÓN: BORRADO DE CUENTA — ProofIt (KAN-53)
--
-- POR QUÉ EXISTE:
--   App Store Review Guideline 5.1.1(v): toda app que deja CREAR una cuenta
--   tiene que dejar BORRARLA desde dentro de la app. No vale desactivarla ni
--   un «escríbenos un correo». Google Play pide lo mismo, y además una ruta
--   web para pedirlo sin instalar la app. ProofIt tiene registro por
--   email/contraseña, así que aplica de lleno: sin esto, rechazo seguro.
--
-- QUIÉN BORRA QUÉ (y por qué esta función NO borra casi nada):
--   `profiles.id` referencia `auth.users(id) ON DELETE CASCADE`, y todas las
--   demás tablas cuelgan de `profiles` con CASCADE. Así que borrar el usuario
--   de Auth arrastra step_logs, duels, friendships, clan_members,
--   clan_war_participants y subscriptions sin escribir un solo DELETE aquí.
--   Ese borrado lo hace la Edge Function `delete-account` con la service role
--   key, porque `auth.users` no se toca desde SQL de aplicación.
--
--   Esta función se ocupa SOLO de lo que el CASCADE haría mal.
--
-- LO QUE EL CASCADE HARÍA MAL — el liderazgo de clan:
--   `clans.leader_id` también es `ON DELETE CASCADE`. Si el líder borra su
--   cuenta, el cascade se lleva la FILA DEL CLAN, y con ella a todos sus
--   miembros. Un usuario ejerciendo su derecho al borrado disolvería el clan
--   de otras 20 personas sin enterarse. Por eso el traspaso de mando ocurre
--   ANTES, aquí, y cuando la Edge Function borra el usuario ya no queda
--   ningún clan apuntándole.
--
-- DIFERENCIA CON `leave_clan()`:
--   `leave_clan()` LANZA EXCEPCIÓN si el líder no tiene ningún oficial al que
--   ceder el mando («asciende a un oficial o disuelve el clan antes de
--   salir»). Aquí eso sería ilegal: el borrado de cuenta es un derecho, no una
--   negociación. Si no hay oficiales, asciende al miembro más antiguo.
--
-- LO QUE SE DEJA MORIR A PROPÓSITO:
--   * Duelos PENDING y ACTIVE -> desaparecen con el cascade. NO se resuelven a
--     favor del superviviente: regalar la victoria convierte «crea cuenta,
--     reta a tu amigo, bórrala» en una fábrica de XP gratis. Nadie gana nada,
--     que es lo único que no se puede explotar.
--   * Duelos FINISHED -> se borran también. La fila guarda los pasos y el
--     resultado de quien se va: es dato personal suyo, no del rival. El XP que
--     el rival ya ganó vive en `profiles.xp` y no se toca.
--   * `subscription_events.user_id` es ON DELETE SET NULL a propósito (ver
--     §15): el histórico de facturación sobrevive sin apuntar a nadie. Es una
--     de las retenciones que el RGPD permite y que la política de privacidad
--     declara explícitamente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prepare_account_deletion()
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

  -- Sin clan no hay nada que preparar: el cascade se basta.
  IF NOT FOUND THEN
    RETURN;
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

  -- Líder solo en su clan: el clan se va con él. Se borran los miembros antes
  -- que el clan para no disparar el trigger de recuento contra una fila que
  -- está desapareciendo (mismo cuidado que en `leave_clan`).
  IF v_others = 0 THEN
    DELETE FROM public.clan_members WHERE clan_id = v_membership.clan_id;
    DELETE FROM public.clans WHERE id = v_membership.clan_id;
    RETURN;
  END IF;

  -- Oficial más antiguo; si no hay ninguno, miembro más antiguo. El ORDER BY
  -- pone los oficiales primero (`false` < `true` en Postgres, de ahí el DESC)
  -- y dentro de cada grupo, al que lleva más tiempo.
  SELECT user_id INTO v_new_leader
  FROM public.clan_members
  WHERE clan_id = v_membership.clan_id
    AND user_id <> v_caller
  ORDER BY (role = 'OFFICER'::public.clan_role) DESC, role_changed_at ASC, joined_at ASC
  LIMIT 1;

  -- Borrar primero al líder saliente libera el índice único parcial de LEADER.
  DELETE FROM public.clan_members
  WHERE clan_id = v_membership.clan_id AND user_id = v_caller;

  UPDATE public.clan_members
  SET role = 'LEADER', role_changed_at = NOW()
  WHERE clan_id = v_membership.clan_id AND user_id = v_new_leader;

  UPDATE public.clans SET leader_id = v_new_leader WHERE id = v_membership.clan_id;
END;
$$;

-- La llama la Edge Function `delete-account` con la sesión del usuario, no la
-- app directamente: el borrado del usuario de Auth necesita la service role
-- key, y las dos mitades tienen que ocurrir juntas o ninguna.
GRANT EXECUTE ON FUNCTION public.prepare_account_deletion() TO authenticated;

COMMENT ON FUNCTION public.prepare_account_deletion() IS
  'Deja el clan del usuario en un estado sano antes de que el borrado de auth.users '
  'dispare el CASCADE. No borra la cuenta: eso lo hace la Edge Function delete-account.';
