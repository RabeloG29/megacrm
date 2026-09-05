// Módulo Indicadores — 4 métricas pedidas pelo usuário, todas derivadas de
// dados que já existem no schema (sem migration nova):
//   1) mensagens enviadas por período (com quebra por sender_type)
//   2) conversão + tempo médio até a venda, por produto
//   3) efetividade dos follow-ups automáticos (disparados → resposta/venda)
//   4) assinaturas vencendo (contacts.subscription_expires_at)
//
// Segue o mesmo padrão de useSalesDashboard.ts: queries paralelas ao Supabase,
// dedupe/agregação client-side, sem RPCs SQL.

import { useCallback, useEffect, useState } from 'react';
import { type PeriodRange } from '@/lib/dashboard';
import { getSupabase } from '@/lib/supabase';
import type { NameCount, DaySeriesPoint } from '@/hooks/useSalesDashboard';

export interface ProductConversionRow {
  product_id: string;
  product_name: string;
  leads: number;
  vendas: number;
  convPct: number | null;
  avgSaleMs: number | null;
}

export type FollowupTrigger = 'no_reply' | 'inactivity' | 'no_purchase';

export interface FollowupRow {
  rule_id: string;
  label: string;
  trigger_condition: FollowupTrigger;
  is_active: boolean;
  triggered: number;
  replied: number;
  purchased: number;
}

export interface ExpiringSubscription {
  contact_id: string;
  name: string | null;
  phone: string | null;
  subscription_expires_at: string;
  daysUntil: number;
}

export interface IndicadoresMetrics {
  messages: { total: number; series: DaySeriesPoint[]; bySender: NameCount[] };
  productConversion: ProductConversionRow[];
  followups: FollowupRow[];
  expiring: { windowDays: number; items: ExpiringSubscription[] };
}

const EMPTY_METRICS: IndicadoresMetrics = {
  messages: { total: 0, series: [], bySender: [] },
  productConversion: [],
  followups: [],
  expiring: { windowDays: 7, items: [] },
};

export const SENDER_LABEL: Record<string, string> = {
  ai: 'IA',
  operator: 'Operador',
  system: 'Automação',
  contact: 'Contato',
};

export const TRIGGER_LABEL: Record<FollowupTrigger, string> = {
  no_reply: 'Sem resposta (broadcast)',
  inactivity: 'Inatividade',
  no_purchase: 'Sem compra',
};

// ---- helpers de agregação (locais — mesma lógica de useSalesDashboard) ----

const dayKey = (iso: string) => iso.slice(0, 10);

function buildHourlySeries(range: PeriodRange, dates: string[]): DaySeriesPoint[] {
  const pad = (n: number) => String(n).padStart(2, '0');
  const hourKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
  const byHour = new Map<string, number>();
  for (const iso of dates) {
    const k = hourKey(new Date(iso));
    byHour.set(k, (byHour.get(k) ?? 0) + 1);
  }
  const start = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const end = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate(), 23);
  const out: DaySeriesPoint[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 3600000) {
    const k = hourKey(new Date(t));
    out.push({ day: k, value: 0, count: byHour.get(k) ?? 0 });
  }
  return out;
}

function buildDaySeries(range: PeriodRange, dates: string[]): DaySeriesPoint[] {
  const dayMs = 86400000;
  if (range.to.getTime() - range.from.getTime() <= dayMs) return buildHourlySeries(range, dates);
  const start = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  const days = Math.max(1, Math.round((range.to.getTime() - start.getTime()) / dayMs) + 1);
  const byDay = new Map<string, number>();
  for (const iso of dates) {
    const k = dayKey(iso);
    byDay.set(k, (byDay.get(k) ?? 0) + 1);
  }
  const out: DaySeriesPoint[] = [];
  for (let i = 0; i < days; i++) {
    const k = new Date(start.getTime() + i * dayMs).toISOString().slice(0, 10);
    out.push({ day: k, value: 0, count: byDay.get(k) ?? 0 });
  }
  return out;
}

