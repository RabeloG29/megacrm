import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, Loader2, Zap, Gauge, Rabbit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { useTags } from '@/hooks/useTags';
import { useScripts } from '@/hooks/useScripts';
import { useUazapiBlast, useUazapiChannels } from '@/hooks/useUazapiBlast';
import { CsvAudiencePicker } from '@/components/campaigns/CsvAudiencePicker';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { UAZAPI_SEND_SPEED_SECONDS, type AudienceFilter, type UazapiSendSpeed } from '@/types/campaigns';
import type { Pipeline, Stage } from '@/types/crm';

interface UazapiBlastWizardProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

type AudienceMode = 'all' | 'tags' | 'custom' | 'funnel';
type AudienceSourceMode = 'crm' | 'csv';

const STEPS = ['Mensagem', 'Audiência', 'Velocidade'] as const;

const SPEED_OPTIONS: Array<{
  value: UazapiSendSpeed;
  label: string;
  hint: string;
  icon: typeof Gauge;
  recommended?: boolean;
}> = [
  {
    value: 'lento',
    label: 'Lento',
    hint: `${UAZAPI_SEND_SPEED_SECONDS.lento}s entre mensagens — menor risco de bloqueio`,
    icon: Gauge,
    recommended: true,
  },
  {
    value: 'moderado',
    label: 'Moderado',
    hint: `${UAZAPI_SEND_SPEED_SECONDS.moderado}s entre mensagens`,
    icon: Zap,
  },
  {
    value: 'rapido',
    label: 'Rápido',
    hint: `${UAZAPI_SEND_SPEED_SECONDS.rapido}s entre mensagens — mais risco de bloqueio`,
    icon: Rabbit,
  },
];

// Mesmo conjunto de variáveis built-in dos Scripts (Configurações → Scripts,
// scriptVariables.ts) — os textos são pensados pra ir e voltar entre os dois
// lugares sem precisar reescrever token nenhum.
const VAR_BUILTINS: Array<{ token: string; label: string }> = [
  { token: 'nome', label: 'Nome' },
  { token: 'primeiro_nome', label: 'Primeiro nome' },
  { token: 'telefone', label: 'Telefone' },
  { token: 'email', label: 'E-mail' },
];

