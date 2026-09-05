import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Heart, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useQuickReplies } from '@/hooks/useQuickReplies';
import type { QuickReply } from '@/types/crm';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';

const textareaCls =
  'w-full resize-none rounded-lg border border-[rgba(59,130,246,0.2)] bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]';

// Configurações → Respostas Rápidas. Atalhos de texto simples (nome + texto)
// acessíveis pelo ícone de coração no composer do Inbox — clicou, já insere
// o texto. Diferente de Scripts: sem anexos, e qualquer membro pode cadastrar.
export function QuickRepliesSettings() {
  const { quickReplies, loading, error, reload, create, update, remove } = useQuickReplies();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      await create({ title, content });
      toast.success('Resposta rápida cadastrada.');
      setTitle('');
      setContent('');
    } catch (err) {
      toast.error('Falha ao cadastrar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (q: QuickReply) => {
    setEditingId(q.id);
    setEditTitle(q.title);
    setEditContent(q.content);
  };

  const handleUpdate = async () => {
    if (!editingId || !editTitle.trim() || !editContent.trim()) return;
    setEditSaving(true);
    try {
      await update(editingId, { title: editTitle, content: editContent });
      toast.success('Resposta rápida atualizada.');
      setEditingId(null);
    } catch (err) {
      toast.error('Falha ao atualizar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemove = async (q: QuickReply) => {
    if (!confirm(`Excluir a resposta rápida "${q.title}"?`)) return;
    try {
      await remove(q.id);
      toast.success('Resposta rápida excluída.');
    } catch (err) {
      toast.error('Falha ao excluir', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={handleCreate} className="space-y-4">
          <header className="space-y-1">
            <h2 className="text-xl font-bold text-display">Respostas rápidas</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Atalhos de texto pra usar na hora no chat do Inbox (ícone de coração).
              Cadastre um nome curto (ex.: "Preço") e o texto que deve aparecer ao clicar.
            </p>
          </header>

          <div className="space-y-2">
            <Label htmlFor="qr_title">Nome do atalho *</Label>
            <Input
              id="qr_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Preço"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="qr_content">Mensagem *</Label>
            <textarea
              id="qr_content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Texto que será inserido no chat ao clicar no atalho…"
              disabled={saving}
              className={textareaCls}
            />
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
          <div className="text-label">Respostas rápidas cadastradas</div>
          {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
          {loading ? (
            <div className="py-8 text-center text-label opacity-60">Carregando...</div>
          ) : quickReplies.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-text-secondary)] opacity-60">
              <Heart className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nenhuma resposta rápida cadastrada ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {quickReplies.map((q) =>
                editingId === q.id ? (
                  <div
                    key={q.id}
                    className="space-y-2 rounded-lg border border-[rgba(59,130,246,0.25)] bg-white/[0.03] p-3"
                  >
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={editSaving} />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      disabled={editSaving}
                      className={textareaCls}
                    />
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
                    key={q.id}
                    className="flex items-start gap-3 rounded-lg border border-[rgba(59,130,246,0.08)] bg-white/[0.02] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{q.title}</span>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-secondary)]">{q.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(q)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void handleRemove(q)} aria-label="Excluir">
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
