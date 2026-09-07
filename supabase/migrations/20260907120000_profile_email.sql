-- ============================================================================
-- EMAIL EN PROFILES
-- Añade profiles.email como copia sincronizada de auth.users.email.
--
-- Privacidad: a diferencia de username (público para cualquier autenticado),
-- el email es PII y solo lo puede leer su dueño. La policy
-- "profiles_select_authenticated" ya deja leer cualquier fila de profiles
-- (para buscar amigos/rivales), así que un GRANT de columna normal
-- (REVOKE + GRANT SELECT (email) TO authenticated) expondría el email de
-- TODOS los usuarios a TODOS los usuarios -- el grant de columna no puede
-- filtrar por fila, solo la policy de fila puede, y esa policy ya es "true".
-- Por eso el email nunca se añade al GRANT de la tabla base: se expone solo
-- a través de la vista `public.my_profile`, que fija su propio filtro por
-- fila (`id = auth.uid()`) independiente de la policy de la tabla.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COLUMNA + BACKFILL
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN email TEXT;

UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id;

ALTER TABLE public.profiles
  ALTER COLUMN email SET NOT NULL,
  ADD CONSTRAINT profiles_email_unique UNIQUE (email);

-- ----------------------------------------------------------------------------
-- 2. ALTA: handle_new_user() copia también el email
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username TEXT;
BEGIN
  v_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'username'), ''),
    'Heroe_' || substring(NEW.id::text FROM 1 FOR 8)
  );

  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    v_username := v_username || '_' || substring(NEW.id::text FROM 1 FOR 4);
  END IF;

  INSERT INTO public.profiles (id, username, email)
  VALUES (NEW.id, v_username, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. CAMBIO DE EMAIL: nuevo trigger que mantiene profiles.email al día
-- Mismo endurecimiento que handle_new_user(): SECURITY DEFINER, search_path
-- fijo, nombres cualificados, EXECUTE revocado (solo lo dispara el trigger).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_user_email_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.profiles
  SET email = NEW.email
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_user_email_update() FROM public, anon, authenticated;

CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.handle_user_email_update();

-- ----------------------------------------------------------------------------
-- 4. LECTURA PROPIA: vista con su propio filtro de fila
-- No se toca el GRANT de la tabla base (`profiles`): sigue sin exponer email.
-- ----------------------------------------------------------------------------
CREATE VIEW public.my_profile
WITH (security_invoker = on)
AS
SELECT *
FROM public.profiles
WHERE id = (SELECT auth.uid());

GRANT SELECT ON public.my_profile TO authenticated;
