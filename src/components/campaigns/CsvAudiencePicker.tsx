import { useMemo, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSupabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

// Versão reduzida do mapeamento de colunas do ImportContactsDialog, embutida
// no wizard de disparo direto: em vez de só importar pra base de contatos,
// captura os IDs resultantes (.select('id')) pra virarem a audiência da
// campanha. O upsert por telefone é o MESMO da importação normal — um
// contato que já existe é atualizado (custom_fields incluídos), não duplicado.
type FieldMapping =
  | { kind: 'skip' }
  | { kind: 'phone' }
  | { kind: 'name' }
  | { kind: 'custom'; name: string };

interface CsvAudiencePickerProps {
  disabled?: boolean;
  onResolved: (result: { contactIds: string[]; totalRows: number; fileName: string }) => void;
}

const CHUNK_SIZE = 500;

function readFile(file: File): Promise<string[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheet];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
          header: 1,
          raw: false,
          defval: '',
        });
        resolve(rows.map((r) => r.map((c) => (c == null ? '' : String(c).trim()))));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function guessInitialMapping(headers: string[]): FieldMapping[] {
  return headers.map((h) => {
    const low = h.toLowerCase();
    if (/(phone|telefone|celular|whats)/.test(low)) return { kind: 'phone' };
    if (/(name|nome)/.test(low)) return { kind: 'name' };
    return { kind: 'skip' };
  });
}

