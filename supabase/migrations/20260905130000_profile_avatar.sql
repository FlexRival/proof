-- ============================================================================
-- MIGRACIÓN: FOTO DE PERFIL — Prooffit
--
-- `profiles.avatar_url` guarda la URL pública de la foto subida por el
-- usuario a Storage. No es un dato anti-cheat (no da ninguna ventaja de
-- juego), así que sigue el mismo trato que `username`: el cliente puede
-- escribir su propia fila directamente (RLS + grant de columna), sin pasar
-- por una RPC.
--
-- El archivo en sí vive en el bucket `avatars` (público, así que la URL sirve
-- tal cual sin firmar). Las policies de `storage.objects` solo dejan subir o
-- reemplazar el archivo bajo la carpeta `<user_id>/...` del propio usuario —
-- mismo patrón que recomienda Supabase para storage por-usuario.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. COLUMNA
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT;

-- El cliente ya podía UPDATE (username); esto añade la columna nueva al
-- mismo grant, no lo reemplaza (los GRANT de columna se acumulan).
GRANT UPDATE (avatar_url) ON public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. BUCKET DE STORAGE
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. POLICIES DE storage.objects
-- RLS ya viene activado por defecto en storage.objects (lo instala el propio
-- proyecto de Storage), así que basta con añadir las policies.
-- ----------------------------------------------------------------------------

-- Lectura pública del bucket (además de que el bucket ya es `public`, esto lo
-- deja explícito para quien navegue `storage.objects` desde Studio/SQL).
CREATE POLICY "avatars_select_all"
  ON storage.objects FOR SELECT
  TO authenticated, anon
  USING (bucket_id = 'avatars');

-- Subir/reemplazar/borrar: solo dentro de la propia carpeta `<user_id>/...`.
-- `storage.foldername(name)` parte la ruta por `/`; el primer segmento tiene
-- que ser el uid de quien llama.
CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
