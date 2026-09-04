-- ============================================================================
-- Motivos de perda (catálogo)
-- ----------------------------------------------------------------------------
-- Configurações → Motivos de perda: lista cadastrável de motivos, selecionável
-- no DealDrawer ao marcar um negócio como perdido. Continua salvando em
-- deals.lost_reason (texto, já existente) — não introduz FK em deals para não
-- quebrar registros antigos nem o agrupamento já existente no dashboard
-- (useSalesDashboard agrupa por deals.lost_reason).
-- ============================================================================

SET search_path TO whatsapp_hub;

CREATE TABLE IF NOT EXISTS whatsapp_hub.loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

ALTER TABLE whatsapp_hub.loss_reasons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY loss_reasons_select ON whatsapp_hub.loss_reasons FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY loss_reasons_write ON whatsapp_hub.loss_reasons FOR ALL TO authenticated
    USING (whatsapp_hub.current_user_role() IN ('admin','operator'))
    WITH CHECK (whatsapp_hub.current_user_role() IN ('admin','operator'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_hub.loss_reasons TO authenticated;
