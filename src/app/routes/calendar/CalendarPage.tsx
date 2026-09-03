import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCalendarReminders, toDateKey } from '@/hooks/useCalendarReminders';
import { ReminderDayModal } from '@/components/calendar/ReminderDayModal';
import { REMINDER_COLOR_STYLES } from '@/types/calendar';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MAX_PREVIEW_PER_DAY = 3;

// Grade de semanas completas cobrindo o mês (year/month 0-based) — do domingo
// anterior (ou igual) ao dia 1, até o sábado seguinte (ou igual) ao último dia.
function getMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: totalCells }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const grid = useMemo(() => getMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const rangeStart = toDateKey(grid[0]);
  const rangeEnd = toDateKey(grid[grid.length - 1]);
  const { reminders, addReminder, updateReminder, removeReminder } = useCalendarReminders(rangeStart, rangeEnd);

  const remindersByDate = useMemo(() => {
    const map = new Map<string, typeof reminders>();
    for (const r of reminders) {
      const list = map.get(r.reminder_date) ?? [];
      list.push(r);
      map.set(r.reminder_date, list);
    }
    return map;
  }, [reminders]);

  const todayKey = toDateKey(new Date());
  const monthLabel = cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const goToMonth = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const goToToday = () => {
    const now = new Date();
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const selectedReminders = selectedDate ? remindersByDate.get(selectedDate) ?? [] : [];
  const selectedLabel = selectedDate
    ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      })
    : '';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
          <CalendarDays className="h-5 w-5 text-[var(--accent-primary)]" />
        </div>
        <div>
          <div className="text-label">Seção</div>
          <h1 className="text-2xl font-bold text-display">Calendário</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Clique numa data pra deixar um lembrete pro time — tipo um post-it
          </p>
        </div>
      </div>

      <div className="glass-card p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-display capitalize">{monthLabel}</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={goToToday}>
              Hoje
            </Button>
            <Button variant="secondary" size="icon" onClick={() => goToMonth(-1)} aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" onClick={() => goToMonth(1)} aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="text-label text-center py-1">
              {w}
            </div>
          ))}
          {grid.map((d) => {
            const key = toDateKey(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = key === todayKey;
            const dayReminders = remindersByDate.get(key) ?? [];
            const overflow = dayReminders.length - MAX_PREVIEW_PER_DAY;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className={cn(
                  'min-h-[86px] sm:min-h-[104px] rounded-lg border p-1.5 sm:p-2 text-left align-top transition-colors',
                  inMonth
                    ? 'border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.03)] hover:bg-[rgba(22,163,74,0.08)]'
                    : 'border-transparent bg-transparent opacity-35 hover:opacity-60',
                )}
              >
                <div
                  className={cn(
                    'text-xs font-semibold h-5 w-5 rounded-full flex items-center justify-center',
                    isToday ? 'bg-[var(--accent-primary)] text-white' : 'text-[var(--color-text-secondary)]',
                  )}
                >
                  {d.getDate()}
                </div>
                <div className="mt-1 space-y-1">
                  {dayReminders.slice(0, MAX_PREVIEW_PER_DAY).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate"
                      style={{ backgroundColor: REMINDER_COLOR_STYLES[r.color].bg }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: REMINDER_COLOR_STYLES[r.color].dot }}
                      />
                      <span className="truncate text-[#3a3a3a]">{r.content}</span>
                    </div>
                  ))}
                  {overflow > 0 && (
                    <div className="text-[10px] text-[var(--color-text-secondary)] opacity-70 px-1">
                      +{overflow} mais
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <ReminderDayModal
        date={selectedDate}
        dateLabel={selectedLabel}
        reminders={selectedReminders}
        onClose={() => setSelectedDate(null)}
        addReminder={addReminder}
        updateReminder={updateReminder}
        removeReminder={removeReminder}
      />
    </div>
  );
}