export function CsvAudiencePicker({ disabled, onResolved }: CsvAudiencePickerProps) {
  const [step, setStep] = useState<'upload' | 'map' | 'running' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<FieldMapping[]>([]);
  const [progress, setProgress] = useState(0);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(0);

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = await readFile(f);
      if (parsed.length === 0) {
        toast.error('Arquivo vazio.');
        return;
      }
      setFile(f);
      setRows(parsed);
      setMapping(guessInitialMapping(parsed[0] ?? []));
      setStep('map');
    } catch (err) {
      toast.error('Falha ao ler arquivo', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const headers = useMemo(() => {
    if (rows.length === 0) return [];
    return hasHeader ? rows[0] : rows[0].map((_, i) => `Coluna ${i + 1}`);
  }, [rows, hasHeader]);

  const previewBody = useMemo(() => (hasHeader ? rows.slice(1, 6) : rows.slice(0, 5)), [rows, hasHeader]);
  const phoneColumn = mapping.findIndex((m) => m.kind === 'phone');

  const runImport = async () => {
    if (phoneColumn === -1) {
      toast.error('Mapeie ao menos uma coluna para "Telefone".');
      return;
    }
    setStep('running');
    setProgress(0);

    const supabase = getSupabase();
    const data = hasHeader ? rows.slice(1) : rows;
    const nameIdx = mapping.findIndex((m) => m.kind === 'name');
    const customCols = mapping
      .map((m, i) => (m.kind === 'custom' ? { i, name: m.name } : null))
      .filter((x): x is { i: number; name: string } => !!x);

    const seen = new Set<string>();
    const pending: Array<{ phone: string; name: string | null; custom_fields: Record<string, string> }> = [];
    let invalidOrDup = 0;

    for (const r of data) {
      const rawPhone = r[phoneColumn] ?? '';
      const parsed = normalizePhone(rawPhone);
      if (!parsed.ok) {
        invalidOrDup++;
        continue;
      }
      if (seen.has(parsed.e164)) {
        invalidOrDup++;
        continue;
      }
      seen.add(parsed.e164);
      const custom: Record<string, string> = {};
      for (const c of customCols) {
        const v = r[c.i];
        if (v) custom[c.name] = v;
      }
      pending.push({
        phone: parsed.e164,
        name: nameIdx >= 0 ? r[nameIdx] || null : null,
        custom_fields: custom,
      });
    }

    const ids: string[] = [];
    let failed = 0;
    for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
      const chunk = pending.slice(i, i + CHUNK_SIZE);
      const { data: upserted, error } = await supabase
        .from('contacts')
        .upsert(chunk, { onConflict: 'phone' })
        .select('id');
      if (error) {
        failed += chunk.length;
      } else {
        ids.push(...((upserted ?? []) as Array<{ id: string }>).map((r2) => r2.id));
      }
      setProgress(Math.round(((i + chunk.length) / Math.max(pending.length, 1)) * 100));
    }

    setResultCount(ids.length);
    setSkipped(invalidOrDup + failed);
    setStep('done');
    if (failed > 0) {
      toast.warning(`${ids.length} contatos prontos, ${failed} falharam ao salvar.`);
    }
    onResolved({ contactIds: ids, totalRows: data.length, fileName: file?.name ?? 'audiencia.csv' });
  };

  if (step === 'upload') {
    return (
      <label
        htmlFor="blast_csv_file"
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[rgba(22,163,74,0.25)] bg-[rgba(22,163,74,0.05)] p-8 cursor-pointer hover:border-[rgba(22,163,74,0.5)]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <FileUp className="h-7 w-7 text-[var(--accent-primary)]" />
        <div className="text-center">
          <div className="font-semibold text-sm">Clique para selecionar um arquivo</div>
          <div className="text-xs text-[var(--color-text-secondary)]">.csv, .xlsx ou .xls — precisa de uma coluna de telefone</div>
        </div>
        <input id="blast_csv_file" type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="sr-only" disabled={disabled} />
      </label>
    );
  }

  if (step === 'map') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-[var(--color-text-secondary)]">
            <span className="font-mono text-[var(--color-text-primary)]">{file?.name}</span> · {rows.length} linhas
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(e) => {
                setHasHeader(e.target.checked);
                setMapping(guessInitialMapping(e.target.checked ? rows[0] ?? [] : []));
              }}
              className="accent-[var(--accent-primary)]"
            />
            Primeira linha é cabeçalho
          </label>
        </div>

        <div className="rounded-lg border border-[rgba(22,163,74,0.1)] overflow-auto max-h-[260px]">
          <table className="w-full text-xs">
            <thead className="bg-[rgba(22,163,74,0.06)] sticky top-0">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="p-2 text-left border-b border-[rgba(22,163,74,0.08)] min-w-[140px]">
                    <div className="font-semibold text-[var(--color-text-primary)] mb-1 truncate">{h || `Coluna ${i + 1}`}</div>
                    <select
                      value={mapping[i]?.kind === 'custom' ? `custom:${(mapping[i] as { kind: 'custom'; name: string }).name}` : mapping[i]?.kind ?? 'skip'}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMapping((prev) => {
                          const next = [...prev];
                          if (v === 'skip') next[i] = { kind: 'skip' };
                          else if (v === 'phone') next[i] = { kind: 'phone' };
                          else if (v === 'name') next[i] = { kind: 'name' };
                          else if (v === 'custom-new') {
                            const name = prompt('Nome da variável (ex.: cidade) — use este mesmo nome em {{cidade}} na mensagem:');
                            if (name?.trim()) next[i] = { kind: 'custom', name: name.trim() };
                          }
                          return next;
                        });
                      }}
                      className="w-full rounded border border-[rgba(22,163,74,0.15)] bg-[rgba(22,163,74,0.04)] px-2 py-1 text-xs text-[var(--color-text-primary)]"
                    >
                      <option value="skip">— ignorar —</option>
                      <option value="phone">📞 telefone</option>
                      <option value="name">👤 nome</option>
                      {mapping[i]?.kind === 'custom' && (
                        <option value={`custom:${(mapping[i] as { kind: 'custom'; name: string }).name}`}>
                          ⚙ variável: {(mapping[i] as { kind: 'custom'; name: string }).name}
                        </option>
                      )}
                      <option value="custom-new">⚙ variável p/ mensagem (nova…)</option>
                    </select>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewBody.map((r, i) => (
                <tr key={i} className="border-b border-[rgba(22,163,74,0.04)]">
                  {headers.map((_, j) => (
                    <td key={j} className="p-2 text-[var(--color-text-secondary)] truncate max-w-[200px]">
                      {r[j] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => setStep('upload')}>
            Trocar arquivo
          </Button>
          <Button size="sm" onClick={runImport} disabled={phoneColumn === -1}>
            Usar {hasHeader ? rows.length - 1 : rows.length} linhas
          </Button>
        </div>
        {phoneColumn === -1 && (
          <p className="text-[11px] text-[var(--color-error)]">Pelo menos uma coluna precisa ser mapeada como "telefone".</p>
        )}
      </div>
    );
  }

  if (step === 'running') {
    return (
      <div className="py-8 flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-primary)]" />
        <div className="text-sm text-[var(--color-text-primary)]">Processando... {progress}%</div>
        <div className="w-full max-w-sm h-2 rounded-full bg-[rgba(22,163,74,0.06)] overflow-hidden">
          <div className="h-full bg-[var(--accent-primary)] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.05)] p-4">
      <CheckCircle2 className="h-5 w-5 text-[var(--color-success)] shrink-0" />
      <div className="text-sm">
        <div className="font-semibold">{resultCount ?? 0} contatos prontos para o disparo</div>
        {skipped > 0 && (
          <div className="text-[var(--color-text-secondary)]">{skipped} linhas ignoradas (telefone inválido ou duplicado)</div>
        )}
      </div>
    </div>
  );
}
