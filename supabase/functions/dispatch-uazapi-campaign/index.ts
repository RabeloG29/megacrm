// ============================================================================
// dispatch-uazapi-campaign (cron target, 10s)
// ----------------------------------------------------------------------------
// Disparo direto em massa pela UAZAPI (texto livre, sem template aprovado,
// sem janela de 24h). Contraparte do dispatch-campaign (Zernio Broadcasts)
// para campaigns.kind = 'uazapi_direct'.
//
// Diferença central de arquitetura: aqui o ESPAÇAMENTO entre mensagens é o
// próprio propósito do módulo (reduzir risco de bloqueio do número), então
// cada tick processa NO MÁXIMO 1 contato POR CAMPANHA — nunca em lote. O
// espaçamento real vem de campaign_contacts.scheduled_at, calculado na
// criação da campanha (índice da linha × pace_seconds + jitter);
// claim_next_uazapi_contact só libera a linha quando scheduled_at <= now().
//
// Variáveis do texto livre (campaigns.message_body) são NOMEADAS, não
// numeradas como no broadcast: {{nome}}, {{primeiro_nome}}, {{telefone}} são
// built-ins resolvidos direto do contato; qualquer outro token
// ({{cidade}}, {{o_que_for}}) é lido de contacts.custom_fields (chave exata)
// — é assim que a audiência via CSV expõe colunas extras mapeadas na
// importação. Sem valor: {{nome}}/{{primeiro_nome}} caem no fallback
// "Cliente"; os demais tokens falham a linha (erro claro) em vez de mandar
// mensagem com buraco.
// ============================================================================

import { getAdminClient } from '../_shared/supabase-admin.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { requireServiceRole } from '../_shared/auth.ts';
import { getChannelById } from '../_shared/channels.ts';
import {
  UazapiError,
  uazapiContextFromChannel,
  uazapiSendText,
  type UazapiContext,
} from '../_shared/uazapi.ts';

// Teto de campanhas 'sending' processadas por tick — cada uma manda, no
// máximo, 1 mensagem (o espaçamento é por linha, via scheduled_at).
const MAX_CAMPAIGNS_PER_TICK = 25;

interface CampaignRow {
  id: string;
  org_id: string;
  channel_id: string | null;
  message_body: string;
}

interface ContactRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  custom_fields: Record<string, unknown> | null;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Resolve {{token}} do corpo livre a partir do contato. Built-ins alinhados
// com scriptVariables.ts (Configurações → Scripts): nome/primeiro_nome/
// telefone/email têm o MESMO comportamento nos dois lugares, pra um texto
// escrito como script funcionar sem ajuste nenhum aqui. `missing` lista só
// tokens de custom_fields sem valor — o chamador falha a linha nesse caso;
// email vazio não falha (mesma tolerância do script).
function renderMessage(body: string, contact: ContactRow): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_whole, token: string) => {
    if (token === 'nome') return contact.name?.trim() || 'Cliente';
    if (token === 'primeiro_nome') return contact.name?.trim() ? firstName(contact.name) : 'Cliente';
    if (token === 'telefone') return contact.phone;
    if (token === 'email') return contact.email?.trim() || '';
    const raw = contact.custom_fields?.[token];
    const value = raw == null ? '' : String(raw).trim();
    if (!value) {
      missing.push(token);
      return `{{${token}}}`;
    }
    return value;
  });
  return { text, missing };
}

async function bump(
  admin: ReturnType<typeof getAdminClient>,
  campaignId: string,
  column: 'sent' | 'failed',
  delta = 1,
): Promise<void> {
  await admin.rpc('bump_campaign_counter', { p_campaign_id: campaignId, p_column: column, p_delta: delta });
}

