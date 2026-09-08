import { parsePhoneNumberFromString, getCountries, type CountryCode } from 'libphonenumber-js';

export type { CountryCode };

// Normalize a raw phone input to E.164 (+55…). Used by contact CRUD and the
// CSV importer to reject or repair input consistently across the app.
//
// Defaults country code to BR — para aluno/contato estrangeiro, os formulários
// deixam escolher o país e passam ele aqui (ver getCountryOptions abaixo).
export function normalizePhone(
  raw: string,
  defaultCountry: CountryCode = 'BR',
): { ok: true; e164: string } | { ok: false; error: string } {
  if (!raw) return { ok: false, error: 'Telefone vazio' };
  const cleaned = raw.trim();
  try {
    const parsed = parsePhoneNumberFromString(cleaned, defaultCountry);
    if (!parsed || !parsed.isValid()) {
      return { ok: false, error: 'Número inválido' };
    }
    return { ok: true, e164: parsed.format('E.164') };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao validar',
    };
  }
}

export interface CountryOption {
  code: CountryCode;
  label: string;
}

let cachedCountryOptions: CountryOption[] | null = null;

// Lista de países pro seletor "estrangeiro?" nos formulários de aluno/contato.
// Usa os nomes em português já embutidos no navegador (Intl.DisplayNames) em
// vez de manter uma tradução manual — cobre qualquer país que libphonenumber-js
// souber validar (Reino Unido, Portugal, etc.), sem precisar mexer aqui de novo
// quando aparecer aluno de mais um país.
export function getCountryOptions(): CountryOption[] {
  if (cachedCountryOptions) return cachedCountryOptions;
  const displayNames =
    typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames(['pt-BR'], { type: 'region' })
      : null;
  cachedCountryOptions = getCountries()
    .map((code) => ({ code, label: displayNames?.of(code) ?? code }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  return cachedCountryOptions;
}
