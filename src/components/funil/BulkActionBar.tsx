import { useEffect, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  Archive,
  ArrowRightLeft,
  Check,
  GitBranchPlus,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLossReasons } from '@/hooks/useLossReasons';
import type { Pipeline, Stage } from '@/types/crm';
import { getSupabase } from '@/lib/supabase';

const CUSTOM_LOST_REASON = '__custom__';

interface BulkActionBarProps {
  count: number;
  stages: Stage[];
  currentStageId?: string | null; // não usado hoje, reservado p/ futuro filtro
  pipelines: Pipeline[];
  currentPipelineId: string | null;
  onClear: () => void;
  onMoveStage: (stageId: string) => Promise<void>;
  onMarkWon: () => Promise<void>;
  onMarkLost: (reason: string | null) => Promise<void>;
  onArchive: () => Promise<void>;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  onMoveToPipeline: (pipelineId: string, stageId: string) => Promise<{ ok: boolean; error?: string }>;
}

// Barra flutuante de ações em massa — aparece quando 1+ negócios estão
// selecionados no board do funil (checkboxes nos cards + "selecionar todos"
// no cabeçalho da etapa). Cobre: ganho, perdido (com motivo do catálogo),
// mudar de etapa, mudar de funil, arquivar e excluir.
export function BulkActionBar({
  count,
  stages,
  pipelines,
  currentPipelineId,
  onClear,
  onMoveStage,
  onMarkWon,
  onMarkLost,
  onArchive,
  onDelete,
  onMoveToPipeline,
}: BulkActionBarProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [openPanel, setOpenPanel] = useState<'stage' | 'lost' | 'pipeline' | 'delete' | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
      setOpenPanel(null);
    }
  };

  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="relative flex flex-wrap items-center gap-2 rounded-2xl border border-[rgba(22,163,74,0.25)] bg-[#F3FBF6] px-4 py-3 shadow-[0_0_40px_rgba(22,163,74,0.2)]">
        <span className="mr-1 text-sm font-semibold text-[var(--color-text-primary)]">
          {count} selecionado{count > 1 ? 's' : ''}
        </span>

        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void run('won', onMarkWon)}
        >
          {busy === 'won' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />} Ganho
        </Button>

        <div className="relative">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => setOpenPanel((p) => (p === 'lost' ? null : 'lost'))}
          >
            <ThumbsDown className="h-4 w-4" /> Perdido
          </Button>
          {openPanel === 'lost' && (
            <LostPanel
              busy={busy === 'lost'}
              onCancel={() => setOpenPanel(null)}
              onConfirm={(reason) => void run('lost', () => onMarkLost(reason))}
            />
          )}
        </div>

        <div className="relative">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => setOpenPanel((p) => (p === 'stage' ? null : 'stage'))}
          >
            <ArrowRightLeft className="h-4 w-4" /> Etapa
          </Button>
          {openPanel === 'stage' && (
            <StagePanel
              stages={stages}
              busy={busy === 'stage'}
              onCancel={() => setOpenPanel(null)}
              onConfirm={(stageId) => void run('stage', () => onMoveStage(stageId))}
            />
          )}
        </div>

        <div className="relative">
          <Button
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => setOpenPanel((p) => (p === 'pipeline' ? null : 'pipeline'))}
          >
            <GitBranchPlus className="h-4 w-4" /> Funil
          </Button>
          {openPanel === 'pipeline' && (
            <PipelinePanel
              pipelines={pipelines}
              currentPipelineId={currentPipelineId}
              busy={busy === 'pipeline'}
              onCancel={() => setOpenPanel(null)}
              onConfirm={(pipelineId, stageId) =>
                void run('pipeline', async () => {
                  const res = await onMoveToPipeline(pipelineId, stageId);
                  if (!res.ok) toast.error(res.error ?? 'Não foi possível mover.');
                })
              }
            />
          )}
        </div>

        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null}
          onClick={() => void run('archive', onArchive)}
        >
          {busy === 'archive' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />} Arquivar
        </Button>

        <div className="relative">
          <Button
            size="sm"
            variant="destructive"
            disabled={busy !== null}
            onClick={() => setOpenPanel((p) => (p === 'delete' ? null : 'delete'))}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          {openPanel === 'delete' && (
            <DeletePanel
              count={count}
              busy={busy === 'delete'}
              onCancel={() => setOpenPanel(null)}
              onConfirm={() =>
                void run('delete', async () => {
                  const res = await onDelete();
                  if (!res.ok) toast.error(res.error ?? 'Não foi possível excluir.');
                })
              }
            />
          )}
        </div>

        <button
          onClick={onClear}
          title="Limpar seleção"
          className="ml-1 rounded-lg p-2 text-[var(--color-text-secondary)] transition hover:bg-[rgba(22,163,74,0.1)] hover:text-[var(--color-text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Popover({ children }: { children: ReactNode }) {
  return (
    <div className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-[rgba(22,163,74,0.25)] bg-[#F3FBF6] p-3 shadow-[0_0_30px_rgba(22,163,74,0.2)]">
      {children}
    </div>
  );
}

