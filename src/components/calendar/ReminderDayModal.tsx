import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCalendarReminders } from '@/hooks/useCalendarReminders';
import { useOperators, operatorLabel } from '@/hooks/useOperators';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { cn } from '@/lib/utils';
import { REMINDER_COLORS, REMINDER_COLOR_STYLES, type CalendarReminder, type ReminderColor } from '@/types/calendar';

interface ReminderDayModalProps {
  date: string | null; // 'YYYY-MM-DD', null = fechado
  dateLabel: string;
  reminders: CalendarReminder[];
  onClose: () => void;
  addReminder: ReturnType<typeof useCalendarReminders>['addReminder'];
  updateReminder: ReturnType<typeof useCalendarReminders>['updateReminder'];
  removeReminder: ReturnType<typeof useCalendarReminders>['removeReminder'];
}

// Rotação leve e determinística por id — dá o efeito "post-it colado torto"
// sem o layout tremer a cada re-render.
function noteRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((hash % 5) - 2) * 0.8; // entre -1.6deg e +1.6deg
}

export function ReminderDayModal({
  date,
  dateLabel,
  reminders,
  onClose,
  addReminder,
  updateReminder,
  removeReminder,
}: ReminderDayModalProps) {
  const { operators } = useOperators();
  const { userId } = useAppUser();
  const [content, setContent] = useState('');
  const [color, setColor] = useState<ReminderColor>('yellow');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setContent('');
    setColor('yellow');
    setEditingId(null);
  }, [date]);

  const authorLabel = useMemo(() => {
    const map = new Map(operators.map((op) => [op.user_id, operatorLabel(op)]));
    return (createdBy: string | null) => {
      if (!createdBy) return null;
      if (createdBy === userId) return 'Você';
      return map.get(createdBy) ?? null;
    };
  }, [operators, userId]);

  if (!date) return null;

  const startEdit = (r: CalendarReminder) => {
    setEditingId(r.id);
    setContent(r.content);
    setColor(r.color);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setContent('');
    setColor('yellow');
  };

  const handleSubmit = async () => {
    const text = content.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await updateReminder(editingId, { content: text, color });
        toast.success('Lembrete atualizado.');
      } else {
        await addReminder(date, text, color);
        toast.success('Lembrete adicionado.');
      }
      cancelEdit();
    } catch (err) {
      toast.error('Falha ao salvar lembrete', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await removeReminder(id);
      if (editingId === id) cancelEdit();
    } catch (err) {
      toast.error('Falha ao remover lembrete', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <Dialog open={!!date} onClose={onClose} title={dateLabel} widthClass="max-w-lg" opaque>
      <div className="space-y-4">
        {reminders.length > 0 && (
          <div className="space-y-2">
            {reminders.map((r) => {
              const style = REMINDER_COLOR_STYLES[r.color];
              const author = authorLabel(r.created_by);
              return (
                <div
                  key={r.id}
                  style={{
                    backgroundColor: style.bg,
                    borderColor: style.border,
                    transform: `rotate(${noteRotation(r.id)}deg)`,
                  }}
                  className="rounded-md border p-3 shadow-sm"
                >
                  <p className="text-sm text-[#3a3a3a] whitespace-pre-wrap break-words">{r.content}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-[#3a3a3a] opacity-60">
                      {author ?? 'Time'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        aria-label="Editar lembrete"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-[#3a3a3a] opacity-70 hover:opacity-100 hover:bg-black/5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(r.id)}
                        aria-label="Excluir lembrete"
                        className="h-6 w-6 rounded-md flex items-center justify-center text-[#3a3a3a] opacity-70 hover:opacity-100 hover:bg-black/5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2 border-t border-[rgba(22,163,74,0.1)] pt-4">
          <div className="text-label">{editingId ? 'Editar lembrete' : 'Novo lembrete'}</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva o lembrete aqui..."
            rows={3}
            disabled={submitting}
            className="w-full rounded-lg border border-[rgba(22,163,74,0.2)] bg-[rgba(22,163,74,0.05)] px-4 py-3 text-sm text-[var(--color-text-primary)] resize-y"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {REMINDER_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Cor ${c}`}
                  disabled={submitting}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform',
                    color === c ? 'scale-110 border-[var(--color-text-primary)]' : 'border-transparent',
                  )}
                  style={{ backgroundColor: REMINDER_COLOR_STYLES[c].dot }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {editingId && (
                <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={submitting}>
                  Cancelar
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => void handleSubmit()} disabled={submitting || !content.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? 'Salvar' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
