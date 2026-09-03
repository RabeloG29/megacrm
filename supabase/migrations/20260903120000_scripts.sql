-- ============================================================================
-- Scripts: mensagens prontas (canned messages) reutilizáveis.
-- ----------------------------------------------------------------------------
-- Cadastradas em Configurações → Scripts (admin). Qualquer membro da
-- organização pode ler e inserir o texto no chat do Inbox; o texto também
-- pode ser carregado como conteúdo de uma automação (Follow-ups UAZAPI /
-- Funil "Disparar mensagem de texto"). RLS espelha o padrão multi-tenant
-- genérico (v_admin_write) aplicado às demais tabelas em
-- 20260810120002_mt_policies.sql: select liberado a qualquer membro da org,
-- escrita restrita a admin.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE TABLE IF NOT EXISTS whatsapp_hub.scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT whatsapp_hub.current_org_id()
    REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scripts_org_idx ON whatsapp_hub.scripts (org_id);

ALTER TABLE whatsapp_hub.scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY scripts_select ON whatsapp_hub.scripts FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());

CREATE POLICY scripts_write ON whatsapp_hub.scripts FOR ALL TO authenticated
  USING (
    org_id = whatsapp_hub.current_org_id()
    AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() = 'admin'
  )
  WITH CHECK (
    org_id = whatsapp_hub.current_org_id()
    AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() = 'admin'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_hub.scripts TO authenticated;
