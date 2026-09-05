import { AlertTriangle, MessageSquareText } from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import type { DaySeriesPoint, NameCount } from '@/hooks/useSalesDashboard';
import type { ExpiringSubscription, FollowupRow, ProductConversionRow } from '@/hooks/useIndicadores';
import { SENDER_LABEL } from '@/hooks/useIndicadores';
import { WidgetCard } from '@/components/dashboard/widgets';
import { formatDuration, formatPct } from '@/lib/dashboard';

const TOOLTIP_STYLE = {
  background: 'rgba(255,255,255,0.95)',
  border: '1px solid rgba(22,163,74,0.25)',
  borderRadius: 10,
  fontSize: 12,
} as const;

const PALETTE = ['#16A34A', '#4ADE80', '#10B981', '#FBBF24', '#A78BFA', '#F87171', '#5B7566'];

const fmtDayLabel = (d: unknown) => {
  const s = String(d);
  if (s.includes('T')) return `${s.slice(11, 13)}h`;
  return new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center text-xs text-[var(--color-text-secondary)] opacity-60">
      {text}
    </div>
  );
}

// --- 1) Mensagens enviadas por período --------------------------------------
function MessagesTooltip({ active, payload, label }: { active?: boolean; payload?: { payload: DaySeriesPoint }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ ...TOOLTIP_STYLE, padding: '8px 12px' }}>
      <div className="mb-1 font-semibold text-[var(--color-text-primary)]">{fmtDayLabel(label)}</div>
      <div className="text-[var(--color-text-secondary)]">
        Mensagens: <span className="font-semibold text-[#16A34A]">{p.count.toLocaleString('pt-BR')}</span>
      </div>
    </div>
  );
}

export function MessagesVolumeWidget({ total, series, bySender }: { total: number; series: DaySeriesPoint[]; bySender: NameCount[] }) {
  return (
    <WidgetCard
      title="Mensagens enviadas"
      subtitle="Volume no período selecionado"
      titleExtra={
        <span className="rounded-full px-2.5 py-0.5 text-sm font-bold" style={{ color: '#16A34A', background: 'rgba(22,163,74,0.1)' }}>
          {total.toLocaleString('pt-BR')}
        </span>
      }
    >
      <div className="h-40">
        {total === 0 ? (
          <EmptyState text="Nenhuma mensagem enviada no período." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="grad-mensagens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" hide />
              <Tooltip content={<MessagesTooltip />} />
              <Area type="monotone" dataKey="count" stroke="#16A34A" strokeWidth={2} fill="url(#grad-mensagens)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {bySender.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[rgba(22,163,74,0.1)] pt-2.5">
          {bySender.map((s, i) => (
            <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
              <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} />
              {SENDER_LABEL[s.name] ?? s.name} · <span className="font-semibold text-[var(--color-text-primary)]">{s.count}</span>
            </span>
          ))}
        </div>
      )}
    </WidgetCard>
  );
}

