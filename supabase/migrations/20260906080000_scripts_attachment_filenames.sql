-- ============================================================================
-- 20260906080000_scripts_attachment_filenames
-- ----------------------------------------------------------------------------
-- Bug: o upload de anexos de script (ScriptsSettings.tsx) salva o arquivo no
-- Storage com um nome aleatório (`${org}/${uuid}.${ext}`) para evitar colisão
-- de paths, e o nome original do arquivo nunca era persistido em lugar
-- nenhum. Quando o script é reenviado no Inbox (MessageInput.tsx), o nome do
-- arquivo era "recuperado" a partir do próprio path da URL no Storage — ou
-- seja, o uuid aleatório — em vez do nome real do material. Isso é invisível
-- para imagem/video/audio (o WhatsApp mostra o player, não o nome do
-- arquivo), mas aparece feio em PDF, que é entregue como cartão de documento
-- com nome de arquivo visível.
--
-- Correção: guardar o nome original de cada anexo numa coluna própria, para
-- ser usado no reenvio em vez do path do Storage. Não mexe no bucket, nas
-- policies nem no fluxo de anexo manual do Inbox (send-operator-media), que
-- já funciona porque usa o File do próprio operador (nome original intacto).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.scripts
  ADD COLUMN IF NOT EXISTS image_filename text,
  ADD COLUMN IF NOT EXISTS pdf_filename text,
  ADD COLUMN IF NOT EXISTS video_filename text,
  ADD COLUMN IF NOT EXISTS audio_filename text;