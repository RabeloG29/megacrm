import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import type { CalendarReminder, ReminderColor } from '@/types/calendar';

// Formata uma Date local como 'YYYY-MM-DD' sem passar por UTC (toISOString
// desloca o dia perto da virada de fuso) — é essa string que casa com a
// coluna `date` no Postgres.
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface UseCalendarRemindersResult {
  reminders: CalendarReminder[];
  loading: boolean;
  error: string | null;
  addReminder: (date: string, content: string, color: ReminderColor) => Promise<void>;
  updateReminder: (id: string, patch: { content?: string; color?: ReminderColor }) => Promise<void>;
  removeReminder: (id: string) => Promise<void>;
}

// Carrega os lembretes cuja data cai dentro do intervalo visível da grade do
// mês (rangeStart/rangeEnd, em 'YYYY-MM-DD') e mantém em tempo real —
// qualquer membro do time pode ter adicionado um post-it.
export function useCalendarReminders(rangeStart: string, rangeEnd: string): UseCalendarRemindersResult {
  const { userId } = useAppUser();
  const [reminders, setReminders] = useState<CalendarReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await getSupabase()
      .from('calendar_reminders')
      .select('*')
      .gte('reminder_date', rangeStart)
      .lte('reminder_date', rangeEnd)
      .order('created_at');
    if (err) setError(err.message);
    else setReminders((data ?? []) as CalendarReminder[]);
    setLoading(false);
  }, [userId, rangeStart, rangeEnd]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const channelName = `calendar-reminders:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'whatsapp_hub', table: 'calendar_reminders' },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, reload]);

  const addReminder: UseCalendarRemindersResult['addReminder'] = async (date, content, color) => {
    const { error: err } = await getSupabase()
      .from('calendar_reminders')
      .insert({ reminder_date: date, content, color, created_by: userId });
    if (err) throw new Error(err.message);
    await reload();
  };

  const updateReminder: UseCalendarRemindersResult['updateReminder'] = async (id, patch) => {
    const { error: err } = await getSupabase().from('calendar_reminders').update(patch).eq('id', id);
    if (err) throw new Error(err.message);
    await reload();
  };

  const removeReminder: UseCalendarRemindersResult['removeReminder'] = async (id) => {
    const { error: err } = await getSupabase().from('calendar_reminders').delete().eq('id', id);
    if (err) throw new Error(err.message);
    await reload();
  };

  return { reminders, loading, error, addReminder, updateReminder, removeReminder };
}
