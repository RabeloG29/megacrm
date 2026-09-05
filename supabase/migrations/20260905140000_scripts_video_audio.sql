-- ============================================================================
-- Scripts: anexo de vídeo e áudio (além de imagem/PDF já existentes).
-- ----------------------------------------------------------------------------
-- Mesmo padrão de 20260903130000_scripts_attachments.sql: URL pública do
-- bucket whatsapp-hub-script-attachments + path (pra permitir excluir do
-- Storage depois). Reenviados junto com o texto quando o script é usado no
-- Inbox — o pipeline de envio (send-operator-media) já reconhece áudio/vídeo
-- pelo mime type, não precisa de nenhuma mudança na Edge Function.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.scripts
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS video_path text,
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS audio_path text;

-- O bucket já existia (imagem/PDF, ver 20260903130000_scripts_attachments.sql)
-- só com esses mime types liberados — precisa incluir vídeo/áudio, senão o
-- upload é recusado pelo Storage antes mesmo de chegar no código.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
  'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav', 'audio/aac', 'audio/amr', 'audio/x-m4a'
]
WHERE id = 'whatsapp-hub-script-attachments';