export function UazapiBlastWizard({ open, onClose, onSaved }: UazapiBlastWizardProps) {
  const { tags } = useTags();
  const { scripts } = useScripts();
  const { channels } = useUazapiChannels();
  const { createAndQueue, previewAudience } = useUazapiBlast();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [customVarKey, setCustomVarKey] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selectedScript = useMemo(() => scripts.find((s) => s.id === scriptId) ?? null, [scripts, scriptId]);
  const selectedScriptHasAttachment = !!(selectedScript?.image_url || selectedScript?.pdf_url);

  const [audienceSource, setAudienceSource] = useState<AudienceSourceMode>('crm');
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('all');
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [funnelPipelineId, setFunnelPipelineId] = useState('');
  const [selectedStageIds, setSelectedStageIds] = useState<Set<string>>(new Set());
  const [crmAudienceCount, setCrmAudienceCount] = useState<number | null>(null);
  const [csvResult, setCsvResult] = useState<{ contactIds: string[]; totalRows: number; fileName: string } | null>(null);

  const [speed, setSpeed] = useState<UazapiSendSpeed>('lento');
  const [scheduleNow, setScheduleNow] = useState(true);
  const [scheduleAt, setScheduleAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setName('');
    setScriptId('');
    setMessageBody('');
    setCustomVarKey('');
    setAudienceSource('crm');
    setAudienceMode('all');
    setSelectedTagIds(new Set());
    setCustomFieldKey('');
    setCustomFieldValue('');
    setFunnelPipelineId('');
    setSelectedStageIds(new Set());
    setStages([]);
    setCrmAudienceCount(null);
    setCsvResult(null);
    setSpeed('lento');
    setScheduleNow(true);
    setScheduleAt('');
  }, [open]);

  useEffect(() => {
    setChannelId((prev) => prev || (channels[0]?.id ?? ''));
  }, [channels]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const { data } = await getSupabase().from('pipelines').select('*').eq('kind', 'comercial').order('position');
      if (!cancelled) setPipelines((data ?? []) as Pipeline[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!funnelPipelineId) {
      setStages([]);
      setSelectedStageIds(new Set());
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await getSupabase().from('stages').select('*').eq('pipeline_id', funnelPipelineId).order('position');
      if (!cancelled) setStages((data ?? []) as Stage[]);
    })();
    setSelectedStageIds(new Set());
    return () => {
      cancelled = true;
    };
  }, [funnelPipelineId]);

  const currentFilter: AudienceFilter = useMemo(() => {
    if (audienceMode === 'all') return { all: true };
    if (audienceMode === 'tags') return { tag_ids: Array.from(selectedTagIds) };
    if (audienceMode === 'custom' && customFieldKey.trim() && customFieldValue.trim()) {
      return { custom_fields: { [customFieldKey.trim()]: customFieldValue.trim() } };
    }
    if (audienceMode === 'funnel' && funnelPipelineId) {
      return selectedStageIds.size > 0
        ? { pipeline_id: funnelPipelineId, stage_ids: Array.from(selectedStageIds) }
        : { pipeline_id: funnelPipelineId };
    }
    return {};
  }, [audienceMode, selectedTagIds, customFieldKey, customFieldValue, funnelPipelineId, selectedStageIds]);

  useEffect(() => {
    if (step !== 1 || audienceSource !== 'crm') return;
    const t = setTimeout(() => {
      void previewAudience(currentFilter)
        .then(setCrmAudienceCount)
        .catch((err) => {
          toast.error('Falha ao calcular audiência', {
            description: err instanceof Error ? err.message : String(err),
          });
        });
    }, 250);
    return () => clearTimeout(t);
  }, [step, audienceSource, currentFilter, previewAudience]);

  const audienceCount = audienceSource === 'crm' ? crmAudienceCount ?? 0 : csvResult?.contactIds.length ?? 0;

  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessageBody((cur) => `${cur}{{${token}}}`);
      return;
    }
    const start = ta.selectionStart ?? messageBody.length;
    const end = ta.selectionEnd ?? messageBody.length;
    const next = `${messageBody.slice(0, start)}{{${token}}}${messageBody.slice(end)}`;
    setMessageBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + token.length + 4;
      ta.setSelectionRange(pos, pos);
    });
  };

  const scheduleInPast = !scheduleNow && !!scheduleAt && new Date(scheduleAt).getTime() <= Date.now();

  const canNext =
    (step === 0 && name.trim() && channelId && messageBody.trim()) ||
    (step === 1 && audienceCount > 0);

  const nextStep = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const prevStep = () => setStep((s) => Math.max(0, s - 1));

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const result = await createAndQueue({
        name: name.trim(),
        channel_id: channelId,
        message_body: messageBody.trim(),
        speed,
        scheduled_at: scheduleNow ? null : new Date(scheduleAt).toISOString(),
        audience:
          audienceSource === 'crm'
            ? { mode: 'crm', filter: currentFilter }
            : { mode: 'csv', contactIds: csvResult?.contactIds ?? [], fileName: csvResult?.fileName },
      });
      if (result) {
        toast.success(`Disparo criado com ${result.queued} destinatário${result.queued === 1 ? '' : 's'}.`);
        onSaved?.();
        onClose();
      }
    } catch (err) {
      toast.error('Falha ao criar disparo', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Novo disparo direto (UAZAPI)" widthClass="max-w-3xl" opaque>
      <ol className="grid grid-cols-3 gap-2 mb-6">
        {STEPS.map((label, idx) => {
          const state = idx < step ? 'done' : idx === step ? 'current' : 'pending';
          return (
            <li
              key={label}
              className={cn(
                'flex items-center gap-2 rounded-lg p-2 border text-xs font-semibold uppercase tracking-wide',
                state === 'current' && 'border-[var(--accent-primary)] bg-[rgba(22,163,74,0.08)] text-[var(--color-text-primary)]',
                state === 'done' && 'border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.04)] text-[var(--color-text-secondary)]',
                state === 'pending' && 'border-[rgba(22,163,74,0.12)] text-[var(--color-text-secondary)] opacity-60',
              )}
            >
              <span
                className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[10px]',
                  state === 'current' && 'bg-[var(--accent-primary)] text-white',
                  state === 'done' && 'bg-[var(--color-success)] text-white',
                  state === 'pending' && 'bg-[rgba(22,163,74,0.06)]',
                )}
              >
                {state === 'done' ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <span className="truncate">{label}</span>
            </li>
          );
        })}
      </ol>

      {/* Step 1 — Mensagem */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="b_name">Nome do disparo</Label>
            <Input
              id="b_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: reengajamento-leads-frios"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="b_channel">Número de disparo (UAZAPI)</Label>
            {channels.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)] opacity-80">
                Nenhum número UAZAPI ativo. Configure um em Configurações → Canais.
              </p>
            ) : (
              <select
                id="b_channel"
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
                disabled={submitting}
                className="h-11 w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-4 text-sm text-[var(--color-text-primary)]"
              >
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.label}
                    {ch.phone ? ` · ${ch.phone}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="b_script">Mensagem</Label>
            {scripts.length === 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)] opacity-80">
                Nenhum script cadastrado ainda em Configurações → Scripts. Você pode escrever a mensagem direto no
                campo abaixo, ou cadastrar scripts pra reaproveitar aqui depois.
              </p>
            ) : (
              <select
                id="b_script"
                value={scriptId}
                onChange={(e) => {
                  const id = e.target.value;
                  setScriptId(id);
                  const script = scripts.find((s) => s.id === id);
                  if (script) setMessageBody(script.content);
                }}
                disabled={submitting}
                className="h-11 w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-4 text-sm text-[var(--color-text-primary)]"
              >
                <option value="">— escrever agora (não usar script) —</option>
                {scripts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            )}
            {selectedScriptHasAttachment && (
              <p className="text-[11px] text-[#FBBF24]">
                Esse script tem imagem/PDF anexado — o disparo direto por enquanto manda só o texto, o anexo não vai junto.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <textarea
              id="b_message"
              ref={textareaRef}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Oi {{primeiro_nome}}, tudo bem? ..."
              disabled={submitting}
              rows={6}
              className="w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-4 py-3 text-sm text-[var(--color-text-primary)] resize-y"
            />
            <p className="text-[11px] text-[var(--color-text-secondary)] opacity-70">
              Carregou de um script? Pode editar à vontade aqui — não altera o script salvo em Configurações.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {VAR_BUILTINS.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertToken(v.token)}
                  disabled={submitting}
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-mono bg-[rgba(22,163,74,0.08)] text-[var(--color-text-primary)] hover:bg-[rgba(22,163,74,0.14)]"
                >
                  {`{{${v.token}}}`}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  value={customVarKey}
                  onChange={(e) => setCustomVarKey(e.target.value)}
                  placeholder="variável (ex: cidade)"
                  disabled={submitting}
                  className="h-7 w-36 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={submitting || !customVarKey.trim()}
                  onClick={() => {
                    insertToken(customVarKey.trim());
                    setCustomVarKey('');
                  }}
                >
                  + inserir
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)] opacity-80">
              Variáveis fora dos built-ins acima são lidas dos campos personalizados do contato — use o mesmo nome
              mapeado na importação do CSV ou nos campos personalizados do CRM. Sem valor, {'{{nome}}'} e{' '}
              {'{{primeiro_nome}}'} caem em "Cliente"; as demais falham o envio daquele contato.
            </p>
          </div>
        </div>
      )}

      {/* Step 2 — Audiência */}
      {step === 1 && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAudienceSource('crm')}
              className={cn(
                'p-3 rounded-lg border text-left text-sm font-medium',
                audienceSource === 'crm'
                  ? 'border-[var(--accent-primary)] bg-[rgba(22,163,74,0.08)]'
                  : 'border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)]',
              )}
            >
              Leads do CRM (tags/funil)
            </button>
            <button
              type="button"
              onClick={() => setAudienceSource('csv')}
              className={cn(
                'p-3 rounded-lg border text-left text-sm font-medium',
                audienceSource === 'csv'
                  ? 'border-[var(--accent-primary)] bg-[rgba(22,163,74,0.08)]'
                  : 'border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)]',
              )}
            >
              Importar planilha (CSV/XLSX)
            </button>
          </div>

          {audienceSource === 'crm' && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(['all', 'tags', 'custom', 'funnel'] as AudienceMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAudienceMode(mode)}
                    className={cn(
                      'p-3 rounded-lg border text-left text-sm font-medium transition-all',
                      audienceMode === mode
                        ? 'border-[var(--accent-primary)] bg-[rgba(22,163,74,0.08)] text-[var(--color-text-primary)]'
                        : 'border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)] text-[var(--color-text-secondary)]',
                    )}
                  >
                    {mode === 'all' && 'Todos os contatos'}
                    {mode === 'tags' && 'Por tags'}
                    {mode === 'custom' && 'Por campo custom'}
                    {mode === 'funnel' && 'Por funil/etapa'}
                  </button>
                ))}
              </div>

              {audienceMode === 'tags' && (
                <div className="space-y-2">
                  <Label>Tags (OR entre elas)</Label>
                  <div className="flex flex-wrap gap-2">
                    {tags.map((t) => {
                      const active = selectedTagIds.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setSelectedTagIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            })
                          }
                          className={cn(
                            'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs',
                            active
                              ? 'bg-[rgba(22,163,74,0.12)] text-[var(--color-text-primary)]'
                              : 'bg-[rgba(22,163,74,0.06)] text-[var(--color-text-secondary)]',
                          )}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {audienceMode === 'custom' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="bcf_key">Chave do campo</Label>
                    <Input id="bcf_key" value={customFieldKey} onChange={(e) => setCustomFieldKey(e.target.value)} placeholder="cidade" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bcf_val">Valor exato</Label>
                    <Input id="bcf_val" value={customFieldValue} onChange={(e) => setCustomFieldValue(e.target.value)} placeholder="São Paulo" />
                  </div>
                </div>
              )}

              {audienceMode === 'funnel' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="b_funnel">Funil</Label>
                    {pipelines.length === 0 ? (
                      <p className="text-sm text-[var(--color-text-secondary)] opacity-80">Nenhum funil comercial encontrado.</p>
                    ) : (
                      <select
                        id="b_funnel"
                        value={funnelPipelineId}
                        onChange={(e) => setFunnelPipelineId(e.target.value)}
                        className="h-11 w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.06)] px-4 text-sm text-[var(--color-text-primary)]"
                      >
                        <option value="">— selecione um funil —</option>
                        {pipelines.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {funnelPipelineId && (
                    <div className="space-y-2">
                      <Label>Etapas (deixe vazio p/ o funil inteiro)</Label>
                      <div className="flex flex-wrap gap-2">
                        {stages.map((s) => {
                          const active = selectedStageIds.has(s.id);
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() =>
                                setSelectedStageIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(s.id)) next.delete(s.id);
                                  else next.add(s.id);
                                  return next;
                                })
                              }
                              className={cn(
                                'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs',
                                active
                                  ? 'bg-[rgba(22,163,74,0.12)] text-[var(--color-text-primary)]'
                                  : 'bg-[rgba(22,163,74,0.06)] text-[var(--color-text-secondary)]',
                              )}
                            >
                              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color ?? 'var(--accent-primary)' }} />
                              {s.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-[rgba(22,163,74,0.15)] bg-[rgba(22,163,74,0.04)] p-4 text-center">
                <div className="text-label">Contatos alcançados</div>
                <div className="text-stat mt-1">{crmAudienceCount ?? '…'}</div>
              </div>
            </>
          )}

          {audienceSource === 'csv' && (
            <CsvAudiencePicker disabled={submitting} onResolved={setCsvResult} />
          )}

          {audienceCount === 0 && (
            <p className="text-xs text-[var(--color-text-secondary)] text-center">
              Nenhum contato na audiência ainda — o disparo não pode avançar.
            </p>
          )}
        </div>
      )}

      {/* Step 3 — Velocidade + Agendamento + Revisão */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <Label>Velocidade de envio</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SPEED_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = speed === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSpeed(opt.value)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      active
                        ? 'border-[var(--accent-primary)] bg-[rgba(22,163,74,0.08)]'
                        : 'border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)]',
                    )}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-text-primary)]">
                      <Icon className="h-4 w-4 text-[var(--accent-primary)]" />
                      {opt.label}
                      {opt.recommended && (
                        <span className="text-[9px] uppercase font-bold tracking-wide text-[var(--accent-primary)]">Recomendado</span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--color-text-secondary)]">{opt.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScheduleNow(true)}
              className={cn(
                'p-3 rounded-lg border text-left text-sm font-medium',
                scheduleNow ? 'border-[var(--accent-primary)] bg-[rgba(22,163,74,0.08)]' : 'border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)]',
              )}
            >
              Disparar imediatamente
            </button>
            <button
              type="button"
              onClick={() => setScheduleNow(false)}
              className={cn(
                'p-3 rounded-lg border text-left text-sm font-medium',
                !scheduleNow ? 'border-[var(--accent-primary)] bg-[rgba(22,163,74,0.08)]' : 'border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)]',
              )}
            >
              Agendar para depois
            </button>
          </div>
          {!scheduleNow && (
            <div className="space-y-2">
              <Label htmlFor="b_when">Data e hora</Label>
              <Input id="b_when" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
              {scheduleAt && scheduleInPast && (
                <p className="text-xs text-[#EF4444]">A data escolhida já passou — escolha um horário futuro.</p>
              )}
            </div>
          )}

          <div className="rounded-lg border border-[rgba(22,163,74,0.1)] bg-[rgba(22,163,74,0.05)] p-4 space-y-2 text-sm">
            <div className="text-label mb-1">Revisão</div>
            <div><span className="text-[var(--color-text-secondary)]">Disparo:</span> <span className="font-mono">{name}</span></div>
            <div><span className="text-[var(--color-text-secondary)]">Destinatários:</span> {audienceCount}</div>
            <div>
              <span className="text-[var(--color-text-secondary)]">Velocidade:</span> {SPEED_OPTIONS.find((s) => s.value === speed)?.label} (
              {UAZAPI_SEND_SPEED_SECONDS[speed]}s entre mensagens)
            </div>
            <div><span className="text-[var(--color-text-secondary)]">Quando:</span> {scheduleNow ? 'Imediato' : scheduleAt || '—'}</div>
            {audienceCount > 0 && (
              <div className="text-[var(--color-text-secondary)] text-xs opacity-80">
                Tempo estimado de envio: ~{Math.ceil((audienceCount * UAZAPI_SEND_SPEED_SECONDS[speed]) / 60)} min
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-6 mt-4 border-t border-[rgba(22,163,74,0.08)]">
        <Button variant="ghost" onClick={prevStep} disabled={step === 0 || submitting}>
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={nextStep} disabled={!canNext || submitting}>
            Próximo
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleCreate} disabled={submitting || (!scheduleNow && (!scheduleAt || scheduleInPast))}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>Criar disparo</>
            )}
          </Button>
        )}
      </div>
    </Dialog>
  );
}
