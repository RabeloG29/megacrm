// ============================================================================
// br-phone — variações do "nono dígito" em números móveis brasileiros.
// ----------------------------------------------------------------------------
// Contexto: no Brasil, números de celular passaram a exigir um "9" extra
// inserido logo após o DDD (ex.: +5573 8171-4295 → +5573 9 8171-4295). A
// migração aconteceu em datas diferentes por estado, e integrações de
// WhatsApp (Baileys/whatsmeow — base da UAZAPI) às vezes montam o JID do
// contato no formato ANTIGO (8 dígitos locais, sem o 9), mesmo quando o
// número "oficial" do contato tem 9 dígitos.
//
// Sem tratar isso, a mesma pessoa vira DOIS contatos/DUAS conversas: um
// criado pelo CRM (formato com 9, via normalizePhone do frontend) e outro
// criado pelo webhook a partir do JID (formato sem o 9) — foi o que
// aconteceu com o contato "Gabriel" (duas conversas separadas no Inbox).
//
// Uso:
//   - brPhoneVariants(phone): todas as formas plausíveis de um número BR,
//     para usar em `.in('phone', variants)` na busca de contato existente.
//   - canonicalBrPhone(phone): forma canônica (sempre com o 9) para gravar
//     ao CRIAR um contato novo — mesma convenção do normalizePhone (frontend).
// ============================================================================

export function brPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55') || digits.length < 12) return [phone];
  const rest = digits.slice(2); // DDD + número local

  // 10 dígitos = DDD(2) + local(8) → formato antigo, sem o 9. Também tenta
  // com o 9 inserido.
  if (rest.length === 10) {
    const ddd = rest.slice(0, 2);
    const local = rest.slice(2);
    if (!local.startsWith('9')) {
      return [phone, `+55${ddd}9${local}`];
    }
  }

  // 11 dígitos = DDD(2) + local(9, começando com 9) → formato atual. Também
  // tenta sem o 9 (caso o contato tenha sido salvo no formato antigo).
  if (rest.length === 11) {
    const ddd = rest.slice(0, 2);
    const local = rest.slice(2);
    if (local.startsWith('9')) {
      return [phone, `+55${ddd}${local.slice(1)}`];
    }
  }

  return [phone];
}

// Forma canônica (sempre com o 9º dígito) para números BR de 8 dígitos
// locais — mesma convenção usada pelo normalizePhone do frontend
// (src/lib/phone.ts). Números que já têm 9 dígitos, ou que não são BR,
// voltam inalterados.
export function canonicalBrPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits.startsWith('55') || digits.length !== 12) return phone;
  const ddd = digits.slice(2, 4);
  const local = digits.slice(4);
  if (local.startsWith('9')) return phone;
  return `+55${ddd}9${local}`;
}