// --- 2) Conversão + tempo até venda por produto ------------------------------
export function ProductConversionWidget({ rows }: { rows: ProductConversionRow[] }) {
  return (
    <WidgetCard title="Conversão por produto" subtitle="Leads que entraram × vendas, e tempo médio até fechar">
      {rows.length === 0 ? (
        <EmptyState text="Nenhum lead com produto vinculado no período." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
                <th className="pb-2 pr-2 font-semibold">Produto</th>
                <th className="pb-2 pr-2 font-semibold text-right">Leads</th>
                <th className="pb-2 pr-2 font-semibold text-right">Vendas</th>
                <th className="pb-2 pr-2 font-semibold text-right">Conversão</th>
                <th className="pb-2 font-semibold text-right">Tempo até venda</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.product_id} className="border-t border-[rgba(22,163,74,0.08)]">
                  <td className="py-2 pr-2 text-[var(--color-text-primary)]">{r.product_name}</td>
                  <td className="py-2 pr-2 text-right text-[var(--color-text-secondary)]">{r.leads}</td>
                  <td className="py-2 pr-2 text-right font-semibold text-[#10B981]">{r.vendas}</td>
                  <td className="py-2 pr-2 text-right text-[var(--color-text-primary)]">{formatPct(r.convPct)}</td>
                  <td className="py-2 text-right font-mono text-[var(--color-text-primary)]">{formatDuration(r.avgSaleMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WidgetCard>
  );
}

// --- 3) Efetividade dos follow-ups automáticos -------------------------------
export function FollowupEffectivenessWidget({ rows }: { rows: FollowupRow[] }) {
  return (
    <WidgetCard title="Efetividade dos follow-ups" subtitle="Disparados no período × quantos viraram resposta ou venda depois">
      {rows.length === 0 ? (
        <EmptyState text="Nenhuma regra de follow-up configurada ainda." />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const respPct = r.triggered > 0 ? Math.round((r.replied / r.triggered) * 100) : null;
            const compPct = r.triggered > 0 ? Math.round((r.purchased / r.triggered) * 100) : null;
            return (
              <div
                key={r.rule_id}
                className={`rounded-lg border border-[rgba(22,163,74,0.1)] bg-[rgba(22,163,74,0.03)] px-3 py-2.5 ${r.is_active ? '' : 'opacity-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">{r.label}</span>
                  {!r.is_active && (
                    <span className="shrink-0 rounded-full bg-[rgba(91,117,102,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Inativa
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-secondary)]">
                  <span>
                    Disparados: <span className="font-semibold text-[var(--color-text-primary)]">{r.triggered}</span>
                  </span>
                  <span>
                    Respondeu: <span className="font-semibold text-[#16A34A]">{r.replied}</span>
                    {respPct !== null && ` (${respPct}%)`}
                  </span>
                  <span>
                    Comprou depois: <span className="font-semibold text-[#10B981]">{r.purchased}</span>
                    {compPct !== null && ` (${compPct}%)`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetCard>
  );
}

// --- 4) Assinaturas vencendo --------------------------------------------------
export function ExpiringSubscriptionsWidget({ items, windowDays }: { items: ExpiringSubscription[]; windowDays: number }) {
  const overdue = items.filter((i) => i.daysUntil < 0).length;
  return (
    <WidgetCard
      title="Assinaturas vencendo"
      subtitle={`Vencimento nos próximos ${windowDays} dias`}
      titleExtra={
        <span className="rounded-full px-2.5 py-0.5 text-sm font-bold" style={{ color: '#F59E0B', background: 'rgba(245,158,11,0.12)' }}>
          {items.length.toLocaleString('pt-BR')}
        </span>
      }
    >
      {items.length === 0 ? (
        <EmptyState text="Nenhuma assinatura vencendo nesse período." />
      ) : (
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {items.map((i) => (
            <div key={i.contact_id} className="flex items-center justify-between gap-2 rounded-lg border border-[rgba(22,163,74,0.1)] bg-[rgba(22,163,74,0.03)] px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[var(--color-text-primary)]">{i.name || i.phone || 'Sem nome'}</div>
                {i.name && i.phone && <div className="truncate text-xs text-[var(--color-text-secondary)]">{i.phone}</div>}
              </div>
              <span
                className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  i.daysUntil < 0 ? 'bg-[rgba(239,68,68,0.12)] text-[var(--color-error)]' : 'bg-[rgba(245,158,11,0.12)] text-[#B45309]'
                }`}
              >
                {i.daysUntil < 0 ? <AlertTriangle className="h-3 w-3" /> : <MessageSquareText className="h-3 w-3" />}
                {i.daysUntil < 0
                  ? `Venceu há ${Math.abs(i.daysUntil)}d`
                  : i.daysUntil === 0
                    ? 'Vence hoje'
                    : `Em ${i.daysUntil}d`}
              </span>
            </div>
          ))}
        </div>
      )}
      {overdue > 0 && (
        <div className="mt-2 text-xs text-[var(--color-error)]">
          {overdue} já {overdue === 1 ? 'venceu' : 'venceram'} — priorize a renovação.
        </div>
      )}
    </WidgetCard>
  );
}
