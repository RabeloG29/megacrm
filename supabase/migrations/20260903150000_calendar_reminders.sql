-- ============================================================================
-- Calendário: lembretes tipo "post-it" presos numa data.
-- ----------------------------------------------------------------------------
-- Aba "Calendário" no menu principal — visão de mês, clique numa data abre um
-- formulário pra colar um lembrete ali. Quadro compartilhado da organização
-- (qualquer admin/operador vê e edita os lembretes de todo o time, igual
-- contatos/conversas) — não é uma agenda pessoal por usuário.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

CREATE TABLE IF NOT EXISTS whatsapp_hub.calendar_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT whatsapp_hub.current_org_id()
    REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  reminder_date date NOT NULL,
  content text NOT NULL,
  color text NOT NULL DEFAULT 'yellow',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_reminders_org_date_idx
  ON whatsapp_hub.calendar_reminders (org_id, reminder_date);

ALTER TABLE whatsapp_hub.calendar_reminders ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de contatos/conversas: leitura e escrita liberadas a qualquer
-- membro da org (admin ou operador) — quadro de time, não config admin-only.
CREATE POLICY calendar_reminders_select ON whatsapp_hub.calendar_reminders
  FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());

CREATE POLICY calendar_reminders_write ON whatsapp_hub.calendar_reminders
  FOR ALL TO authenticated
  USING (
    org_id = whatsapp_hub.current_org_id()
    AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() IN ('admin', 'operator')
  )
  WITH CHECK (
    org_id = whatsapp_hub.current_org_id()
    AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() IN ('admin', 'operator')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_hub.calendar_reminders TO authenticated;
