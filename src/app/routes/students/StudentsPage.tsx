import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { GraduationCap, Plus, Search, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useStudents, type StudentSort } from '@/hooks/useStudents';
import { useTags } from '@/hooks/useTags';
import { useProducts } from '@/hooks/useProducts';
import { StudentFormDialog } from '@/components/students/StudentFormDialog';
import { ImportStudentsDialog } from '@/components/students/ImportStudentsDialog';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';

const PAGE_SIZE_OPTIONS = [25, 50, 100, 1000] as const;

const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

export default function StudentsPage() {
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<StudentSort>('recent');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { tags } = useTags();
  const { products } = useProducts();
  const { students, total, loading, error, reload, removeEnrollment } = useStudents({
    search,
    tagId: tagFilter,
    productId: productFilter,
    sort,
    page,
    pageSize,
  });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const handleRemoveEnrollment = async (linkId: string, label: string) => {
    if (!confirm(`Remover "${label}" deste aluno?`)) return;
    try {
      await removeEnrollment(linkId);
      toast.success('Removido.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível remover.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl glass-card flex items-center justify-center">
            <GraduationCap className="h-5 w-5 text-[var(--accent-primary)]" />
          </div>
          <div>
            <div className="text-label">Seção</div>
            <h1 className="text-2xl font-bold text-display">Alunos</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              {total.toLocaleString('pt-BR')} aluno{total !== 1 ? 's' : ''} no total
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="h-4 w-4" />
            Importar
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Novo aluno
          </Button>
        </div>
      </div>

      <div className="glass-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--color-text-secondary)]" />
            <input
              type="search"
              placeholder="Buscar por nome, telefone ou e-mail"
              value={search}
              onChange={(e) => {
                setPage(1);
                setSearch(e.target.value);
              }}
              className="w-full h-10 pl-10 pr-4 rounded-lg bg-[rgba(22,163,74,0.06)] border border-[rgba(22,163,74,0.12)] text-sm placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <select
            value={tagFilter ?? ''}
            onChange={(e) => {
              setPage(1);
              setTagFilter(e.target.value || null);
            }}
            className="h-10 rounded-lg border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.06)] px-3 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">Todas as tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={productFilter ?? ''}
            onChange={(e) => {
              setPage(1);
              setProductFilter(e.target.value || null);
            }}
            className="h-10 rounded-lg border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.06)] px-3 text-sm text-[var(--color-text-primary)]"
          >
            <option value="">Todos os produtos</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => {
              setPage(1);
              setSort(e.target.value as StudentSort);
            }}
            className="h-10 rounded-lg border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.06)] px-3 text-sm text-[var(--color-text-primary)]"
          >
            <option value="recent">Mais recentes</option>
            <option value="name">Nome (A–Z)</option>
          </select>
        </div>

        {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}

        {/* Mobile (<md): cartões. */}
        <div className="md:hidden space-y-2">
          {loading ? (
            <div className="p-6 text-center text-[var(--color-text-secondary)] opacity-60">Carregando...</div>
          ) : students.length === 0 ? (
            <div className="p-6 text-center text-[var(--color-text-secondary)] opacity-60">
              {search || tagFilter || productFilter
                ? 'Nenhum aluno encontrado com estes filtros.'
                : 'Nenhum aluno ainda — adicione manualmente ou importe um CSV.'}
            </div>
          ) : (
            students.map((s) => (
              <div key={s.id} className="rounded-lg border border-[rgba(22,163,74,0.1)] bg-[rgba(22,163,74,0.05)] p-3">
                <Link to={`/contacts/${s.id}`} className="block truncate font-medium text-[var(--color-text-primary)] hover:text-[var(--accent-primary)]">
                  {s.name || '— ver ficha'}
                </Link>
                <div className="truncate font-mono text-xs text-[var(--color-text-secondary)]">{s.phone || '—'}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.enrollments.map((en) => (
                    <span
                      key={en.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[rgba(22,163,74,0.1)] px-2 py-0.5 text-xs text-[var(--color-text-primary)]"
                    >
                      {en.product_name}
                      <button type="button" onClick={() => void handleRemoveEnrollment(en.id, en.product_name)} aria-label="Remover">
                        <X className="h-3 w-3 opacity-60" />
                      </button>
                    </span>
                  ))}
                </div>
                {s.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.tags.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-[rgba(22,163,74,0.06)] px-2 py-0.5 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                        {t.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Desktop (md+): tabela. */}
        <div className="hidden md:block rounded-lg border border-[rgba(22,163,74,0.08)] overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="bg-[rgba(22,163,74,0.05)] text-left">
                <th className="p-3 text-label">Nome</th>
                <th className="p-3 text-label">Telefone</th>
                <th className="p-3 text-label">Produtos</th>
                <th className="p-3 text-label">Tags</th>
                <th className="p-3 text-label">Cadastro</th>
                <th className="p-3 w-20" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--color-text-secondary)] opacity-60">
                    Carregando...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[var(--color-text-secondary)] opacity-60">
                    {search || tagFilter || productFilter
                      ? 'Nenhum aluno encontrado com estes filtros.'
                      : 'Nenhum aluno ainda — adicione manualmente ou importe um CSV.'}
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id} className="border-t border-[rgba(22,163,74,0.06)] hover:bg-[rgba(22,163,74,0.05)]">
                    <td className="p-3">
                      <Link to={`/contacts/${s.id}`} className="font-medium text-[var(--color-text-primary)] hover:text-[var(--accent-primary)]">
                        {s.name || <span className="opacity-40">— ver ficha</span>}
                      </Link>
                    </td>
                    <td className="p-3 font-mono text-xs text-[var(--color-text-secondary)]">
                      {s.phone || <span className="opacity-40">—</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {s.enrollments.map((en) => (
                          <span
                            key={en.id}
                            className="inline-flex items-center gap-1 rounded-full bg-[rgba(22,163,74,0.1)] px-2 py-0.5 text-xs text-[var(--color-text-primary)]"
                            title={`Matriculado em ${fmtDate(en.enrolled_at)}`}
                          >
                            {en.product_name}
                            <button
                              type="button"
                              onClick={() => void handleRemoveEnrollment(en.id, en.product_name)}
                              aria-label={`Remover ${en.product_name}`}
                              className="opacity-60 hover:opacity-100"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {s.tags.slice(0, 3).map((t) => (
                          <span key={t.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs bg-[rgba(22,163,74,0.06)]">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </span>
                        ))}
                        {s.tags.length > 3 && (
                          <span className="text-xs text-[var(--color-text-secondary)] opacity-60">+{s.tags.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-[var(--color-text-secondary)]">
                      {fmtDate(s.first_seen_at ?? s.created_at)}
                    </td>
                    <td className="p-3 text-right">
                      <Link to={`/contacts/${s.id}`}>
                        <Button size="sm" variant="ghost">
                          Ver ficha
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-secondary)]">
              Página {page} de {pageCount}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
              Linhas
              <select
                value={pageSize}
                onChange={(e) => {
                  setPage(1);
                  setPageSize(Number(e.target.value));
                }}
                className="h-8 rounded-lg border border-[rgba(22,163,74,0.12)] bg-[rgba(22,163,74,0.06)] px-2 text-xs text-[var(--color-text-primary)]"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1 || loading}>
              Anterior
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount || loading}>
              Próxima
            </Button>
          </div>
        </div>
      </div>

      <StudentFormDialog open={showForm} onClose={() => setShowForm(false)} onSaved={reload} />
      <ImportStudentsDialog open={showImport} onClose={() => setShowImport(false)} onDone={reload} />
    </div>
  );
}