function LostPanel({
  onConfirm,
  onCancel,
  busy,
}: {
  onConfirm: (reason: string | null) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { reasons } = useLossReasons();
  const [reasonId, setReasonId] = useState('');
  const [custom, setCustom] = useState('');

  const inputCls =
    'w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]';

  const submit = () => {
    const text = reasonId === CUSTOM_LOST_REASON
      ? custom.trim() || null
      : reasons.find((r) => r.id === reasonId)?.name ?? null;
    onConfirm(text);
  };

  return (
    <Popover>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Motivo da perda</div>
      <select value={reasonId} onChange={(e) => setReasonId(e.target.value)} className={inputCls}>
        <option value="">Sem motivo específico</option>
        {reasons.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
        <option value={CUSTOM_LOST_REASON}>Outro (especificar)...</option>
      </select>
      {reasonId === CUSTOM_LOST_REASON && (
        <input
          autoFocus
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Descreva o motivo"
          className={`${inputCls} mt-2`}
        />
      )}
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy} onClick={submit}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar
        </Button>
        <button onClick={onCancel} className="rounded-lg border border-[rgba(22,163,74,0.2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
          Cancelar
        </button>
      </div>
    </Popover>
  );
}

function StagePanel({
  stages,
  onConfirm,
  onCancel,
  busy,
}: {
  stages: Stage[];
  onConfirm: (stageId: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [stageId, setStageId] = useState(stages[0]?.id ?? '');
  const inputCls =
    'w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]';
  return (
    <Popover>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Mover para a etapa</div>
      <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={inputCls}>
        {stages.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" disabled={busy || !stageId} onClick={() => onConfirm(stageId)}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mover
        </Button>
        <button onClick={onCancel} className="rounded-lg border border-[rgba(22,163,74,0.2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
          Cancelar
        </button>
      </div>
    </Popover>
  );
}

function PipelinePanel({
  pipelines,
  currentPipelineId,
  onConfirm,
  onCancel,
  busy,
}: {
  pipelines: Pipeline[];
  currentPipelineId: string | null;
  onConfirm: (pipelineId: string, stageId: string) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const targets = pipelines.filter((p) => p.id !== currentPipelineId);
  const [pipelineId, setPipelineId] = useState(targets[0]?.id ?? '');
  const [stages, setStages] = useState<Stage[]>([]);
  const [stageId, setStageId] = useState('');
  const [loadingStages, setLoadingStages] = useState(false);

  const loadStages = (id: string) => {
    if (!id) { setStages([]); setStageId(''); return; }
    setLoadingStages(true);
    const supabase = getSupabase();
    void supabase
      .from('stages')
      .select('*')
      .eq('pipeline_id', id)
      .order('position')
      .then(({ data }) => {
        const list = (data ?? []) as Stage[];
        setStages(list);
        setStageId(list[0]?.id ?? '');
        setLoadingStages(false);
      });
  };

  // Carrega as etapas do funil já pré-selecionado na primeira renderização.
  useEffect(() => {
    if (pipelineId) loadStages(pipelineId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inputCls =
    'w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]';

  return (
    <Popover>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Mover para outro funil</div>
      {targets.length === 0 ? (
        <div className="text-xs text-[var(--color-text-secondary)]">Não há outro funil comercial disponível.</div>
      ) : (
        <>
          <select
            value={pipelineId}
            onChange={(e) => { setPipelineId(e.target.value); loadStages(e.target.value); }}
            className={inputCls}
          >
            {targets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={`${inputCls} mt-2`} disabled={loadingStages}>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1" disabled={busy || !pipelineId || !stageId} onClick={() => onConfirm(pipelineId, stageId)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Mover
            </Button>
            <button onClick={onCancel} className="rounded-lg border border-[rgba(22,163,74,0.2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
              Cancelar
            </button>
          </div>
        </>
      )}
    </Popover>
  );
}

function DeletePanel({
  count,
  onConfirm,
  onCancel,
  busy,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  return (
    <Popover>
      <div className="mb-2 text-sm text-[var(--color-text-primary)]">
        Excluir <strong>{count}</strong> negócio{count > 1 ? 's' : ''}? Essa ação não pode ser desfeita.
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" className="flex-1" disabled={busy} onClick={onConfirm}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Excluir
        </Button>
        <button onClick={onCancel} className="rounded-lg border border-[rgba(22,163,74,0.2)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
          Cancelar
        </button>
      </div>
    </Popover>
  );
}
