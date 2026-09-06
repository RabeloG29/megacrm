import { getSupabase } from '@/lib/supabase';

// Garante que o contato tenha uma linha em `conversations` antes de abrir o
// Inbox. Leads que nunca trocaram mensagem (importados via CSV/XLSX,
// cadastrados manualmente em Contatos) ainda não têm conversa — e o
// deep-link ?contact=<id> do InboxPage só SELECIONA uma conversa já
// existente, nunca cria (por isso "Abrir conversa" parecia não reconhecer
// o contato). Mesma lógica do "criar conversa na hora" usada no card do
// funil (FunilPage.tsx::startConversation) — replicada aqui em vez de
// compartilhada para não mexer nesse fluxo que já funciona.
export async function ensureConversation(contactId: string, userId: string | null): Promise<string | null> {
  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', contactId)
    .maybeSingle();
  if (existing) return (existing as { id: string }).id;

  // Prioriza um número UAZAPI (sem trava de janela de 24h) sobre a API
  // oficial da Meta — permite mandar a 1ª mensagem na hora, mesmo sem
  // nenhum inbound ainda.
  const { data: activeChannels } = await supabase
    .from('channels')
    .select('id, provider')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  const channels = (activeChannels ?? []) as Array<{ id: string; provider: string }>;
  const channel = channels.find((c) => c.provider === 'uazapi') ?? channels[0] ?? null;

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      contact_id: contactId,
      status: 'human_active',
      ai_paused: true,
      assigned_to: userId,
      channel_id: channel?.id ?? null,
      ...(channel?.provider ? { provider: channel.provider } : {}),
    })
    .select('id')
    .single();

  if (error) {
    // Corrida: já existe conversa pra esse contato (ex.: chegou um inbound
    // entre o select e o insert acima) — busca a existente em vez de falhar.
    if (error.message.toLowerCase().includes('duplicate key')) {
      const { data: race } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .maybeSingle();
      return (race as { id: string } | null)?.id ?? null;
    }
    return null;
  }

  return (data as { id: string } | null)?.id ?? null;
}
