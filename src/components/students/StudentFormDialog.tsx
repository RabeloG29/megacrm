import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { useTags } from '@/hooks/useTags';
import { useProducts } from '@/hooks/useProducts';
import { useStudents } from '@/hooks/useStudents';
import { normalizePhone } from '@/lib/phone';

interface StudentFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function StudentFormDialog({ open, onClose, onSaved }: StudentFormDialogProps) {
  const { tags } = useTags();
  const { products, create: createProduct } = useProducts();
  const { addStudent } = useStudents();

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [productId, setProductId] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone('');
    setName('');
    setEmail('');
    setProductId('');
    setSelectedTags(new Set());
  }, [open]);

  const phonePreview = phone.trim() ? normalizePhone(phone) : null;

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNewProduct = async () => {
    const name = prompt('Nome do produto/curso:');
    if (!name?.trim()) return;
    try {
      const created = await createProduct({ name: name.trim(), product_type: 'curso', quantity: null });
      if (created) setProductId(created.id);
    } catch (err) {
      toast.error('Falha ao criar produto', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!phonePreview || !phonePreview.ok) {
      toast.error('Telefone inválido', {
        description: phonePreview && !phonePreview.ok ? phonePreview.error : undefined,
      });
      return;
    }
    if (!productId) {
      toast.error('Selecione o produto/curso do aluno.');
      return;
    }
    setSaving(true);
    try {
      await addStudent({
        phone: phonePreview.e164,
        name: name.trim() || null,
        email: email.trim() || null,
        productId,
        tagIds: Array.from(selectedTags),
      });
      toast.success('Aluno adicionado.');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error('Falha ao salvar', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Novo aluno" widthClass="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-5">
        <p className="text-xs text-[var(--color-text-secondary)] opacity-70">
          Se o telefone já for de um contato existente, ele vira aluno sem duplicar o cadastro.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="student_phone">Telefone</Label>
            <Input
              id="student_phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-9999"
              required
              disabled={saving}
            />
            {phonePreview && (
              <div className={`text-xs ${phonePreview.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                {phonePreview.ok ? `E.164: ${phonePreview.e164}` : phonePreview.error}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="student_name">Nome</Label>
            <Input id="student_name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="student_email">E-mail</Label>
            <Input
              id="student_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="student_product">Produto / curso</Label>
          <div className="flex gap-2">
            <select
              id="student_product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              disabled={saving}
              required
              className="flex-1 h-10 rounded-lg border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.06)] px-3 text-sm text-[var(--color-text-primary)]"
            >
              <option value="">Selecione...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={handleNewProduct} disabled={saving}>
              + Novo
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          {tags.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)] opacity-70">
              Nenhuma tag criada ainda.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => {
                const active = selectedTags.has(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-all ${
                      active
                        ? 'bg-[rgba(22,163,74,0.12)] text-[var(--color-text-primary)] ring-2'
                        : 'bg-[rgba(22,163,74,0.06)] text-[var(--color-text-secondary)] opacity-70 hover:opacity-100'
                    }`}
                    style={active ? { boxShadow: `0 0 0 2px ${t.color}55 inset` } : undefined}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Adicionar aluno'
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
