import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import type { LossReason } from '@/types/crm';

// CRUD do catálogo de motivos de perda (Configurações → Motivos de perda).
// Selecionável no DealDrawer ao marcar um negócio como perdido.

interface UseLossReasonsResult {
  reasons: LossReason[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (name: string) => Promise<LossReason | null>;
  update: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useLossReasons(): UseLossReasonsResult {
  const { userId } = useAppUser();
  const [reasons, setReasons] = useState<LossReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error: err } = await supabase
      .from('loss_reasons')
      .select('id, name')
      .order('name', { ascending: true });
    if (err) setError(err.message);
    else setReasons((data ?? []) as LossReason[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create: UseLossReasonsResult['create'] = async (name) => {
    if (!userId) return null;
    const supabase = getSupabase();
    const { data, error: err } = await supabase
      .from('loss_reasons')
      .insert({ name: name.trim() })
      .select('id, name')
      .single();
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
    return data as LossReason;
  };

  const update: UseLossReasonsResult['update'] = async (id, name) => {
    const supabase = getSupabase();
    const { error: err } = await supabase
      .from('loss_reasons')
      .update({ name: name.trim() })
      .eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  const remove: UseLossReasonsResult['remove'] = async (id) => {
    const supabase = getSupabase();
    const { error: err } = await supabase.from('loss_reasons').delete().eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  return { reasons, loading, error, reload, create, update, remove };
}

// Maps the most common Postgres/PostgREST errors to actionable pt-BR messages.
function translateDbError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('duplicate key')) return 'Já existe um motivo com esse nome.';
  if (lower.includes('row-level security') || lower.includes('permission denied')) return 'Você não tem permissão para esta ação.';
  if (lower.includes('violates check constraint') || lower.includes('invalid input')) return 'Dados inválidos — revise os campos e tente novamente.';
  return message || 'Não foi possível concluir a operação.';
}
