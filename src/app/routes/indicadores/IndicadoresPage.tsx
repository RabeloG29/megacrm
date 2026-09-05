import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, RefreshCw } from 'lucide-react';
import { useIndicadores } from '@/hooks/useIndicadores';
import { PERIOD_PRESETS, periodRange, type PeriodKey } from '@/lib/dashboard';
import {
  ExpiringSubscriptionsWidget,
  FollowupEffectivenessWidget,
  MessagesVolumeWidget,
  ProductConversionWidget,
} from '@/components/indicadores/widgets';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import { cn } from '@/lib/utils';

function isPeriodKey(v: string | null): v is PeriodKey {
  return v === 'today' || v === 'yesterday' || v === 'this_week' || v === 'last_week' || v === '1d' || v === '7d' || v === '15d' || v === '30d' || v === '60d' || v === '90d' || v === 'this_month' || v === 'last_month' || v === 'custom';
}

const EXPIRING_WINDOWS = [7, 15, 30];

export default function IndicadoresPage() {
  const [params, setParams] = useSearchParams();
  const periodKey: PeriodKey = isPeriodKey(params.get('period')) ? (params.get('period') as PeriodKey) : '30d';
  const customFrom = params.get('from') ?? '';
  const customTo = params.get('to') ?? '';
  const expiringWindow = Number(params.get('venc')) || 7;
  const [refreshing, setRefreshing] = useState(false);

  const range = useMemo(() => periodRange(periodKey, customFrom, customTo), [periodKey, customFrom, customTo]);
  const { metrics, loading, error, reload } = useIndicadores(range, expiringWindow);

  const setPeriod = (key: PeriodKey) => {
    const next = new URLSearchParams(params);
    next.set('period', key);
    if (key !== 'custom') {
      next.delete('from');
      next.delete('to');
    }
    setParams(next, { replace: true });
  };

  const setCustom = (which: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params);
    next.set('period', 'custom');
    next.set(which, value);
    setParams(next, { replace: true });
  };

  const setExpiringWindow = (days: number) => {
    const next = new URLSearchParams(params);
    next.set('venc', String(days));
    setParams(next, { replace: true });
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <div className="text-label">Seção</div>
            <h1 className="text-2xl font-bold text-display">Indicadores</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">Mensagens, conversão por produto, follow-ups e assinaturas</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-[rgba(22,163,74,0.2)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* Filtro de período (afeta mensagens, conversão e follow-ups) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-[rgba(22,163,74,0.12)] p-1 bg-[rgba(22,163,74,0.05)]">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold',
                periodKey === p.key
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
              )}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPeriod('custom')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-semibold',
              periodKey === 'custom'
                ? 'bg-[var(--accent-primary)] text-white'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
            )}
          >
            Personalizado
          </button>
        </div>
        {periodKey === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustom('from', e.target.value)}
              className="rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            />
            <span className="text-xs text-[var(--color-text-secondary)]">até</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustom('to', e.target.value)}
              className="rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
            />
          </div>
        )}
      </div>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading ? (
        <div className="glass-card p-10 text-center text-label opacity-60">Carregando métricas...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <MessagesVolumeWidget total={metrics.messages.total} series={metrics.messages.series} bySender={metrics.messages.bySender} />

          <div>
            {/* Vencimento é uma janela pra frente, independente do período acima */}
            <div className="mb-2 flex items-center justify-end gap-1">
              <span className="text-xs text-[var(--color-text-secondary)] mr-1">Janela:</span>
              {EXPIRING_WINDOWS.map((d) => (
                <button
                  key={d}
                  onClick={() => setExpiringWindow(d)}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-semibold border border-[rgba(22,163,74,0.15)]',
                    expiringWindow === d
                      ? 'bg-[var(--accent-primary)] text-white border-transparent'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
            <ExpiringSubscriptionsWidget items={metrics.expiring.items} windowDays={metrics.expiring.windowDays} />
          </div>

          <div className="xl:col-span-2">
            <ProductConversionWidget rows={metrics.productConversion} />
          </div>

          <div className="xl:col-span-2">
            <FollowupEffectivenessWidget rows={metrics.followups} />
          </div>
        </div>
      )}
    </div>
  );
}
