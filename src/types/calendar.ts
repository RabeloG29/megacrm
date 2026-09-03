// Lembretes tipo "post-it" presos numa data do calendário — quadro
// compartilhado da organização (whatsapp_hub.calendar_reminders).

export const REMINDER_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type ReminderColor = (typeof REMINDER_COLORS)[number];

export const REMINDER_COLOR_STYLES: Record<ReminderColor, { bg: string; border: string; dot: string }> = {
  yellow: { bg: '#FEF9C3', border: '#FDE047', dot: '#EAB308' },
  green: { bg: '#DCFCE7', border: '#86EFAC', dot: 'var(--accent-primary)' },
  blue: { bg: '#DBEAFE', border: '#93C5FD', dot: '#3B82F6' },
  pink: { bg: '#FCE7F3', border: '#F9A8D4', dot: '#EC4899' },
};

export interface CalendarReminder {
  id: string;
  org_id: string;
  reminder_date: string; // 'YYYY-MM-DD'
  content: string;
  color: ReminderColor;
  created_by: string | null;
  created_at: string;
}
