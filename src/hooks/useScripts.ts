import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import type { Script } from '@/types/crm';

// CRUD dos scripts (mensagens prontas) — Configurações → Scripts. Usados no
// composer do Inbox (inserir no chat) e nas automações (Follow-ups UAZAPI /
// Funil "Disparar mensagem de texto") para reaproveitar textos já escritos.
// Podem ter imagem e/ou PDF anexados (ver ScriptsSettings.tsx), reenviados
// junto com o texto quando o script é usado no Inbox.

interface ScriptInput {
  title: string;
  content: string;
  image_url?: string | null;
  image_path?: string | null;
  pdf_url?: string | null;
  pdf_path?: string | null;
  video_url?: string | null;
  video_path?: string | null;
  audio_url?: string | null;
  audio_path?: string | null;
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

const SCRIPT_COLUMNS =
  'id, title, content, image_url, image_path, pdf_url, pdf_path, video_url, video_path, audio_url, audio_path';

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
      .select(SCRIPT_COLUMNS)
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
    const payload = {
      title: input.title.trim(),
      content: input.content.trim(),
      image_url: input.image_url ?? null,
      image_path: input.image_path ?? null,
      pdf_url: input.pdf_url ?? null,
      pdf_path: input.pdf_path ?? null,
      video_url: input.video_url ?? null,
      video_path: input.video_path ?? null,
      audio_url: input.audio_url ?? null,
      audio_path: input.audio_path ?? null,
    };
    const { data, error: err } = await supabase
      .from('scripts')
      .insert(payload)
      .select(SCRIPT_COLUMNS)
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
      ...(patch.image_url !== undefined ? { image_url: patch.image_url } : {}),
      ...(patch.image_path !== undefined ? { image_path: patch.image_path } : {}),
      ...(patch.pdf_url !== undefined ? { pdf_url: patch.pdf_url } : {}),
      ...(patch.pdf_path !== undefined ? { pdf_path: patch.pdf_path } : {}),
      ...(patch.video_url !== undefined ? { video_url: patch.video_url } : {}),
      ...(patch.video_path !== undefined ? { video_path: patch.video_path } : {}),
      ...(patch.audio_url !== undefined ? { audio_url: patch.audio_url } : {}),
      ...(patch.audio_path !== undefined ? { audio_path: patch.audio_path } : {}),
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
