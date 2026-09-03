// Variáveis suportadas nos Scripts (Configurações → Scripts) — substituídas
// automaticamente pelos dados do contato quando o script é inserido no chat
// do Inbox. Adicionar uma nova variável aqui e no array SCRIPT_VARIABLES.
export interface ScriptContact {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
}

export interface ScriptVariableDef {
    token: string;
    label: string;
}

export const SCRIPT_VARIABLES: ScriptVariableDef[] = [
  { token: '{{nome}}', label: 'Nome completo do contato' },
  { token: '{{primeiro_nome}}', label: 'Primeiro nome do contato' },
  { token: '{{telefone}}', label: 'Telefone do contato' },
  { token: '{{email}}', label: 'E-mail do contato' },
  ];

function firstName(name: string | null | undefined): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return '';
    return trimmed.split(/\s+/)[0];
}

// Troca {{variavel}} pelos dados reais do contato. Variável sem dado no
// contato vira string vazia; variável desconhecida (erro de digitação) fica
// como está, sem quebrar o texto.
export function renderScriptContent(template: string, contact?: ScriptContact | null): string {
    const values: Record<string, string> = {
          nome: contact?.name?.trim() || '',
          primeiro_nome: firstName(contact?.name),
          telefone: contact?.phone?.trim() || '',
          email: contact?.email?.trim() || '',
    };
    return template.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, key: string) => {
          const norm = key.toLowerCase();
          return norm in values ? values[norm] : match;
    });
}
