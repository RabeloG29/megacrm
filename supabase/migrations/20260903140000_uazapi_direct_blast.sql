-- ============================================================================
-- 20260903140000_uazapi_direct_blast
-- ----------------------------------------------------------------------------
-- Disparo direto em massa pela UAZAPI (texto livre, sem template aprovado,
-- sem janela de 24h) — módulo separado do broadcast Zernio/Meta existente,
-- reaproveitando as MESMAS tabelas campaigns/campaign_contacts.
--
-- Diferenças do caminho 'broadcast' (Zernio, já existente):
--   · campaigns.kind = 'uazapi_direct' marca o novo caminho.
--   · template_id fica NULL (texto livre em campaigns.message_body, com
--     variáveis nomeadas {{nome}}, {{primeiro_nome}}, {{qualquer_campo}} —
--     resolvidas pelo dispatcher direto do contato, sem variable_mapping).
--   · campaigns.pace_seconds define o intervalo MÍNIMO entre um envio e o
--     próximo (lento=45s / moderado=30s / rápido=10s) — é o próprio motivo
--     de existir esse caminho separado (o broadcast do Zernio não tem essa
--     pausa manual; a UAZAPI precisa dela pra reduzir risco de bloqueio).
--   · campaign_contacts.scheduled_at é calculado na criação da campanha
--     (índice da linha × pace_seconds + jitter) e o novo dispatcher só
--     envia 1 contato por tick, quando scheduled_at <= now() — isso é o
--     que garante o espaçamento real entre mensagens.
-- ============================================================================

SET search_path TO whatsapp_hub, public;

-- 1. campaigns: caminho 'uazapi_direct' não usa template aprovado.
ALTER TABLE whatsapp_hub.campaigns
  ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE whatsapp_hub.campaigns
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'broadcast',
  ADD COLUMN IF NOT EXISTS message_body TEXT,
  ADD COLUMN IF NOT EXISTS pace_seconds INT;

ALTER TABLE whatsapp_hub.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_kind_check;
ALTER TABLE whatsapp_hub.campaigns
  ADD CONSTRAINT campaigns_kind_check CHECK (kind IN ('broadcast', 'uazapi_direct'));

ALTER TABLE whatsapp_hub.campaigns
  DROP CONSTRAINT IF EXISTS campaigns_uazapi_direct_shape;
ALTER TABLE whatsapp_hub.campaigns
  ADD CONSTRAINT campaigns_uazapi_direct_shape CHECK (
    (kind = 'broadcast' AND template_id IS NOT NULL)
    OR
    (kind = 'uazapi_direct' AND template_id IS NULL AND message_body IS NOT NULL AND pace_seconds IS NOT NULL)
  );

-- 2. campaign_contacts: agendamento por linha (só usado em kind='uazapi_direct')
--    + id da mensagem na UAZAPI (mesma função de zernio_message_id, provider
--    diferente — evita reaproveitar a coluna do outro provedor).
ALTER TABLE whatsapp_hub.campaign_contacts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_campaign_contacts_uazapi_due
  ON whatsapp_hub.campaign_contacts (campaign_id, scheduled_at)
  WHERE status = 'pending' AND scheduled_at IS NOT NULL;

-- 3. Reserva atômica do PRÓXIMO contato "due" de uma campanha uazapi_direct.
--    Mesmo padrão de whatsapp_hub.claim_campaign_contacts (FOR UPDATE SKIP
--    LOCKED + claimed_at com auto-recuperação em 2min), mas: 1 linha só, e
--    respeitando scheduled_at <= now() — é isso que espaça os envios.
CREATE OR REPLACE FUNCTION whatsapp_hub.claim_next_uazapi_contact(
  p_campaign_id uuid
) RETURNS SETOF whatsapp_hub.campaign_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = whatsapp_hub
AS $$
BEGIN
  RETURN QUERY
  UPDATE whatsapp_hub.campaign_contacts cc
     SET claimed_at = now()
   WHERE cc.id = (
     SELECT id
       FROM whatsapp_hub.campaign_contacts
      WHERE campaign_id = p_campaign_id
        AND status = 'pending'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= now()
        AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
      ORDER BY scheduled_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING cc.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION whatsapp_hub.claim_next_uazapi_contact(uuid) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION whatsapp_hub.claim_next_uazapi_contact(uuid) TO service_role;

-- 4. Cron: novo tick de 10s dedicado ao disparo direto UAZAPI. Reaproveita o
--    helper whatsapp_hub._cron_invoke_edge (Vault: whatsapp_hub_supabase_url
--    / whatsapp_hub_service_role_key), já usado por wh-dispatch-campaigns.
DO $$
BEGIN
  PERFORM cron.unschedule('wh-dispatch-uazapi');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

SELECT cron.schedule(
  'wh-dispatch-uazapi',
  '10 seconds',
  $cron$SELECT whatsapp_hub._cron_invoke_edge('dispatch-uazapi-campaign')$cron$
);
