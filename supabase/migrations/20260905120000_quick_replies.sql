-- ============================================================================
-- Quick Replies (Respostas Rápidas): atalhos de texto para o composer do
-- Inbox — diferente de Scripts (que vive em Configurações e pode carregar
-- imagem/PDF). Aqui é só nome curto ("Preço") + conteúdo, pensado para
-- cadastrar e usar na hora, direto do ícone de coração no chat. Qualquer
-- membro da organização pode criar/editar/apagar (não é admin-only como
-- Scripts), já que é um atalho pessoal de uso diário do time comercial.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE TABLE IF NOT EXISTS whatsapp_hub.quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT whatsapp_hub.current_org_id()
    REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quick_replies_org_idx ON whatsapp_hub.quick_replies (org_id);

ALTER TABLE whatsapp_hub.quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY quick_replies_select ON whatsapp_hub.quick_replies FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());

CREATE POLICY quick_replies_write ON whatsapp_hub.quick_replies FOR ALL TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active())
  WITH CHECK (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_hub.quick_replies TO authenticated;