// Espelha o envio na inbox: garante uma conversa 1:1 (canal/provider da
// campanha) e registra a mensagem outbound vinculada à linha da campanha.
async function mirrorToInbox(
  admin: ReturnType<typeof getAdminClient>,
  input: {
    orgId: string;
    channelId: string | null;
    contactId: string;
    campaignContactId: string;
    text: string;
    externalId: string | null;
    sentAt: string;
  },
): Promise<void> {
  const { data: existing } = await admin
    .from('conversations')
    .select('id')
    .eq('org_id', input.orgId)
    .eq('contact_id', input.contactId)
    .maybeSingle();
  let conversationId = (existing as { id: string } | null)?.id ?? null;

  if (!conversationId) {
    const { data: created } = await admin
      .from('conversations')
      .insert({
        org_id: input.orgId,
        contact_id: input.contactId,
        status: 'ai_active',
        channel: 'whatsapp',
        provider: 'uazapi',
        channel_id: input.channelId,
        last_message_at: input.sentAt,
      })
      .select('id')
      .single();
    conversationId = (created as { id: string } | null)?.id ?? null;
  }
  if (!conversationId) return;

  await admin.from('messages').insert({
    org_id: input.orgId,
    conversation_id: conversationId,
    direction: 'outbound',
    sender_type: 'system',
    content_type: 'text',
    content: input.text,
    zernio_message_id: input.externalId,
    meta_status: 'sent',
    campaign_contact_id: input.campaignContactId,
    is_private_note: false,
  });
  await admin.from('conversations').update({ last_message_at: input.sentAt }).eq('id', conversationId);
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    await requireServiceRole(req);
  } catch {
    return jsonResponse({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const admin = getAdminClient();

  // 1. Promove scheduled → sending para campanhas cujo horário chegou.
  const nowIso = new Date().toISOString();
  await admin
    .from('campaigns')
    .update({ status: 'sending', started_at: nowIso })
    .eq('kind', 'uazapi_direct')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso);

  // 2. Campanhas uazapi_direct em envio.
  const { data: campaigns, error: campErr } = await admin
    .from('campaigns')
    .select('id, org_id, channel_id, message_body')
    .eq('kind', 'uazapi_direct')
    .eq('status', 'sending')
    .limit(MAX_CAMPAIGNS_PER_TICK);
  if (campErr) return jsonResponse({ ok: false, error: campErr.message }, { status: 500 });

  const rows = (campaigns ?? []) as CampaignRow[];
  if (rows.length === 0) return jsonResponse({ ok: true, processed: 0 });

  // Só orgs ativas.
  const orgIds = [...new Set(rows.map((r) => r.org_id))];
  const { data: activeOrgRows } = await admin
    .from('organizations')
    .select('id')
    .eq('status', 'active')
    .in('id', orgIds);
  const activeOrgs = new Set(((activeOrgRows ?? []) as Array<{ id: string }>).map((o) => o.id));

  const ctxCache = new Map<string, UazapiContext | null>();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const c of rows) {
    if (!activeOrgs.has(c.org_id)) continue;

    if (!c.channel_id) {
      errors.push(`campaign ${c.id}: sem canal UAZAPI definido`);
      continue;
    }

    let ctx = ctxCache.get(c.channel_id) ?? null;
    if (ctx === null && !ctxCache.has(c.channel_id)) {
      try {
        const channel = await getChannelById(admin, c.channel_id);
        if (!channel || channel.provider !== 'uazapi') {
          throw new Error('canal não é UAZAPI ou não existe mais');
        }
        ctx = await uazapiContextFromChannel(channel);
      } catch (err) {
        errors.push(`campaign ${c.id}: ${err instanceof Error ? err.message : 'contexto UAZAPI'}`);
        ctxCache.set(c.channel_id, null);
        continue;
      }
      ctxCache.set(c.channel_id, ctx);
    }
    if (!ctx) continue;

    // Reserva o próximo contato "due" — no máximo 1 por campanha por tick,
    // é isso que garante o espaçamento configurado (lento/moderado/rápido).
    const { data: claimed, error: claimErr } = await admin.rpc('claim_next_uazapi_contact', {
      p_campaign_id: c.id,
    });
    if (claimErr) {
      errors.push(`campaign ${c.id}: ${claimErr.message}`);
      continue;
    }
    const row = ((claimed ?? []) as Array<{ id: string; contact_id: string }>)[0];
    if (!row) {
      // Nada due agora nesta campanha: conclui se não sobrou pending nenhum.
      const { count: pendingLeft } = await admin
        .from('campaign_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', c.id)
        .eq('status', 'pending');
      if ((pendingLeft ?? 0) === 0) {
        await admin
          .from('campaigns')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', c.id);
      }
      continue;
    }

    const { data: contactData } = await admin
      .from('contacts')
      .select('id, phone, name, email, custom_fields')
      .eq('id', row.contact_id)
      .maybeSingle();
    const contact = contactData as ContactRow | null;

    if (!contact?.phone) {
      await admin
        .from('campaign_contacts')
        .update({ status: 'failed', claimed_at: null, error_message: 'Contato sem telefone' })
        .eq('id', row.id);
      await bump(admin, c.id, 'failed');
      failed += 1;
      continue;
    }

    const { text, missing } = renderMessage(c.message_body, contact);
    if (missing.length > 0) {
      const msg = `Variáveis sem valor: ${missing.map((m) => `{{${m}}}`).join(', ')}`;
      await admin
        .from('campaign_contacts')
        .update({ status: 'failed', claimed_at: null, error_message: msg })
        .eq('id', row.id);
      await bump(admin, c.id, 'failed');
      failed += 1;
      continue;
    }

    try {
      const result = await uazapiSendText(ctx, { phone: contact.phone, text });
      const sentAt = new Date().toISOString();
      await admin
        .from('campaign_contacts')
        .update({
          status: 'sent',
          sent_at: sentAt,
          provider_message_id: result.messageId,
          error_message: null,
          claimed_at: null,
        })
        .eq('id', row.id);
      await bump(admin, c.id, 'sent');
      sent += 1;

      try {
        await mirrorToInbox(admin, {
          orgId: c.org_id,
          channelId: c.channel_id,
          contactId: contact.id,
          campaignContactId: row.id,
          text,
          externalId: result.messageId,
          sentAt,
        });
      } catch (mirrorErr) {
        errors.push(`campaign ${c.id}: inbox mirror: ${mirrorErr instanceof Error ? mirrorErr.message : 'erro'}`);
      }
    } catch (err) {
      const retryable = err instanceof UazapiError && (err.status === 429 || err.status >= 500);
      const msg = err instanceof Error ? err.message : 'Erro no envio UAZAPI';
      if (retryable) {
        // Erro transitório: volta pra pending e empurra scheduled_at 60s pra
        // frente, pra não martelar a UAZAPI a cada tick de 10s.
        await admin
          .from('campaign_contacts')
          .update({
            status: 'pending',
            claimed_at: null,
            scheduled_at: new Date(Date.now() + 60_000).toISOString(),
            error_message: `Tentando novamente: ${msg}`,
          })
          .eq('id', row.id);
      } else {
        await admin
          .from('campaign_contacts')
          .update({ status: 'failed', claimed_at: null, error_message: msg })
          .eq('id', row.id);
        await bump(admin, c.id, 'failed');
        failed += 1;
      }
    }
  }

  return jsonResponse({ ok: true, campaigns: rows.length, sent, failed, errors });
});
