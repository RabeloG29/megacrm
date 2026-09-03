import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import type { Script } from '@/types/crm';

// CRUD dos scripts (mensagens prontas) — Configurações → Scripts. Usados no
// composer do Inbox (inserir no chat) e nas automações (Follow-ups UAZAPI /
// Funil "Disparar mensagem de texto") para reaproveitar textos já escritos.

interface ScriptInput {
  title: string;
  content: string;
}

interface UseScriptsResult {
  scripts: Script[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (input: ScriptInput) => Promise<Script | null>;
  update: (id: string, patch: Partial<ScriptInput>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useScripts(): UseScriptsResult {
  const { userId } = useAppUser();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error: err } = await supabase
      .from('scripts')
      .select('id, title, content')
      .order('title', { ascending: true });
    if (err) setError(err.message);
    else setScripts((data ?? []) as Script[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create: UseScriptsResult['create'] = async (input) => {
    if (!userId) return null;
    const supabase = getSupabase();
    const payload = { title: input.title.trim(), content: input.content.trim() };
    const { data, error: err } = await supabase
      .from('scripts')
      .insert(payload)
      .select('id, title, content')
      .single();
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
    return data as Script;
  };

  const update: UseScriptsResult['update'] = async (id, patch) => {
    const supabase = getSupabase();
    const cleanPatch = {
      ...(patch.title != null ? { title: patch.title.trim() } : {}),
      ...(patch.content != null ? { content: patch.content.trim() } : {}),
    };
    const { error: err } = await supabase
      .from('scripts')
      .update(cleanPatch)
      .eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  const remove: UseScriptsResult['remove'] = async (id) => {
    const supabase = getSupabase();
    const { error: err } = await supabase.from('scripts').delete().eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  return { scripts, loading, error, reload, create, update, remove };
}

// Maps the most common Postgres/PostgREST errors to actionable pt-BR messages.
function translateDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('row-level security') || lower.includes('permission denied')) return 'Você não tem permissão para esta ação.';
  if (lower.includes('violates check constraint') || lower.includes('invalid input')) return 'Dados inválidos — revise os campos e tente novamente.';
  return message || 'Não foi possível concluir a operação.';
}
