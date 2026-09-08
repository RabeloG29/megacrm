import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog } from '@/components/ui/dialog';
import { useTags } from '@/hooks/useTags';
import { useContacts } from '@/hooks/useContacts';
import { normalizePhone, getCountryOptions, type CountryCode } from '@/lib/phone';
import type { ContactWithTags } from '@/types/db';

interface ContactFormDialogProps {
  open: boolean;
  onClose: () => void;
  contact?: ContactWithTags | null;
  onSaved?: () => void;
}

const COUNTRY_OPTIONS = getCountryOptions();

type CustomFieldEntry = { key: string; value: string };

function entriesFromCustomFields(cf: Record<string, unknown>): CustomFieldEntry[] {
  return Object.entries(cf).map(([key, value]) => ({
    key,
    value: value == null ? '' : String(value),
  }));
}

function customFieldsFromEntries(entries: CustomFieldEntry[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of entries) {
    const k = key.trim();
    if (k) out[k] = value;
  }
  return out;
}

export function ContactFormDialog({ open, onClose, contact, onSaved }: ContactFormDialogProps) {
  const { tags } = useTags();
  const { create, update } = useContacts();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isForeign, setIsForeign] = useState(false);
  const [country, setCountry] = useState<CountryCode | ''>('');
  const [email, setEmail] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [customFields, setCustomFields] = useState<CustomFieldEntry[]>([]);
  const [isStudent, setIsStudent] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState('');
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(contact);

  useEffect(() => {
    if (!open) return;
    setName(contact?.name ?? '');
    setPhone(contact?.phone ?? '');
    setIsForeign(false);
    setCountry('');
    setEmail(contact?.email ?? '');
    setSelectedTags(new Set((contact?.tags ?? []).map((t) => t.id)));
    setCustomFields(
      contact?.custom_fields
        ? entriesFromCustomFields(contact.custom_fields)
        : [],
    );
    setIsStudent(contact?.is_student ?? false);
    setPurchaseDate(contact?.purchase_date ?? '');
    setSubscriptionExpiresAt(contact?.subscription_expires_at ?? '');
  }, [open, contact]);

  const phonePreview = useMemo(() => {
    if (!phone.trim()) return null;
    if (isForeign && !country) {
      return { ok: false as const, error: 'Selecione o país do telefone' };
    }
    const result = normalizePhone(phone, isForeign && country ? country : undefined);
    return result.ok
      ? { ok: true as const, e164: result.e164 }
      : { ok: false as const, error: result.error };
  }, [phone, isForeign, country]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!phonePreview || !phonePreview.ok) {
      toast.error('Telefone inválido', {
        description: phonePreview && !phonePreview.ok ? phonePreview.error : undefined,
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        phone: phonePreview.e164,
        name: name.trim() || null,
        email: email.trim() || null,
        custom_fields: customFieldsFromEntries(customFields),
        tag_ids: Array.from(selectedTags),
        is_student: isStudent,
        purchase_date: isStudent && purchaseDate ? purchaseDate : null,
        subscription_expires_at: isStudent && subscriptionExpiresAt ? subscriptionExpiresAt : null,
      };
      if (isEdit && contact) {
        await update(contact.id, payload);
      } else {
        await create(payload);
      }
      toast.success(isEdit ? 'Contato atualizado.' : 'Contato criado.');
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

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar contato' : 'Novo contato'}
      widthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="contact_phone">Telefone</Label>
            <Input
              id="contact_phone"
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
            <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={isForeign}
                onChange={(e) => {
                  setIsForeign(e.target.checked);
                  if (!e.target.checked) setCountry('');
                }}
                disabled={saving}
                className="h-4 w-4 accent-[#16A34A]"
              />
              Contato estrangeiro?
            </label>
            {isForeign && (
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value as CountryCode)}
                disabled={saving}
                required
                className="h-10 w-full rounded-lg border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.06)] px-3 text-sm text-[var(--color-text-primary)]"
              >
                <option value="">País do telefone...</option>
                {COUNTRY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_name">Nome</Label>
            <Input
              id="contact_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact_email">E-mail</Label>
            <Input
              id="contact_email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          {tags.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)] opacity-70">
              Nenhuma tag criada. Use "Gerenciar tags" na página de Contatos.
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
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.05)] p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--color-text-primary)]">
            <input
              type="checkbox"
              checked={isStudent}
              onChange={(e) => setIsStudent(e.target.checked)}
              disabled={saving}
              className="h-4 w-4 accent-[#16A34A]"
            />
            Aluno?
          </label>
          {isStudent && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="contact_purchase_date">Data de compra</Label>
                <Input
                  id="contact_purchase_date"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_subscription_expires_at">Vencimento da assinatura</Label>
                <Input
                  id="contact_subscription_expires_at"
                  type="date"
                  value={subscriptionExpiresAt}
                  onChange={(e) => setSubscriptionExpiresAt(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Campos personalizados</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCustomFields((prev) => [...prev, { key: '', value: '' }])}
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </Button>
          </div>
          {customFields.length === 0 ? (
            <p className="text-xs text-[var(--color-text-secondary)] opacity-70">
              Campos extras (cidade, plano, origem…) guardados como JSONB.
            </p>
          ) : (
            <div className="space-y-2">
              {customFields.map((field, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    placeholder="chave"
                    value={field.key}
                    onChange={(e) =>
                      setCustomFields((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], key: e.target.value };
                        return next;
                      })
                    }
                    disabled={saving}
                  />
                  <Input
                    placeholder="valor"
                    value={field.value}
                    onChange={(e) =>
                      setCustomFields((prev) => {
                        const next = [...prev];
                        next[idx] = { ...next[idx], value: e.target.value };
                        return next;
                      })
                    }
                    disabled={saving}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCustomFields((prev) => prev.filter((_, i) => i !== idx))
                    }
                    aria-label="Remover campo"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
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
            ) : isEdit ? (
              <>Salvar alterações</>
            ) : (
              <>Criar contato</>
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
