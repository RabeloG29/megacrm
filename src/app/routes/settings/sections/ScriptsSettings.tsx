import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useScripts } from '@/hooks/useScripts';
import type { Script } from '@/types/crm';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import { SCRIPT_VARIABLES } from '@/lib/scriptVariables';

const textareaCls =
  'w-full resize-none rounded-lg border border-[rgba(59,130,246,0.2)] bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]';

// Configurações → Scripts. Mensagens prontas reutilizáveis: podem ser
// inseridas no chat do Inbox ou usadas como texto de automações (Follow-ups
// UAZAPI / Funil "Disparar mensagem de texto").
export function ScriptsSettings() {
  const { scripts, loading, error, reload, create, update, remove } = useScripts();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const editContentRef = useRef<HTMLTextAreaElement | null>(null);

  // Insere {{variavel}} na posição do cursor (ou no final, se o campo não
  // estiver focado) e atualiza o estado controlado do textarea.
  const insertVariable = (
    token: string,
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    setValue: (v: string) => void,
  ) => {
    const el = ref.current;
    if (!el) {
      setValue(`${value}${token}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await create({ title, content });
      toast.success('Script cadastrado.');
      setTitle('');
      setContent('');
    } catch (err) {
      toast.error('Falha ao cadastrar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: Script) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditContent(s.content);
  };

  const handleUpdate = async () => {
    if (!editingId || !editTitle.trim() || !editContent.trim()) return;
    setEditSaving(true);
    try {
      await update(editingId, { title: editTitle, content: editContent });
      toast.success('Script atualizado.');
      setEditingId(null);
    } catch (err) {
      toast.error('Falha ao atualizar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemove = async (s: Script) => {
    if (!confirm(`Excluir o script "${s.title}"?`)) return;
    try {
      await remove(s.id);
      toast.success('Script excluído.');
    } catch (err) {
      toast.error('Falha ao excluir', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={handleCreate} className="space-y-4">
          <header className="space-y-1">
            <h2 className="text-xl font-bold text-display">Scripts</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Mensagens prontas para reaproveitar no chat do Inbox ou nas automações
              (Follow-ups e Funil).
            </p>
          </header>

          <div className="space-y-2">
            <Label htmlFor="script_title">Título *</Label>
            <Input
              id="script_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Boas-vindas"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="script_content">Mensagem *</Label>
            <textarea
              id="script_content"
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Texto do script…"
              disabled={saving}
              className={textareaCls}
            />
            <div className="flex flex-wrap gap-1.5">
              {SCRIPT_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token, contentRef, content, setContent)}
                  title={v.label}
                  className="rounded-full border border-[rgba(59,130,246,0.25)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-primary)] hover:bg-[rgba(59,130,246,0.1)]"
                >
                  {v.token}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Clique numa variável para inserir. Ela é preenchida automaticamente com o dado
              do contato quando o script é usado no Inbox.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !title.trim() || !content.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Cadastrar
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="space-y-3">
          <div className="text-label">Scripts cadastrados</div>
          {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
          {loading ? (
            <div className="py-8 text-center text-label opacity-60">Carregando...</div>
          ) : scripts.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-text-secondary)] opacity-60">
              <MessageSquareText className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nenhum script cadastrado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {scripts.map((s) =>
                editingId === s.id ? (
                  <div
                    key={s.id}
                    className="space-y-2 rounded-lg border border-[rgba(59,130,246,0.25)] bg-white/[0.03] p-3"
                  >
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={editSaving} />
                    <textarea
                      ref={editContentRef}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      disabled={editSaving}
                      className={textareaCls}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {SCRIPT_VARIABLES.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          onClick={() => insertVariable(v.token, editContentRef, editContent, setEditContent)}
                          title={v.label}
                          className="rounded-full border border-[rgba(59,130,246,0.25)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-primary)] hover:bg-[rgba(59,130,246,0.1)]"
                        >
                          {v.token}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" onClick={handleUpdate} disabled={editSaving || !editTitle.trim() || !editContent.trim()}>
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} disabled={editSaving} aria-label="Cancelar edição">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 rounded-lg border border-[rgba(59,130,246,0.08)] bg-white/[0.02] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{s.title}</span>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-secondary)]">{s.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(s)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void handleRemove(s)} aria-label="Excluir">
                        <Trash2 className="h-4 w-4 text-[var(--color-error)]" />
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
