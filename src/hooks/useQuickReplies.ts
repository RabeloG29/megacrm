import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import type { QuickReply } from '@/types/crm';

// CRUD das respostas rápidas (atalhos de texto) — cadastradas e usadas
// direto no ícone de coração do composer do Inbox. Diferente de Scripts:
// sem anexos, e qualquer membro da org pode criar/editar (não é admin-only).

interface QuickReplyInput {
  title: string;
  content: string;
}

interface UseQuickRepliesResult {
  quickReplies: QuickReply[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: QuickReplyInput) => Promise<QuickReply | null>;
  update: (id: string, patch: Partial<QuickReplyInput>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const QUICK_REPLY_COLUMNS = 'id, title, content';

export function useQuickReplies(): UseQuickRepliesResult {
  const { userId } = useAppUser();
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error: err } = await supabase
      .from('quick_replies')
      .select(QUICK_REPLY_COLUMNS)
      .order('title', { ascending: true });
    if (err) setError(err.message);
    else setQuickReplies((data ?? []) as QuickReply[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create: UseQuickRepliesResult['create'] = async (input) => {
    if (!userId) return null;
    const supabase = getSupabase();
    const payload = {
      title: input.title.trim(),
      content: input.content.trim(),
    };
    const { data, error: err } = await supabase
      .from('quick_replies')
      .insert(payload)
      .select(QUICK_REPLY_COLUMNS)
      .single();
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
    return data as QuickReply;
  };

  const update: UseQuickRepliesResult['update'] = async (id, patch) => {
    const supabase = getSupabase();
    const cleanPatch = {
      ...(patch.title != null ? { title: patch.title.trim() } : {}),
      ...(patch.content != null ? { content: patch.content.trim() } : {}),
    };
    const { error: err } = await supabase
      .from('quick_replies')
      .update(cleanPatch)
      .eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  const remove: UseQuickRepliesResult['remove'] = async (id) => {
    const supabase = getSupabase();
    const { error: err } = await supabase.from('quick_replies').delete().eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  return { quickReplies, loading, error, reload, create, update, remove };
}

// Maps the most common Postgres/PostgREST errors to actionable pt-BR messages.
function translateDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('row-level security') || lower.includes('permission denied')) return 'Você não tem permissão para esta ação.';
  if (lower.includes('violates check constraint') || lower.includes('invalid input')) return 'Dados inválidos — revise os campos e tente novamente.';
  return message || 'Não foi possível concluir a operação.';
}
