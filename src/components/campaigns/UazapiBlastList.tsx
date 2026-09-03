import { useState } from 'react';
import { toast } from 'sonner';
import { Pause, Play, Plus, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUazapiBlast } from '@/hooks/useUazapiBlast';
import { UazapiBlastWizard } from '@/components/campaigns/UazapiBlastWizard';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import type { Campaign, CampaignStatus } from '@/types/campaigns';

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendado',
  sending: 'Enviando',
  completed: 'Concluído',
  paused: 'Pausado',
  failed: 'Falhou',
};

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-[rgba(22,163,74,0.06)] text-[var(--color-text-secondary)]',
  scheduled: 'bg-[rgba(245,158,11,0.12)] text-[#FBBF24]',
  sending: 'bg-[rgba(22,163,74,0.18)] text-[var(--accent-primary)] animate-pulse',
  completed: 'bg-[rgba(16,185,129,0.12)] text-[var(--color-success)]',
  paused: 'bg-[rgba(22,163,74,0.12)] text-[var(--color-text-secondary)]',
  failed: 'bg-[rgba(239,68,68,0.12)] text-[var(--color-error)]',
};

function progressPct(c: Campaign): number {
  if (!c.total_contacts) return 0;
  const done = c.sent + c.failed;
  return Math.min(100, Math.round((done / c.total_contacts) * 100));
}

// Lista de disparos diretos (UAZAPI, texto livre, pace_seconds) — mesma UI
// de progresso/estatísticas do CampaignsList (broadcast Zernio), mas ligada
// ao useUazapiBlast e ao UazapiBlastWizard.
export function UazapiBlastList() {
  const { campaigns, loading, error, reload, pause, resume, remove } = useUazapiBlast();
  const [showWizard, setShowWizard] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const handleDelete = async (c: Campaign) => {
    if (!confirm(`Remover o disparo "${c.name}"? Todos os envios pendentes serão descartados.`)) return;
    try {
      await remove(c.id);
      toast.success(`Disparo "${c.name}" removido.`);
    } catch (err) {
      toast.error('Falha ao remover disparo', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  const handlePause = async (c: Campaign) => {
    setBusy(c.id);
    try {
      await pause(c.id);
    } catch (err) {
      toast.error('Falha ao pausar disparo', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  const handleResume = async (c: Campaign) => {
    setBusy(c.id);
    try {
      await resume(c.id);
    } catch (err) {
      toast.error('Falha ao retomar disparo', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {campaigns.length} disparo{campaigns.length !== 1 ? 's' : ''} · atualização em tempo real
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] opacity-70">
            Texto livre pela UAZAPI, com pausa configurável entre mensagens — CSV importado ou leads do CRM.
          </p>
        </div>
        <Button onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4" />
          Novo disparo
        </Button>
      </div>

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      <div className="grid grid-cols-1 gap-3">
        {loading ? (
          <div className="glass-card p-8 text-center text-label opacity-60">Carregando...</div>
        ) : campaigns.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Zap className="h-6 w-6 mx-auto mb-2 text-[var(--accent-primary)] opacity-60" />
            <div className="text-label mb-2">Nenhum disparo direto ainda</div>
            <div className="text-sm text-[var(--color-text-secondary)]">
              Importe uma planilha ou selecione leads do CRM para começar um disparo em massa por texto livre.
            </div>
          </div>
        ) : (
          campaigns.map((c) => {
            const pct = progressPct(c);
            return (
              <div key={c.id} className="glass-card p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-semibold text-[var(--color-text-primary)]">{c.name}</h2>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLORS[c.status]}`}>
                        {STATUS_LABEL[c.status]}
                      </span>
                      {c.pace_seconds != null && (
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-[rgba(22,163,74,0.06)] text-[var(--color-text-secondary)]">
                          {c.pace_seconds}s/envio
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {c.total_contacts} destinatários
                      {c.scheduled_at && ` · agendado para ${new Date(c.scheduled_at).toLocaleString('pt-BR')}`}
                      {c.started_at && !c.scheduled_at && ` · iniciado ${new Date(c.started_at).toLocaleString('pt-BR')}`}
                    </div>
                    {c.message_body && (
                      <div className="mt-2 text-xs font-mono text-[var(--color-text-secondary)] bg-[rgba(22,163,74,0.05)] rounded-lg p-2 max-w-xl truncate">
                        {c.message_body}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.status === 'sending' && (
                      <Button size="sm" variant="ghost" onClick={() => handlePause(c)} disabled={busy === c.id}>
                        <Pause className="h-3.5 w-3.5" />
                        Pausar
                      </Button>
                    )}
                    {c.status === 'paused' && (
                      <Button size="sm" variant="ghost" onClick={() => handleResume(c)} disabled={busy === c.id}>
                        <Play className="h-3.5 w-3.5" />
                        Retomar
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(c)} aria-label={`Remover ${c.name}`}>
                      <Trash2 className="h-4 w-4 text-[var(--color-error)]" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-[11px] text-[var(--color-text-secondary)] mb-1">
                    <span>Progresso</span>
                    <span>{pct}% — {Math.min(c.sent + c.failed, c.total_contacts)}/{c.total_contacts}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[rgba(22,163,74,0.06)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#14532D] to-[#16A34A] shadow-[0_0_12px_rgba(22,163,74,0.5)] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Metric label="Enviadas" value={c.sent} tone="primary" />
                  <Metric label="Falhas" value={c.failed} tone="error" pctOf={c.sent + c.failed} />
                  <Metric label="Pendentes" value={Math.max(c.total_contacts - c.sent - c.failed, 0)} tone="secondary" />
                </div>
              </div>
            );
          })
        )}
      </div>

      <UazapiBlastWizard open={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  pctOf,
}: {
  label: string;
  value: number;
  tone: 'primary' | 'secondary' | 'success' | 'error';
  pctOf?: number;
}) {
  const colorClass =
    tone === 'primary'
      ? 'text-[var(--accent-primary)]'
      : tone === 'success'
        ? 'text-[var(--color-success)]'
        : tone === 'error'
          ? 'text-[var(--color-error)]'
          : 'text-[var(--color-text-primary)]';
  const rate = pctOf && pctOf > 0 ? Math.round((value / pctOf) * 100) : null;
  return (
    <div className="rounded-xl bg-[rgba(22,163,74,0.05)] border border-[rgba(22,163,74,0.1)] p-3 text-center transition hover:border-[rgba(22,163,74,0.3)]">
      <div className={`text-xl font-bold ${colorClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] mt-0.5">{label}</div>
      {rate != null && (
        <div className="mt-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)] opacity-80">{Math.min(rate, 100)}%</div>
      )}
    </div>
  );
}
