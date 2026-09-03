import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import { resolveAudienceIds, translateDbError } from '@/hooks/useCampaigns';
import type { AudienceFilter, Campaign, UazapiAudienceSource, UazapiSendSpeed } from '@/types/campaigns';
import { UAZAPI_SEND_SPEED_SECONDS } from '@/types/campaigns';

export interface UazapiChannel {
  id: string;
  label: string;
  phone: string | null;
}

// Números UAZAPI ativos da org — mesmo padrão do seletor de canais Zernio do
// CampaignWizard, mas filtrado para provider='uazapi' (disparo direto/texto
// livre, sem template aprovado).
export function useUazapiChannels(): { channels: UazapiChannel[]; loading: boolean } {
  const { userId } = useAppUser();
  const [channels, setChannels] = useState<UazapiChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('channels')
        .select('id, label, phone')
        .eq('provider', 'uazapi')
        .eq('is_active', true)
        .order('created_at');
      if (cancelled) return;
      setChannels((data ?? []) as UazapiChannel[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { channels, loading };
}

type UazapiAudienceInput =
  | { mode: 'crm'; filter: AudienceFilter }
  | { mode: 'csv'; contactIds: string[]; totalRows?: number; fileName?: string };

interface CreateUazapiBlastInput {
  name: string;
  channel_id: string;
  message_body: string;
  speed: UazapiSendSpeed;
  scheduled_at: string | null; // ISO; null = disparar imediatamente
  audience: UazapiAudienceInput;
}

interface UseUazapiBlastResult {
  campaigns: Campaign[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createAndQueue: (
    input: CreateUazapiBlastInput,
  ) => Promise<{ campaign: Campaign; queued: number } | null>;
  pause: (id: string) => Promise<void>;
  resume: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  previewAudience: (filter: AudienceFilter) => Promise<number>;
}

// Espalha os envios no tempo: linha i acontece pace_seconds*i depois do
// início, com um jitter pequeno (0-2s) pra não ficar robótico. A ordem exata
// entre linhas vizinhas não importa — o dispatcher só usa scheduled_at pra
// decidir QUANDO liberar, não a ordem de disparo em si.
function computeScheduledAt(base: Date, index: number, paceSeconds: number): string {
  const jitterMs = Math.floor(Math.random() * 2000);
  return new Date(base.getTime() + index * paceSeconds * 1000 + jitterMs).toISOString();
}

const CHUNK = 500;

export function useUazapiBlast(): UseUazapiBlastResult {
  const { userId } = useAppUser();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const supabase = getSupabase();
    const { data, error: err } = await supabase
      .from('campaigns')
      .select('*')
      .eq('kind', 'uazapi_direct')
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setCampaigns((data ?? []) as Campaign[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!userId) return;
    const supabase = getSupabase();
    const channelName = `uazapi-campaigns:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'whatsapp_hub',
          table: 'campaigns',
        },
        () => {
          void reload();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, reload]);

  const previewAudience = async (filter: AudienceFilter): Promise<number> => {
    if (!userId) return 0;
    const ids = await resolveAudienceIds(filter);
    return ids.length;
  };

  const createAndQueue: UseUazapiBlastResult['createAndQueue'] = async (input) => {
    if (!userId) return null;
    const supabase = getSupabase();

    const contactIds =
      input.audience.mode === 'crm'
        ? await resolveAudienceIds(input.audience.filter)
        : input.audience.contactIds;
    if (contactIds.length === 0) {
      throw new Error('Nenhum contato corresponde à audiência selecionada.');
    }

    const paceSeconds = UAZAPI_SEND_SPEED_SECONDS[input.speed];
    const audienceFilter: UazapiAudienceSource =
      input.audience.mode === 'crm'
        ? { mode: 'crm', filter: input.audience.filter }
        : {
            mode: 'csv',
            total: contactIds.length,
            ...(input.audience.fileName ? { file_name: input.audience.fileName } : {}),
          };

    const { data: campaign, error: err } = await supabase
      .from('campaigns')
      .insert({
        name: input.name,
        template_id: null,
        kind: 'uazapi_direct',
        channel_id: input.channel_id,
        message_body: input.message_body,
        pace_seconds: paceSeconds,
        status: input.scheduled_at ? 'scheduled' : 'sending',
        scheduled_at: input.scheduled_at,
        audience_filter: audienceFilter,
        variable_mapping: {},
        total_contacts: contactIds.length,
        started_at: input.scheduled_at ? null : new Date().toISOString(),
      })
      .select()
      .single();
    if (err || !campaign) {
      throw new Error(translateDbError(err?.message ?? 'Falha ao criar campanha'));
    }
    const created = campaign as Campaign;

    // scheduled_at por linha conta a partir de quando o envio de fato começa:
    // agora, se imediato; o horário agendado, se for pra depois.
    const base = input.scheduled_at ? new Date(input.scheduled_at) : new Date();

    for (let i = 0; i < contactIds.length; i += CHUNK) {
      const chunk = contactIds.slice(i, i + CHUNK);
      const { error: insErr } = await supabase.from('campaign_contacts').insert(
        chunk.map((contact_id, j) => ({
          campaign_id: created.id,
          contact_id,
          status: 'pending' as const,
          scheduled_at: computeScheduledAt(base, i + j, paceSeconds),
        })),
      );
      if (insErr) throw new Error(translateDbError(insErr.message));
    }

    await reload();
    return { campaign: created, queued: contactIds.length };
  };

  const pause: UseUazapiBlastResult['pause'] = async (id) => {
    const supabase = getSupabase();
    const { error: err } = await supabase.from('campaigns').update({ status: 'paused' }).eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  const resume: UseUazapiBlastResult['resume'] = async (id) => {
    const supabase = getSupabase();
    const { error: err } = await supabase.from('campaigns').update({ status: 'sending' }).eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  const remove: UseUazapiBlastResult['remove'] = async (id) => {
    const supabase = getSupabase();
    const { error: err } = await supabase.from('campaigns').delete().eq('id', id);
    if (err) {
      setError(err.message);
      throw new Error(translateDbError(err.message));
    }
    await reload();
  };

  return {
    campaigns,
    loading,
    error,
    reload,
    createAndQueue,
    pause,
    resume,
    remove,
    previewAudience,
  };
}
