import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { toast } from 'sonner';
import { FileText, Image as ImageIcon, Loader2, MessageSquareText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { useScripts } from '@/hooks/useScripts';
import type { Script } from '@/types/crm';
import { LoadErrorBanner } from '@/components/LoadErrorBanner';
import { SCRIPT_VARIABLES } from '@/lib/scriptVariables';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';

const textareaCls =
  'w-full resize-none rounded-lg border border-[rgba(59,130,246,0.2)] bg-white/[0.03] px-4 py-2.5 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--accent-primary)]';

const BUCKET = 'whatsapp-hub-script-attachments';
const MAX_BYTES = 25 * 1024 * 1024;

const attachBtnCls =
  'inline-flex items-center gap-1.5 rounded-lg border border-[rgba(59,130,246,0.25)] bg-white/[0.03] px-3 py-2 text-xs font-medium text-[var(--accent-primary)] hover:bg-[rgba(59,130,246,0.1)] disabled:opacity-50';
const attachChipCls =
  'flex items-center gap-2 rounded-lg border border-[rgba(59,130,246,0.2)] bg-white/[0.03] px-3 py-2 text-xs';

// Configurações → Scripts. Mensagens prontas reutilizáveis: podem ser
// inseridas no chat do Inbox ou usadas como texto de automações (Follow-ups
// UAZAPI / Funil "Disparar mensagem de texto"). Podem ter imagem e/ou PDF
// anexados — reenviados junto com o texto quando o script é usado no Inbox.
export function ScriptsSettings() {
  const { orgId } = useAppUser();
  const { scripts, loading, error, reload, create, update, remove } = useScripts();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const editContentRef = useRef<HTMLTextAreaElement | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editPdfFile, setEditPdfFile] = useState<File | null>(null);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editImagePath, setEditImagePath] = useState<string | null>(null);
  const [editPdfUrl, setEditPdfUrl] = useState<string | null>(null);
  const [editPdfPath, setEditPdfPath] = useState<string | null>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const editPdfInputRef = useRef<HTMLInputElement>(null);

  // Insere {{variavel}} na posição do cursor (ou no final, se o campo não
  // estiver focado) e atualiza o estado controlado do textarea.
  const insertVariable = (
    token: string,
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    setValue: (v: string) => void,
  ) => {
    const el = ref.current;
    if (!el) {
      setValue(`${value}${token}`);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  // Sobe um anexo (imagem ou PDF) ao bucket de scripts e devolve a URL
  // pública + o path (para permitir excluir depois).
  const uploadAttachment = async (file: File, org: string): Promise<{ url: string; path: string }> => {
    const supabase = getSupabase();
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${org}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
    if (upErr) throw new Error(upErr.message);
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
  };

  const removeStoragePath = async (path: string | null | undefined) => {
    if (!path) return;
    const supabase = getSupabase();
    await supabase.storage.from(BUCKET).remove([path]);
  };

  const onPickFile = (
    e: ChangeEvent<HTMLInputElement>,
    setFile: (f: File | null) => void,
  ) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_BYTES) {
      toast.error('Arquivo excede 25MB.');
      e.target.value = '';
      return;
    }
    setFile(f);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    if (!orgId) {
      toast.error('Sessão sem organização. Recarregue a página.');
      return;
    }
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      let imagePath: string | null = null;
      let pdfUrl: string | null = null;
      let pdfPath: string | null = null;
      if (imageFile) {
        const uploaded = await uploadAttachment(imageFile, orgId);
        imageUrl = uploaded.url;
        imagePath = uploaded.path;
      }
      if (pdfFile) {
        const uploaded = await uploadAttachment(pdfFile, orgId);
        pdfUrl = uploaded.url;
        pdfPath = uploaded.path;
      }
      await create({ title, content, image_url: imageUrl, image_path: imagePath, pdf_url: pdfUrl, pdf_path: pdfPath });
      toast.success('Script cadastrado.');
      setTitle('');
      setContent('');
      setImageFile(null);
      setPdfFile(null);
      if (imageInputRef.current) imageInputRef.current.value = '';
      if (pdfInputRef.current) pdfInputRef.current.value = '';
    } catch (err) {
      toast.error('Falha ao cadastrar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (s: Script) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditContent(s.content);
    setEditImageFile(null);
    setEditPdfFile(null);
    setEditImageUrl(s.image_url);
    setEditImagePath(s.image_path);
    setEditPdfUrl(s.pdf_url);
    setEditPdfPath(s.pdf_path);
    if (editImageInputRef.current) editImageInputRef.current.value = '';
    if (editPdfInputRef.current) editPdfInputRef.current.value = '';
  };

  const handleUpdate = async () => {
    if (!editingId || !editTitle.trim() || !editContent.trim()) return;
    if (!orgId) {
      toast.error('Sessão sem organização. Recarregue a página.');
      return;
    }
    setEditSaving(true);
    try {
      let imageUrl = editImageUrl;
      let imagePath = editImagePath;
      if (editImageFile) {
        const uploaded = await uploadAttachment(editImageFile, orgId);
        await removeStoragePath(editImagePath);
        imageUrl = uploaded.url;
        imagePath = uploaded.path;
      } else if (editImageUrl === null && editImagePath) {
        await removeStoragePath(editImagePath);
        imagePath = null;
      }

      let pdfUrl = editPdfUrl;
      let pdfPath = editPdfPath;
      if (editPdfFile) {
        const uploaded = await uploadAttachment(editPdfFile, orgId);
        await removeStoragePath(editPdfPath);
        pdfUrl = uploaded.url;
        pdfPath = uploaded.path;
      } else if (editPdfUrl === null && editPdfPath) {
        await removeStoragePath(editPdfPath);
        pdfPath = null;
      }

      await update(editingId, {
        title: editTitle,
        content: editContent,
        image_url: imageUrl,
        image_path: imagePath,
        pdf_url: pdfUrl,
        pdf_path: pdfPath,
      });
      toast.success('Script atualizado.');
      setEditingId(null);
    } catch (err) {
      toast.error('Falha ao atualizar', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setEditSaving(false);
    }
  };

  const handleRemove = async (s: Script) => {
    if (!confirm(`Excluir o script "${s.title}"?`)) return;
    try {
      await remove(s.id);
      await removeStoragePath(s.image_path);
      await removeStoragePath(s.pdf_path);
      toast.success('Script excluído.');
    } catch (err) {
      toast.error('Falha ao excluir', { description: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={handleCreate} className="space-y-4">
          <header className="space-y-1">
            <h2 className="text-xl font-bold text-display">Scripts</h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Mensagens prontas para reaproveitar no chat do Inbox ou nas automações
              (Follow-ups e Funil).
            </p>
          </header>

          <div className="space-y-2">
            <Label htmlFor="script_title">Título *</Label>
            <Input
              id="script_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Boas-vindas"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="script_content">Mensagem *</Label>
            <textarea
              id="script_content"
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="Texto do script…"
              disabled={saving}
              className={textareaCls}
            />
            <div className="flex flex-wrap gap-1.5">
              {SCRIPT_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => insertVariable(v.token, contentRef, content, setContent)}
                  title={v.label}
                  className="rounded-full border border-[rgba(59,130,246,0.25)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-primary)] hover:bg-[rgba(59,130,246,0.1)]"
                >
                  {v.token}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Clique numa variável para inserir. Ela é preenchida automaticamente com o dado
              do contato quando o script é usado no Inbox.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Anexos (opcional)</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onPickFile(e, setImageFile)}
                  disabled={saving}
                />
                {imageFile ? (
                  <div className={attachChipCls}>
                    <ImageIcon className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    <span className="truncate text-[var(--color-text-primary)]">{imageFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setImageFile(null);
                        if (imageInputRef.current) imageInputRef.current.value = '';
                      }}
                      className="ml-auto text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                      aria-label="Remover imagem"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => imageInputRef.current?.click()} disabled={saving} className={attachBtnCls}>
                    <ImageIcon className="h-3.5 w-3.5" />
                    Anexar imagem
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => onPickFile(e, setPdfFile)}
                  disabled={saving}
                />
                {pdfFile ? (
                  <div className={attachChipCls}>
                    <FileText className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                    <span className="truncate text-[var(--color-text-primary)]">{pdfFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPdfFile(null);
                        if (pdfInputRef.current) pdfInputRef.current.value = '';
                      }}
                      className="ml-auto text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                      aria-label="Remover PDF"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={saving} className={attachBtnCls}>
                    <FileText className="h-3.5 w-3.5" />
                    Anexar PDF
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-[var(--color-text-secondary)]">
              Reenviados junto com o texto quando o script é usado no Inbox (máx 25MB cada).
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !title.trim() || !content.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Cadastrar
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="space-y-3">
          <div className="text-label">Scripts cadastrados</div>
          {error && <LoadErrorBanner message={error} onRetry={() => void reload()} />}
          {loading ? (
            <div className="py-8 text-center text-label opacity-60">Carregando...</div>
          ) : scripts.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--color-text-secondary)] opacity-60">
              <MessageSquareText className="mx-auto mb-2 h-6 w-6 opacity-50" />
              Nenhum script cadastrado ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {scripts.map((s) =>
                editingId === s.id ? (
                  <div
                    key={s.id}
                    className="space-y-2 rounded-lg border border-[rgba(59,130,246,0.25)] bg-white/[0.03] p-3"
                  >
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} disabled={editSaving} />
                    <textarea
                      ref={editContentRef}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={4}
                      disabled={editSaving}
                      className={textareaCls}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {SCRIPT_VARIABLES.map((v) => (
                        <button
                          key={v.token}
                          type="button"
                          onClick={() => insertVariable(v.token, editContentRef, editContent, setEditContent)}
                          title={v.label}
                          className="rounded-full border border-[rgba(59,130,246,0.25)] bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-primary)] hover:bg-[rgba(59,130,246,0.1)]"
                        >
                          {v.token}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <input
                          ref={editImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => onPickFile(e, setEditImageFile)}
                          disabled={editSaving}
                        />
                        {editImageFile ? (
                          <div className={attachChipCls}>
                            <ImageIcon className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                            <span className="truncate text-[var(--color-text-primary)]">{editImageFile.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditImageFile(null);
                                if (editImageInputRef.current) editImageInputRef.current.value = '';
                              }}
                              className="ml-auto text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                              aria-label="Remover imagem"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : editImageUrl ? (
                          <div className={attachChipCls}>
                            <ImageIcon className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                            <a href={editImageUrl} target="_blank" rel="noreferrer" className="truncate text-[var(--accent-primary)] underline">
                              Ver imagem atual
                            </a>
                            <button
                              type="button"
                              onClick={() => setEditImageUrl(null)}
                              className="ml-auto text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                              aria-label="Remover imagem"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => editImageInputRef.current?.click()} disabled={editSaving} className={attachBtnCls}>
                            <ImageIcon className="h-3.5 w-3.5" />
                            Anexar imagem
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <input
                          ref={editPdfInputRef}
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => onPickFile(e, setEditPdfFile)}
                          disabled={editSaving}
                        />
                        {editPdfFile ? (
                          <div className={attachChipCls}>
                            <FileText className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                            <span className="truncate text-[var(--color-text-primary)]">{editPdfFile.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditPdfFile(null);
                                if (editPdfInputRef.current) editPdfInputRef.current.value = '';
                              }}
                              className="ml-auto text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                              aria-label="Remover PDF"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : editPdfUrl ? (
                          <div className={attachChipCls}>
                            <FileText className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                            <a href={editPdfUrl} target="_blank" rel="noreferrer" className="truncate text-[var(--accent-primary)] underline">
                              Ver PDF atual
                            </a>
                            <button
                              type="button"
                              onClick={() => setEditPdfUrl(null)}
                              className="ml-auto text-[var(--color-text-secondary)] hover:text-[var(--color-error)]"
                              aria-label="Remover PDF"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => editPdfInputRef.current?.click()} disabled={editSaving} className={attachBtnCls}>
                            <FileText className="h-3.5 w-3.5" />
                            Anexar PDF
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" onClick={handleUpdate} disabled={editSaving || !editTitle.trim() || !editContent.trim()}>
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} disabled={editSaving} aria-label="Cancelar edição">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={s.id}
                    className="flex items-start gap-3 rounded-lg border border-[rgba(59,130,246,0.08)] bg-white/[0.02] p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
                        {s.title}
                        {s.image_url && <ImageIcon className="h-3 w-3 text-[var(--accent-primary)]" />}
                        {s.pdf_url && <FileText className="h-3 w-3 text-[var(--accent-primary)]" />}
                      </span>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-text-secondary)]">{s.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" onClick={() => startEdit(s)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void handleRemove(s)} aria-label="Excluir">
                        <Trash2 className="h-4 w-4 text-[var(--color-error)]" />
                      </Button>
                    </div>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
