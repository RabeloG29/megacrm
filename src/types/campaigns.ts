import type { TemplateButton } from './templates';

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'completed' | 'paused' | 'failed';
export type CampaignContactStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'replied' | 'failed';
export type FollowUpTrigger = 'no_reply' | 'inactivity' | 'no_purchase';

// 'broadcast' (default) = template aprovado via Zernio/Meta (fluxo existente).
// 'uazapi_direct' = texto livre em massa pela UAZAPI, com pace_seconds entre
// envios (ver migration 20260903140000_uazapi_direct_blast).
export type CampaignKind = 'broadcast' | 'uazapi_direct';

// Velocidade de disparo do caminho uazapi_direct — intervalo mínimo (segundos)
// entre uma mensagem e a próxima. 'lento' é sempre o default recomendado.
export type UazapiSendSpeed = 'lento' | 'moderado' | 'rapido';
export const UAZAPI_SEND_SPEED_SECONDS: Record<UazapiSendSpeed, number> = {
  lento: 45,
  moderado: 30,
  rapido: 10,
};

// Mirrors the JSONB shape the dispatcher consumes. `fallback` é usado quando o
// contato não tem o campo preenchido (ex.: sem nome → "Cliente"); sem fallback,
// a linha falha em vez de enviar a variável vazia.
export type VariableSource =
  | { source: 'literal'; value: string }
  | { source: 'contact_field'; field: 'name' | 'email' | 'phone'; fallback?: string }
  | { source: 'custom_field'; field: string }
  // Dados do negócio (deal) mais recente do contato. Campanhas com deal_field
  // são disparadas 1:1 (template direto por destinatário) em vez de broadcast —
  // o variableMapping do broadcast do Zernio só resolve nome/valor fixo.
  | {
      source: 'deal_field';
      field: 'title' | 'products' | 'value' | 'last_purchase_at';
      fallback?: string;
    };

export interface AudienceFilter {
  all?: boolean;
  tag_ids?: string[];
  custom_fields?: Record<string, string>;
  // Segmentação por funil/etapa (camada CRM): inclui contatos que têm ao menos
  // um deal no funil `pipeline_id`. Se `stage_ids` for informado, restringe às
  // etapas escolhidas; sem `stage_ids`, considera o funil inteiro. Combinado com
  // tags/custom, os filtros são interseccionados (AND).
  pipeline_id?: string;
  stage_ids?: string[];
}

// Proveniência da audiência de uma campanha uazapi_direct — persistida na
// mesma coluna JSONB `audience_filter` (sem CHECK de shape no banco). 'crm'
// reaproveita o AudienceFilter normal (tags/funil); 'csv' marca que os
// contact_ids já foram resolvidos no momento da criação (upsert do CSV) — não
// há filtro para reexecutar, só o registro de quantos vieram do arquivo.
export type UazapiAudienceSource =
  | { mode: 'crm'; filter: AudienceFilter }
  | { mode: 'csv'; total: number; file_name?: string };

export interface Campaign {
  id: string;
  name: string;
  // NULL no caminho uazapi_direct (texto livre em message_body, sem template).
  template_id: string | null;
  status: CampaignStatus;
  scheduled_at: string | null;
  kind: CampaignKind;
  channel_id: string | null;
  // Texto livre com variáveis nomeadas ({{nome}}, {{primeiro_nome}},
  // {{telefone}}, {{campo_customizado}}) — só em kind='uazapi_direct'.
  message_body: string | null;
  // Intervalo mínimo (segundos) entre envios — só em kind='uazapi_direct'.
  pace_seconds: number | null;
  audience_filter: AudienceFilter | UazapiAudienceSource;
  variable_mapping: Record<string, VariableSource>;
  total_contacts: number;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FollowUpRule {
  id: string;
  campaign_id: string | null;
  trigger_condition: FollowUpTrigger;
  delay_hours: number;
  // Nullable: regras UAZAPI usam message_text em vez de template.
  template_id: string | null;
  sequence_order: number;
  is_active: boolean;
  // Canal do disparo: 'zernio' (API oficial, template aprovado) | 'uazapi'
  // (não oficial, texto livre — risco de banimento maior).
  provider: 'zernio' | 'uazapi';
  message_text: string | null;
  // Parâmetros por gatilho/filtros: { days?, temperature?, lead_type?, tag_id?, template_params? }
  params: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type { TemplateButton };
