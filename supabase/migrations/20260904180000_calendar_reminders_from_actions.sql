-- ============================================================================
-- Calendário ⇄ Próxima ação: liga o post-it gerado automaticamente ao
-- agendamento de origem (crm_activities), pra poder localizá-lo/removê-lo
-- junto se a ação for cancelada.
-- ----------------------------------------------------------------------------
-- Contexto: ao agendar uma "próxima ação" (funil / inbox / ficha do contato)
-- com data e hora, o app agora também cria um lembrete no Calendário na
-- mesma data — pra não depender de o vendedor duplicar a anotação manualmente.
-- ============================================================================

SET search_path TO whatsapp_hub;

ALTER TABLE whatsapp_hub.calendar_reminders
  ADD COLUMN IF NOT EXISTS source_activity_id uuid
    REFERENCES whatsapp_hub.crm_activities(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS calendar_reminders_source_activity_idx
  ON whatsapp_hub.calendar_reminders (source_activity_id);
