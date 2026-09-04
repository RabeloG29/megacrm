import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Check, Loader2, Pencil, ThumbsDown, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useLossReasons } from '@/hooks/useLossReasons';
import type { LossReason } from '@/types/crm';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';

// Configurações → Motivos de perda. Catálogo cadastrável, selecionável no
// DealDrawer ao marcar um negócio como perdido (em vez de texto livre) — e
// agrupável no relatório do dashboard ("Motivos de perda").
export function LossReasonsSettings() {
  const { reasons, loading, error, reload, create, update, remove } = useLossReasons();

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Confirmação inline (não usa window.confirm(), que trava a aba em
  // automações/CDP) — mesmo padrão já usado no fluxo de remover matrícula.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await create(name);
      toast.success('Motivo cadastrado.');
      setName('');
    } catch (err) {
      toast.error('Falha ao cadastrar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: LossReason) => {
    setEditingId(r.id);
    setEditName(r.name);
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    setEditSaving(true);
    try {
      await update(editingId, editName);
      toast.success('Motivo atualizado.');
      setEditingId(null);
    } catch (err) {
      toast.error('Falha ao atualizar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemove = async (r: LossReason) => {
    setRemovingId(r.id);
    try {
      await remove(r.id);
      toast.success('Motivo excluído.');
    } catch (err) {
      toast.error('Falha ao excluir', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRemovingId(null);
      setConfirmingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={handleCreate} className="space-y-3">
          <header className="space-y-1">
            <h2 className="text-xl font-bold text-display">Motivos de perda</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Cadastre os motivos que aparecem ao marcar um negócio como perdido no funil.
              Eles também ficam disponíveis para filtrar/agrupar no dashboard.
            </p>
          </header>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-2">
              <Label htmlFor="loss_reason_name">Nome *</Label>
              <Input
                id="loss_reason_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Achou caro"
                disabled={saving}
              />
            </div>
            <Button type="submit" disabled={saving || !name.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Cadastrar
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="space-y-3">
          <div className="text-label">Catálogo</div>
          {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
          {loading ? (
            <div className="py-8 text-center text-label opacity-60">Carregando...</div>
          ) : reasons.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-text-secondary)] opacity-60">
              <ThumbsDown className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nenhum motivo cadastrado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {reasons.map((r) =>
                editingId === r.id ? (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 rounded-lg border border-[rgba(22,163,74,0.25)] bg-[rgba(22,163,74,0.06)] p-3"
                  >
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={editSaving} className="flex-1" />
                    <Button size="sm" onClick={handleUpdate} disabled={editSaving || !editName.trim()}>
                      {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} disabled={editSaving} aria-label="Cancelar edição">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : confirmingId === r.id ? (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] p-3"
                  >
                    <span className="min-w-0 flex-1 text-sm text-[var(--color-text-primary)]">
                      Excluir "{r.name}"?
                    </span>
                    <Button
                      size="sm"
                      onClick={() => void handleRemove(r)}
                      disabled={removingId === r.id}
                      className="bg-[#EF4444] text-white hover:opacity-90"
                    >
                      {removingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Confirmar
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setConfirmingId(null)} disabled={removingId === r.id} aria-label="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 rounded-lg border border-[rgba(22,163,74,0.08)] bg-[rgba(22,163,74,0.05)] p-3"
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--color-text-primary)]">{r.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(r)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setConfirmingId(r.id)} aria-label="Excluir">
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
