-- ============================================================================
-- 20260903130000_scripts_attachments
-- ----------------------------------------------------------------------------
-- Permite anexar imagem e/ou PDF a um script (whatsapp_hub.scripts), para
-- reenvio no Inbox junto com o texto do script. Bucket público (a URL é usada
-- para reenviar o arquivo ao contato via send-operator-media); upload restrito
-- a admin e à própria org, mesmo padrão de scripts_write.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.scripts
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS pdf_path text;

-- Bucket público, limite 25MB (mesmo teto de mídia do Zernio).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-hub-script-attachments', 'whatsapp-hub-script-attachments', true, 25 * 1024 * 1024,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS wh_script_attachments_read ON storage.objects;
DROP POLICY IF EXISTS wh_script_attachments_admin_insert ON storage.objects;
DROP POLICY IF EXISTS wh_script_attachments_admin_update ON storage.objects;
DROP POLICY IF EXISTS wh_script_attachments_admin_delete ON storage.objects;

-- Leitura pública (bucket público; a URL é reenviada ao contato via Zernio).
CREATE POLICY wh_script_attachments_read
ON storage.objects
FOR SELECT TO anon, authenticated
USING (bucket_id = 'whatsapp-hub-script-attachments');

-- Upload/edição/remoção apenas por admin, restrito à própria org (path
-- precisa começar com `<org_id>/`).
CREATE POLICY wh_script_attachments_admin_insert
ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-hub-script-attachments'
  AND whatsapp_hub.current_org_active()
  AND (storage.foldername(name))[1] = whatsapp_hub.current_org_id()::text
  AND whatsapp_hub.current_user_role() = 'admin'
);

CREATE POLICY wh_script_attachments_admin_update
ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'whatsapp-hub-script-attachments'
  AND (storage.foldername(name))[1] = whatsapp_hub.current_org_id()::text
  AND whatsapp_hub.current_user_role() = 'admin'
)
WITH CHECK (
  bucket_id = 'whatsapp-hub-script-attachments'
  AND (storage.foldername(name))[1] = whatsapp_hub.current_org_id()::text
  AND whatsapp_hub.current_user_role() = 'admin'
);

CREATE POLICY wh_script_attachments_admin_delete
ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'whatsapp-hub-script-attachments'
  AND (storage.foldername(name))[1] = whatsapp_hub.current_org_id()::text
  AND whatsapp_hub.current_user_role() = 'admin'
);
