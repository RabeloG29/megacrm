import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, CheckSquare, ChevronDown, Clock, GitBranchPlus, ListChecks, MessageCircle, Plus, RefreshCw, Settings2, Square, X } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { usePipeline } from '@/hooks/usePipeline';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { useProducts } from '@/hooks/useProducts';
import { useContacts } from '@/hooks/useContacts';
import { useTags } from '@/hooks/useTags';
import { normalizePhone } from '@/lib/phone';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import { DealDrawer } from '@/components/funil/DealDrawer';
import { FunilManager } from '@/components/funil/FunilManager';
import { BulkActionBar } from '@/components/funil/BulkActionBar';
import { applyFunilFilters, EMPTY_FILTERS, FunilFilters, sortFunilDeals, type FunilFilterState, type FunilSort } from '@/components/funil/FunilFilters';
import { DUE_TONE_STYLE, dueTone, getDealOrigin, TEMPERATURE_STYLE, TRAFFIC_TYPE_STYLE, type ContactLite, type Deal, type Product, type Stage, type Tag } from '@/types/crm';

const fmtDueShort = (s: string) =>
  new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Paginação por etapa: mostra 20 e vai expandindo de 20 em 20 ("Exibir mais").
const PAGE_SIZE = 20;

export default function FunilPage() {
  const funil = usePipeline();
  const {
    pipelines, selectedId, select, pipeline, stages, deals, nextActionByDeal, convByContact,
    loading, error, reload, moveDeal, createDeal, archiveDeal, unarchiveDeal,
    bulkMoveStage, bulkMarkWon, bulkMarkLost, bulkArchive, bulkDelete, bulkMoveToPipeline,
  } = funil;
  const { role, userId } = useAppUser();
  const { products } = useProducts();
  const { tags: tagCatalog } = useTags();
  const { create: createContact } = useContacts();

  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [openDealId, setOpenDealId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [filters, setFilters] = useState<FunilFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<FunilSort>('recente');
  const [visibleByStage, setVisibleByStage] = useState<Record<string, number>>({});
  // Seleção múltipla (ações em massa): ids de negócios marcados no board.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectMany = (ids: string[], on: boolean) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => { if (on) next.add(id); else next.delete(id); });
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const openDeal = useMemo(() => deals.find((d) => d.id === openDealId) ?? null, [deals, openDealId]);

  // Deep-link vindo da ficha do contato: ?deal=<uuid> abre o drawer quando o
  // deal estiver carregado no funil ativo.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const dealParam = searchParams.get('deal');
    if (dealParam && deals.some((d) => d.id === dealParam)) {
      setOpenDealId(dealParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals]);

  useEffect(() => {
    const supabase = getSupabase();
    void supabase
      .from('contacts')
      .select('id, name, phone')
      .order('name')
      .limit(500)
      .then(({ data }) => setContacts((data ?? []) as ContactLite[]));
  }, []);

  // Ícone de WhatsApp no card: lead que nunca conversou ainda não tem linha
  // em conversations — cria na hora (atribuída a quem clicou, IA pausada, sem
  // status "ai_active" pra IA não assumir a primeira resposta do contato) e
  // devolve o id pra já abrir a thread pronta pra mandar a 1ª mensagem.
  // Usa o mesmo canal/provider (uazapi x zernio) dos números já configurados,
  // senão a conversa nasce com o provider 'zernio' (default da coluna) e pode
  // cair na trava de janela de 24h da Meta sem nunca ter tido inbound.
  const startConversation = async (contactId: string): Promise<string | null> => {
    const supabase = getSupabase();
    const { data: activeChannels } = await supabase
      .from('channels')
      .select('id, provider')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    // Prioriza um número UAZAPI (sem trava de janela de 24h) sobre a API
    // oficial da Meta — pro operador conseguir mandar a 1ª mensagem na hora,
    // mesmo sem nenhum inbound ainda.
    const channels = (activeChannels ?? []) as Array<{ id: string; provider: string }>;
    const channel = channels.find((c) => c.provider === 'uazapi') ?? channels[0] ?? null;
    const { data, error: err } = await supabase
      .from('conversations')
      .insert({
        contact_id: contactId,
        status: 'human_active',
        ai_paused: true,
        assigned_to: userId,
        channel_id: channel?.id ?? null,
        ...(channel?.provider ? { provider: channel.provider } : {}),
      })
      .select('id')
      .single();
    if (err) {
      // Corrida: já existe conversa pra esse contato (ex.: acabou de chegar
      // mensagem inbound) — busca a existente em vez de falhar.
      if (err.message.toLowerCase().includes('duplicate key')) {
        const { data: existing } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contactId)
          .maybeSingle();
        return (existing as { id: string } | null)?.id ?? null;
      }
      toast.error('Falha ao iniciar conversa', { description: err.message });
      return null;
    }
    return (data as { id: string }).id;
  };

  // "+ Novo lead" dentro do form de criar negócio: cadastra o contato na hora
  // (nome + telefone obrigatórios) e já injeta no dropdown de contatos local.
  const createLeadInline = async (input: {
    name: string;
    phone: string;
    email?: string;
    tagIds: string[];
  }): Promise<ContactLite | null> => {
    const normalized = normalizePhone(input.phone);
    if (!normalized.ok) {
      toast.error('Telefone inválido', { description: normalized.error });
      return null;
    }
    try {
      const created = await createContact({
        phone: normalized.e164,
        name: input.name.trim(),
        email: input.email?.trim() || null,
        tag_ids: input.tagIds,
      });
      if (!created) return null;
      const lite: ContactLite = { id: created.id, name: created.name, phone: created.phone ?? normalized.e164 };
      setContacts((cur) => [...cur, lite].sort((a, b) => (a.name ?? a.phone).localeCompare(b.name ?? b.phone)));
      return lite;
    } catch (err) {
      toast.error('Falha ao criar lead', { description: err instanceof Error ? err.message : String(err) });
      return null;
    }
  };

  // Troca de funil, filtro ou ordenação volta a paginação das etapas para 20
  // e limpa a seleção (evita ação em massa em cards que saíram da tela).
  useEffect(() => {
    setVisibleByStage({});
    setSelectedIds(new Set());
  }, [selectedId, filters, sort]);

  const archivedDeals = useMemo(() => deals.filter((d) => d.archived_at), [deals]);
  const boardDeals = useMemo(
    () => sortFunilDeals(
      applyFunilFilters(deals.filter((d) => !d.archived_at), filters, nextActionByDeal, convByContact),
      sort,
    ),
    [deals, filters, nextActionByDeal, convByContact, sort],
  );

  const totalPipeline = useMemo(
    () => boardDeals.reduce((s, d) => s + (Number(d.value) || 0), 0),
    [boardDeals],
  );

  return (
    <div className="max-w-full space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
          <GitBranchPlus className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div className="min-w-0">
          <div className="text-label">Funil comercial</div>
          <h1 className="text-2xl font-bold text-display truncate">{pipeline?.name ?? 'Funil'}</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            {boardDeals.length} negócio(s) · {brl(totalPipeline)} em pipeline · arraste entre as etapas
          </p>
        </div>

        {/* Atualizar + seletor de funil + arquivados + gestão */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <button
            onClick={() => void reload()}
            disabled={loading}
            title="Atualizar funil"
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(22,163,74,0.25)] px-3 py-2 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--accent-primary)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            onClick={() => setArchivedOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[rgba(22,163,74,0.25)] px-3 py-2 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--accent-primary)]"
          >
            <Archive className="h-4 w-4" /> Arquivados
            {archivedDeals.length > 0 && (
              <span className="rounded-full bg-[rgba(22,163,74,0.12)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--color-text-secondary)]">
                {archivedDeals.length}
              </span>
            )}
          </button>
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(22,163,74,0.25)] bg-[rgba(22,163,74,0.06)] px-3 py-2 text-sm text-[var(--color-text-primary)] transition hover:border-[var(--accent-primary)]"
            >
              {pipeline?.name ?? 'Funil'}
              <ChevronDown className="h-4 w-4 opacity-70" />
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-[rgba(22,163,74,0.25)] bg-[#F3FBF6] p-1 shadow-[0_0_30px_rgba(22,163,74,0.15)]">
                  {pipelines.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { select(p.id); setPickerOpen(false); }}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition hover:bg-[rgba(22,163,74,0.06)] ${
                        p.id === selectedId ? 'text-[var(--accent-secondary)]' : 'text-[var(--color-text-primary)]'
                      }`}
                    >
                      {p.name}
                      {p.is_default && <span className="text-[10px] text-[var(--color-text-secondary)]">padrão</span>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {role === 'admin' && (
            <button
              onClick={() => setManageOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-[rgba(22,163,74,0.25)] px-3 py-2 text-sm text-[var(--accent-secondary)] transition hover:border-[var(--accent-primary)]"
            >
              <Settings2 className="h-4 w-4" /> Gerenciar funis
            </button>
          )}
        </div>
      </div>

      <FunilFilters filters={filters} onChange={setFilters} sort={sort} onSortChange={setSort} />

      {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

      {loading ? (
        <div className="text-label opacity-60">Carregando funil...</div>
      ) : !pipeline ? (
        <div className="glass-card p-6 text-sm text-[var(--color-text-secondary)]">
          Nenhum funil comercial configurado.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const list = boardDeals.filter((d) => d.stage_id === stage.id);
            const total = list.reduce((s, d) => s + (Number(d.value) || 0), 0);
            const visible = visibleByStage[stage.id] ?? PAGE_SIZE;
            const shown = list.slice(0, visible);
            const remaining = list.length - shown.length;
            return (
              <div
                key={stage.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId) void moveDeal(dragId, stage.id);
                  setDragId(null);
                }}
                className="flex w-72 shrink-0 flex-col rounded-xl border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)]"
              >
                <div className="flex items-center justify-between border-b border-[rgba(22,163,74,0.1)] px-3 py-2.5">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                    {stage.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />}
                    {stage.name}
                  </span>
                  <StageSelectMenu
                    count={list.length}
                    selectedCount={list.filter((d) => selectedIds.has(d.id)).length}
                    onSelect={(n) => selectMany(list.slice(0, n).map((d) => d.id), true)}
                    onClear={() => selectMany(list.map((d) => d.id), false)}
                  />
                </div>
                <div className="px-3 pt-1 text-xs text-[var(--color-text-secondary)]">{brl(total)}</div>

                <div className="flex-1 space-y-2 p-3">
                  {/* + Negócio no topo da etapa */}
                  {adding === stage.id ? (
                    <AddDealForm
                      contacts={contacts}
                      products={products}
                      tags={tagCatalog}
                      onCreateLead={createLeadInline}
                      onCancel={() => setAdding(null)}
                      onSubmit={async (input) => {
                        await createDeal({ ...input, stage_id: stage.id });
                        setAdding(null);
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => setAdding(stage.id)}
                      className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[rgba(22,163,74,0.25)] py-1.5 text-xs text-[var(--color-text-secondary)] transition hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)]"
                    >
                      <Plus className="h-3 w-3" /> Negócio
                    </button>
                  )}

                  {shown.map((deal) => (
                    <DealCard
                      key={deal.id}
                      deal={deal}
                      nextDue={nextActionByDeal[deal.id] ?? null}
                      hasConversation={Boolean(convByContact[deal.contact_id]?.length)}
                      onStartConversation={startConversation}
                      selected={selectedIds.has(deal.id)}
                      onToggleSelect={() => toggleSelect(deal.id)}
                      onDragStart={() => setDragId(deal.id)}
                      onOpen={() => setOpenDealId(deal.id)}
                      onArchive={() => void archiveDeal(deal.id)}
                    />
                  ))}

                  {remaining > 0 && (
                    <button
                      onClick={() =>
                        setVisibleByStage((cur) => ({ ...cur, [stage.id]: visible + PAGE_SIZE }))
                      }
                      className="flex w-full items-center justify-center gap-1 rounded-lg border border-[rgba(22,163,74,0.2)] py-1.5 text-xs text-[var(--accent-secondary)] transition hover:border-[var(--accent-primary)]"
                    >
                      Exibir mais ({remaining})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {openDeal && (
        <DealDrawer
          deal={openDeal}
          stages={stages}
          pipelines={pipelines}
          isAdmin={role === 'admin'}
          onClose={() => setOpenDealId(null)}
          onStageChange={moveDeal}
          onChanged={reload}
        />
      )}

      {manageOpen && (
        <FunilManager funil={funil} onClose={() => setManageOpen(false)} />
      )}

      {archivedOpen && (
        <ArchivedPanel
          deals={archivedDeals}
          stages={stages}
          onClose={() => setArchivedOpen(false)}
          onRestore={(id) => void unarchiveDeal(id)}
          onOpen={(id) => { setArchivedOpen(false); setOpenDealId(id); }}
        />
      )}

      <BulkActionBar
        count={selectedIds.size}
        stages={stages}
        pipelines={pipelines}
        currentPipelineId={selectedId}
        onClear={clearSelection}
        onMoveStage={async (stageId) => { await bulkMoveStage([...selectedIds], stageId); clearSelection(); }}
        onMarkWon={async () => { await bulkMarkWon([...selectedIds]); clearSelection(); }}
        onMarkLost={async (reason) => { await bulkMarkLost([...selectedIds], reason); clearSelection(); }}
        onArchive={async () => { await bulkArchive([...selectedIds]); clearSelection(); }}
        onDelete={async () => { const res = await bulkDelete([...selectedIds]); clearSelection(); return res; }}
        onMoveToPipeline={async (pipelineId, stageId) => {
          const res = await bulkMoveToPipeline([...selectedIds], pipelineId, stageId);
          clearSelection();
          return res;
        }}
      />
    </div>
  );
}

// Popover no cabeçalho da etapa: "selecionar todos" ou um número específico
// dos primeiros N cards (mesma lógica do exemplo de referência do usuário).
function StageSelectMenu({
  count,
  selectedCount,
  onSelect,
  onClear,
}: {
  count: number;
  selectedCount: number;
  onSelect: (n: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState('');

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition ${
          selectedCount > 0
            ? 'bg-[rgba(22,163,74,0.15)] text-[var(--accent-secondary)] font-semibold'
            : 'text-[var(--color-text-secondary)] hover:bg-[rgba(22,163,74,0.08)]'
        }`}
        title="Selecionar negócios desta etapa"
      >
        {selectedCount > 0 ? `${selectedCount}/${count}` : count}
        <ListChecks className="h-3 w-3 opacity-70" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-48 rounded-lg border border-[rgba(22,163,74,0.25)] bg-[#F3FBF6] p-2 shadow-[0_0_30px_rgba(22,163,74,0.15)]">
            <button
              onClick={() => { onSelect(count); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--color-text-primary)] transition hover:bg-[rgba(22,163,74,0.08)]"
            >
              <CheckSquare className="h-3.5 w-3.5" /> Selecionar todos ({count})
            </button>
            <div className="mt-1 flex items-center gap-1 px-2 py-1">
              <span className="text-xs text-[var(--color-text-secondary)]">Selecionar</span>
              <input
                type="number"
                min={1}
                max={count}
                value={n}
                onChange={(e) => setN(e.target.value)}
                placeholder="N"
                className="w-14 rounded-md border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-1.5 py-0.5 text-xs text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]"
              />
              <button
                onClick={() => { const v = Math.max(0, Math.min(count, Number(n) || 0)); if (v > 0) onSelect(v); setOpen(false); setN(''); }}
                className="rounded-md border border-[rgba(22,163,74,0.2)] px-1.5 py-0.5 text-xs text-[var(--accent-secondary)] transition hover:border-[var(--accent-primary)]"
              >
                Ir
              </button>
            </div>
            {selectedCount > 0 && (
              <button
                onClick={() => { onClear(); setOpen(false); }}
                className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-[var(--color-text-secondary)] transition hover:bg-[rgba(22,163,74,0.08)]"
              >
                <Square className="h-3.5 w-3.5" /> Limpar seleção
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Painel lateral com os deals arquivados do funil ativo (restaurar / abrir).
function ArchivedPanel({
  deals, stages, onClose, onRestore, onOpen,
}: {
  deals: Deal[];
  stages: Stage[];
  onClose: () => void;
  onRestore: (dealId: string) => void;
  onOpen: (dealId: string) => void;
}) {
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name ?? '—';
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[rgba(22,163,74,0.2)] bg-[#F3FBF6] shadow-[0_0_60px_rgba(22,163,74,0.15)]">
        <div className="flex items-center justify-between border-b border-[rgba(22,163,74,0.1)] px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
            <Archive className="h-4 w-4 text-[var(--accent-primary)]" /> Negócios arquivados ({deals.length})
          </span>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--color-text-secondary)] transition hover:bg-[rgba(22,163,74,0.06)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {deals.length === 0 && (
            <div className="text-sm text-[var(--color-text-secondary)]">Nenhum negócio arquivado neste funil.</div>
          )}
          {deals.map((d) => {
            const leadName = d.contact?.name?.trim() || d.contact?.phone || 'Sem nome';
            return (
              <div key={d.id} className="rounded-xl border border-[rgba(22,163,74,0.2)] p-3" style={{ background: '#FFFFFF' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 cursor-pointer" onClick={() => onOpen(d.id)}>
                    <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{leadName}</div>
                    <div className="truncate text-xs text-[var(--color-text-secondary)]">{d.title}</div>
                    <div className="mt-1 text-[10px] text-[var(--color-text-secondary)]">
                      {stageName(d.stage_id)} · {brl(Number(d.value) || 0)}
                      {d.archived_at && <> · arquivado em {fmtDate(d.archived_at)}</>}
                    </div>
                  </div>
                  <button
                    onClick={() => onRestore(d.id)}
                    title="Restaurar para o funil"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[rgba(22,163,74,0.25)] px-2 py-1 text-[11px] text-[var(--accent-secondary)] transition hover:border-[var(--accent-primary)]"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restaurar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DealCard({
  deal,
  nextDue,
  hasConversation,
  onStartConversation,
  selected,
  onToggleSelect,
  onDragStart,
  onOpen,
  onArchive,
}: {
  deal: Deal;
  nextDue: string | null;
  hasConversation: boolean;
  onStartConversation: (contactId: string) => Promise<string | null>;
  selected: boolean;
  onToggleSelect: () => void;
  onDragStart: () => void;
  onOpen: () => void;
  onArchive: () => void;
}) {
  const draggedRef = useRef(false);
  const navigate = useNavigate();
  const [openingChat, setOpeningChat] = useState(false);
  const leadName = deal.contact?.name?.trim() || deal.contact?.phone || 'Sem nome';
  const temp = TEMPERATURE_STYLE[deal.temperature];
  const origin = getDealOrigin(deal);
  // Subtítulo minimizado: 1º produto comprado (+ "e outros" se houver mais);
  // sem produtos, cai no título do negócio.
  const products = deal.products ?? [];
  const subtitle =
    products.length > 0
      ? products[0].name + (products.length > 1 ? ' e outros' : '')
      : deal.title;

  return (
    <div
      draggable
      onDragStart={() => { draggedRef.current = true; onDragStart(); }}
      onDragEnd={() => { window.setTimeout(() => { draggedRef.current = false; }, 50); }}
      onClick={() => { if (!draggedRef.current) onOpen(); }}
      className={`group relative cursor-pointer p-3 pl-8 transition hover:border-[rgba(22,163,74,0.45)] active:cursor-grabbing rounded-xl border shadow-[0_0_20px_rgba(22,163,74,0.06),inset_0_1px_0_rgba(22,163,74,0.1)] ${
        selected ? 'border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)]' : 'border-[rgba(22,163,74,0.25)]'
      }`}
      style={{ background: '#FFFFFF' }}
    >
      {/* Checkbox de seleção (ações em massa) — canto superior esquerdo,
          discreta até o card ser selecionado ou receber hover. */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
        title={selected ? 'Remover da seleção' : 'Selecionar negócio'}
        className={`absolute left-2 top-3 rounded p-0.5 transition ${
          selected ? 'text-[var(--accent-primary)] opacity-100' : 'text-[var(--color-text-secondary)] opacity-0 group-hover:opacity-100'
        }`}
      >
        {selected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>
      <div className="flex items-start justify-between gap-2">
        {/* Ajuste 3: nome do LEAD em destaque, produto(s) como subtítulo */}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">{leadName}</div>
          <div className="truncate text-xs text-[var(--color-text-secondary)]">{subtitle}</div>
        </div>
        {temp && (
          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${temp.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${temp.dot}`} />
            {temp.label}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--accent-secondary)]">{brl(Number(deal.value) || 0)}</span>
        {deal.lead_type === 'Cliente' && (
          <span className="rounded-full bg-[rgba(16,185,129,0.12)] px-2 py-0.5 text-[10px] font-semibold text-[#10B981]">Cliente</span>
        )}
      </div>
      {/* WhatsApp + Arquivar: overlay absoluto no canto inferior direito, só
          no hover — fora do fluxo, não desloca nenhum badge. Sempre abre
          dentro do Inbox do CRM: com conversa já registrada, vai direto nela;
          sem conversa ainda, cria uma na hora (startConversation) e só então
          navega — nunca sai pro WhatsApp Web/app externo. */}
      <button
        type="button"
        disabled={openingChat}
        onClick={async (e) => {
          e.stopPropagation();
          if (hasConversation) {
            navigate(`/inbox?contact=${deal.contact_id}`);
            return;
          }
          setOpeningChat(true);
          const conversationId = await onStartConversation(deal.contact_id);
          setOpeningChat(false);
          if (conversationId) navigate(`/inbox?conversation=${conversationId}`);
        }}
        title="Abrir conversa no Inbox"
        className="absolute bottom-2 right-9 rounded-md border border-[rgba(22,163,74,0.25)] p-1 text-[var(--color-text-secondary)] opacity-0 transition group-hover:opacity-100 hover:bg-[rgba(22,163,74,0.12)] hover:text-[var(--accent-primary)] disabled:opacity-60"
        style={{ background: '#FFFFFF' }}
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onArchive(); }}
        title="Arquivar negócio"
        className="absolute bottom-2 right-2 rounded-md border border-[rgba(22,163,74,0.25)] p-1 text-[var(--color-text-secondary)] opacity-0 transition group-hover:opacity-100 hover:bg-[rgba(22,163,74,0.12)] hover:text-[var(--color-text-primary)]"
        style={{ background: '#FFFFFF' }}
      >
        <Archive className="h-3.5 w-3.5" />
      </button>
      {/* Origem do lead (UTM): só o destaque (Meta Ads / Google Ads / Orgânico) */}
      {origin && (
        <div className="mt-1.5 flex items-center text-[10px]">
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 font-semibold ${TRAFFIC_TYPE_STYLE[origin.traffic ?? ''] ?? ''}`}>
            {origin.highlight}
          </span>
        </div>
      )}
      {/* Badge de relógio: prazo da próxima ação pendente */}
      {nextDue && (
        <div className="mt-1.5 flex items-center">
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${DUE_TONE_STYLE[dueTone(nextDue)]}`}>
            <Clock className="h-2.5 w-2.5" />
            {fmtDueShort(nextDue)}
          </span>
        </div>
      )}
      {deal.tags && deal.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {deal.tags.slice(0, 3).map((t) => (
            <span
              key={t.id}
              className="rounded-full px-2 py-0.5 text-[10px]"
              style={{ background: `${t.color}22`, color: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const NEW_LEAD_OPTION = '__new_lead__';

function AddDealForm({
  contacts,
  products,
  tags,
  onCreateLead,
  onSubmit,
  onCancel,
}: {
  contacts: ContactLite[];
  products: Product[];
  tags: Tag[];
  onCreateLead: (input: { name: string; phone: string; email?: string; tagIds: string[] }) => Promise<ContactLite | null>;
  onSubmit: (input: { title: string; contact_id: string; value?: number; product_id?: string; product_name?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [contactId, setContactId] = useState('');
  const [creatingLead, setCreatingLead] = useState(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [leadEmail, setLeadEmail] = useState('');
  const [leadTagIds, setLeadTagIds] = useState<Set<string>>(new Set());
  const [productId, setProductId] = useState('');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const inputCls =
    'w-full rounded-md border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]';

  const toggleLeadTag = (id: string) => {
    setLeadTagIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const canSubmit = creatingLead
    ? leadName.trim() && leadPhone.trim() && productId
    : contactId && productId;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setBusy(true);
        try {
          let finalContactId = contactId;
          if (creatingLead) {
            const created = await onCreateLead({
              name: leadName,
              phone: leadPhone,
              email: leadEmail,
              tagIds: Array.from(leadTagIds),
            });
            if (!created) {
              setBusy(false);
              return;
            }
            finalContactId = created.id;
          }
          const product = products.find((p) => p.id === productId);
          await onSubmit({
            title: product?.name ?? '',
            contact_id: finalContactId,
            value: Number(value) || 0,
            product_id: productId || undefined,
            product_name: product?.name,
          });
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-2 rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] p-2"
    >
      {creatingLead ? (
        <div className="space-y-1.5 rounded-md border border-dashed border-[rgba(22,163,74,0.3)] p-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Novo lead</span>
            <button
              type="button"
              onClick={() => { setCreatingLead(false); setLeadName(''); setLeadPhone(''); setLeadEmail(''); setLeadTagIds(new Set()); }}
              className="text-[10px] text-[var(--color-text-secondary)] underline"
            >
              usar contato existente
            </button>
          </div>
          <input autoFocus value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Nome*" className={inputCls} />
          <input value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} placeholder="Telefone*" className={inputCls} />
          <input value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} type="email" placeholder="E-mail (opcional)" className={inputCls} />
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {tags.map((t) => {
                const active = leadTagIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleLeadTag(t.id)}
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold transition"
                    style={
                      active
                        ? { backgroundColor: t.color, color: '#fff' }
                        : { backgroundColor: `${t.color}22`, color: t.color }
                    }
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <select
          value={contactId}
          onChange={(e) => {
            if (e.target.value === NEW_LEAD_OPTION) {
              setCreatingLead(true);
              setContactId('');
            } else {
              setContactId(e.target.value);
            }
          }}
          className={inputCls}
        >
          <option value="">Contato (lead)…</option>
          <option value={NEW_LEAD_OPTION}>+ Novo lead</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name ?? c.phone}</option>
          ))}
        </select>
      )}

      <select
        value={productId}
        onChange={(e) => {
          setProductId(e.target.value);
          const product = products.find((p) => p.id === e.target.value);
          if (product?.price && !value) setValue(String(product.price));
        }}
        className={inputCls}
      >
        <option value="">Produto…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
      <input value={value} onChange={(e) => setValue(e.target.value)} type="number" step="0.01" placeholder="Valor (R$)" className={inputCls} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !canSubmit} className="flex-1 rounded-md bg-[var(--accent-primary)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border border-[rgba(22,163,74,0.2)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
          <X className="h-3 w-3" />
        </button>
      </div>
    </form>
  );
}

// Reexport para o Manager consumir o mesmo tipo de retorno do hook.
export type FunilController = ReturnType<typeof usePipeline>;
export type { Stage };