function groupCount(keys: (string | null)[]): NameCount[] {
  const map = new Map<string, number>();
  for (const raw of keys) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    map.set(name, (map.get(name) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, value: count, count }))
    .sort((a, b) => b.count - a.count);
}

interface DealLite {
  id: string;
  created_at: string;
  won_at: string | null;
  status: string;
}

export function useIndicadores(range: PeriodRange, expiringWindowDays: number) {
  const [metrics, setMetrics] = useState<IndicadoresMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const fromISO = range.from.toISOString();
    const toISO = range.to.toISOString();

    try {
      // ---- 1) Mensagens enviadas no período (+ quebra por sender_type) ----
      const { data: msgRows, error: msgErr } = await supabase
        .from('messages')
        .select('created_at, sender_type')
        .eq('direction', 'outbound')
        .gte('created_at', fromISO)
        .lte('created_at', toISO);
      if (msgErr) throw new Error(msgErr.message);
      const messagesOut = (msgRows ?? []) as { created_at: string; sender_type: string }[];
      const messages = {
        total: messagesOut.length,
        series: buildDaySeries(range, messagesOut.map((m) => m.created_at)),
        bySender: groupCount(messagesOut.map((m) => m.sender_type)),
      };

      // ---- 2) Conversão + tempo até venda por produto ----
      const dealCols = 'id, created_at, won_at, status';
      const [createdRes, wonRes] = await Promise.all([
        supabase.from('deals').select(dealCols).gte('created_at', fromISO).lte('created_at', toISO),
        supabase.from('deals').select(dealCols).eq('status', 'won').gte('won_at', fromISO).lte('won_at', toISO),
      ]);
      if (createdRes.error) throw new Error(createdRes.error.message);
      if (wonRes.error) throw new Error(wonRes.error.message);
      const dealsById = new Map<string, DealLite>();
      for (const r of [...((createdRes.data ?? []) as DealLite[]), ...((wonRes.data ?? []) as DealLite[])]) {
        dealsById.set(r.id, r);
      }
      const dealIds = [...dealsById.keys()];
      let productConversion: ProductConversionRow[] = [];
      if (dealIds.length > 0) {
        const { data: dpRows, error: dpErr } = await supabase
          .from('deal_products')
          .select('deal_id, product_id, product:product_id(id, name)')
          .in('deal_id', dealIds);
        if (dpErr) throw new Error(dpErr.message);
        interface DpRow {
          deal_id: string;
          product_id: string;
          product: { id: string; name: string } | null;
        }
        const agg = new Map<
          string,
          { name: string; leads: number; vendas: number; durations: number[] }
        >();
        for (const row of (dpRows ?? []) as unknown as DpRow[]) {
          const product = row.product;
          if (!product) continue;
          const deal = dealsById.get(row.deal_id);
          if (!deal) continue;
          const cur = agg.get(product.id) ?? { name: product.name, leads: 0, vendas: 0, durations: [] };
          const createdISO = deal.created_at;
          const isCreatedInRange = createdISO >= fromISO && createdISO <= toISO;
          const isWonInRange = deal.status === 'won' && !!deal.won_at && deal.won_at >= fromISO && deal.won_at <= toISO;
          if (isCreatedInRange) cur.leads += 1;
          if (isWonInRange) {
            cur.vendas += 1;
            const ms = new Date(deal.won_at!).getTime() - new Date(deal.created_at).getTime();
            if (ms >= 0) cur.durations.push(ms);
          }
          agg.set(product.id, cur);
        }
        productConversion = [...agg.entries()]
          .map(([product_id, v]) => ({
            product_id,
            product_name: v.name,
            leads: v.leads,
            vendas: v.vendas,
            convPct: v.leads > 0 ? (v.vendas / v.leads) * 100 : null,
            avgSaleMs: v.durations.length > 0 ? Math.round(v.durations.reduce((s, d) => s + d, 0) / v.durations.length) : null,
          }))
          .sort((a, b) => b.leads - a.leads);
      }

      // ---- 3) Efetividade dos follow-ups automáticos ----
      const { data: ruleRows, error: ruleErr } = await supabase
        .from('follow_up_rules')
        .select('id, trigger_condition, template_id, sequence_order, is_active, template:template_id(name)');
      if (ruleErr) throw new Error(ruleErr.message);
      interface RuleRow {
        id: string;
        trigger_condition: FollowupTrigger;
        template_id: string | null;
        sequence_order: number;
        is_active: boolean;
        template: { name: string } | null;
      }
      const rules = (ruleRows ?? []) as unknown as RuleRow[];
      const noReplyRules = rules.filter((r) => r.trigger_condition === 'no_reply');
      const directRules = rules.filter((r) => r.trigger_condition !== 'no_reply');

      // no_reply: dispatch = campaign_contacts.template_id_override; já traz replied_at.
      const templateIds = [...new Set(noReplyRules.map((r) => r.template_id).filter((v): v is string => !!v))];
      let ccRows: { template_id_override: string; contact_id: string; sent_at: string; replied_at: string | null }[] = [];
      if (templateIds.length > 0) {
        const { data, error: ccErr } = await supabase
          .from('campaign_contacts')
          .select('template_id_override, contact_id, sent_at, replied_at')
          .in('template_id_override', templateIds)
          .not('sent_at', 'is', null)
          .gte('sent_at', fromISO)
          .lte('sent_at', toISO);
        if (ccErr) throw new Error(ccErr.message);
        ccRows = (data ?? []) as typeof ccRows;
      }

      // inactivity/no_purchase: dispatch = follow_up_log.
      const directRuleIds = directRules.map((r) => r.id);
      let logRows: { rule_id: string; contact_id: string; sent_at: string }[] = [];
      if (directRuleIds.length > 0) {
        const { data, error: logErr } = await supabase
          .from('follow_up_log')
          .select('rule_id, contact_id, sent_at')
          .in('rule_id', directRuleIds)
          .gte('sent_at', fromISO)
          .lte('sent_at', toISO);
        if (logErr) throw new Error(logErr.message);
        logRows = (data ?? []) as typeof logRows;
      }

      // Compra depois: para todo contato disparado, alguma venda (won_at) após o sent_at?
      const allDispatchedContactIds = [...new Set([...ccRows.map((r) => r.contact_id), ...logRows.map((r) => r.contact_id)])];
      const wonAtByContact = new Map<string, number[]>();
      if (allDispatchedContactIds.length > 0) {
        const { data: wonDeals, error: wonErr } = await supabase
          .from('deals')
          .select('contact_id, won_at')
          .eq('status', 'won')
          .not('won_at', 'is', null)
          .in('contact_id', allDispatchedContactIds);
        if (wonErr) throw new Error(wonErr.message);
        for (const d of (wonDeals ?? []) as { contact_id: string; won_at: string }[]) {
          const arr = wonAtByContact.get(d.contact_id) ?? [];
          arr.push(new Date(d.won_at).getTime());
          wonAtByContact.set(d.contact_id, arr);
        }
      }
      const boughtAfter = (contactId: string, sentAtMs: number) =>
        (wonAtByContact.get(contactId) ?? []).some((t) => t > sentAtMs);

      // Resposta depois (só p/ inactivity/no_purchase — no_reply já tem replied_at):
      // via 1ª mensagem inbound do contato após o sent_at.
      const directContactIds = [...new Set(logRows.map((r) => r.contact_id))];
      const inboundAtByConversation = new Map<string, number[]>();
      const conversationByContact = new Map<string, string>();
      if (directContactIds.length > 0) {
        const { data: convRows, error: convErr } = await supabase
          .from('conversations')
          .select('id, contact_id')
          .in('contact_id', directContactIds);
        if (convErr) throw new Error(convErr.message);
        const conversationIds: string[] = [];
        for (const c of (convRows ?? []) as { id: string; contact_id: string }[]) {
          conversationByContact.set(c.contact_id, c.id);
          conversationIds.push(c.id);
        }
        if (conversationIds.length > 0) {
          const { data: inboundRows, error: inbErr } = await supabase
            .from('messages')
            .select('conversation_id, created_at')
            .eq('direction', 'inbound')
            .in('conversation_id', conversationIds)
            .gte('created_at', fromISO);
          if (inbErr) throw new Error(inbErr.message);
          for (const m of (inboundRows ?? []) as { conversation_id: string; created_at: string }[]) {
            const arr = inboundAtByConversation.get(m.conversation_id) ?? [];
            arr.push(new Date(m.created_at).getTime());
            inboundAtByConversation.set(m.conversation_id, arr);
          }
        }
      }
      const repliedAfter = (contactId: string, sentAtMs: number) => {
        const convId = conversationByContact.get(contactId);
        if (!convId) return false;
        return (inboundAtByConversation.get(convId) ?? []).some((t) => t > sentAtMs);
      };

      const followups: FollowupRow[] = rules
        .map((rule) => {
          const label = rule.template?.name
            ? `${TRIGGER_LABEL[rule.trigger_condition]} — ${rule.template.name}`
            : `${TRIGGER_LABEL[rule.trigger_condition]} (seq. ${rule.sequence_order})`;
          if (rule.trigger_condition === 'no_reply') {
            const relevant = ccRows.filter((r) => r.template_id_override === rule.template_id);
            const triggered = relevant.length;
            const replied = relevant.filter((r) => !!r.replied_at).length;
            const purchased = relevant.filter((r) => boughtAfter(r.contact_id, new Date(r.sent_at).getTime())).length;
            return { rule_id: rule.id, label, trigger_condition: rule.trigger_condition, is_active: rule.is_active, triggered, replied, purchased };
          }
          const relevant = logRows.filter((r) => r.rule_id === rule.id);
          const triggered = relevant.length;
          const replied = relevant.filter((r) => repliedAfter(r.contact_id, new Date(r.sent_at).getTime())).length;
          const purchased = relevant.filter((r) => boughtAfter(r.contact_id, new Date(r.sent_at).getTime())).length;
          return { rule_id: rule.id, label, trigger_condition: rule.trigger_condition, is_active: rule.is_active, triggered, replied, purchased };
        })
        .sort((a, b) => b.triggered - a.triggered);

      // ---- 4) Assinaturas vencendo (janela pra frente, independe do período) ----
      const now = new Date();
      const windowEnd = new Date(now.getTime() + expiringWindowDays * 86400000);
      const { data: expRows, error: expErr } = await supabase
        .from('contacts')
        .select('id, name, phone, subscription_expires_at')
        .eq('is_student', true)
        .not('subscription_expires_at', 'is', null)
        .lte('subscription_expires_at', windowEnd.toISOString().slice(0, 10))
        .order('subscription_expires_at', { ascending: true });
      if (expErr) throw new Error(expErr.message);
      const dayMs = 86400000;
      const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const expiring = {
        windowDays: expiringWindowDays,
        items: ((expRows ?? []) as { id: string; name: string | null; phone: string | null; subscription_expires_at: string }[]).map((c) => ({
          contact_id: c.id,
          name: c.name,
          phone: c.phone,
          subscription_expires_at: c.subscription_expires_at,
          daysUntil: Math.round((new Date(`${c.subscription_expires_at}T00:00:00`).getTime() - today0) / dayMs),
        })),
      };

      setMetrics({ messages, productConversion, followups, expiring });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMetrics(EMPTY_METRICS);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, expiringWindowDays]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { metrics, loading, error, reload };
}
