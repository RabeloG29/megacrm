import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAppUser } from '@/app/providers/AppUserProvider';
import type { Contact, Tag } from '@/types/db';
import type { StudentRow } from '@/types/students';

export type StudentSort = 'recent' | 'name';

interface UseStudentsInput {
  search?: string;
  tagId?: string | null;
  productId?: string | null;
  sort?: StudentSort;
  page?: number;
  pageSize?: number;
}

interface AddStudentInput {
  // Contato existente (id) OU dados pra criar/reaproveitar por telefone.
  contactId?: string;
  phone?: string;
  name?: string | null;
  email?: string | null;
  productId: string;
  tagIds?: string[];
}

interface UseStudentsResult {
  students: StudentRow[];
  total: number;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  addStudent: (input: AddStudentInput) => Promise<void>;
  removeEnrollment: (linkId: string) => Promise<void>;
}

const PAGE_SIZE_DEFAULT = 25;

export function useStudents({
  search = '',
  tagId = null,
  productId = null,
  sort = 'recent',
  page = 1,
  pageSize = PAGE_SIZE_DEFAULT,
}: UseStudentsInput = {}): UseStudentsResult {
  const { userId } = useAppUser();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const supabase = getSupabase();

    // Base: contact_ids com pelo menos 1 vínculo em student_products
    // (é isso que faz alguém aparecer em "Alunos"), já filtrando por produto
    // quando aplicável.
    let linkQuery = supabase.from('student_products').select('contact_id, product_id');
    if (productId) linkQuery = linkQuery.eq('product_id', productId);
    const { data: linkRows, error: linkErr } = await linkQuery;
    if (linkErr) {
      setError(linkErr.message);
      setLoading(false);
      return;
    }
    let contactIds = Array.from(new Set((linkRows ?? []).map((r) => r.contact_id as string)));
    if (contactIds.length === 0) {
      setStudents([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    // Filtro por tag intersecta com o conjunto acima.
    if (tagId) {
      const { data: tagLinks, error: tagErr } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .eq('tag_id', tagId)
        .in('contact_id', contactIds);
      if (tagErr) {
        setError(tagErr.message);
        setLoading(false);
        return;
      }
      const tagSet = new Set((tagLinks ?? []).map((r) => r.contact_id as string));
      contactIds = contactIds.filter((id) => tagSet.has(id));
      if (contactIds.length === 0) {
        setStudents([]);
        setTotal(0);
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .from('contacts')
      .select('*', { count: 'exact' })
      .in('id', contactIds);

    if (search.trim()) {
      const pattern = `%${search.trim()}%`;
      query = query.or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`);
    }

    if (sort === 'name') query = query.order('name', { ascending: true, nullsFirst: false });
    else query = query.order('created_at', { ascending: false });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, error: err, count } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const pageIds = (data ?? []).map((c) => c.id as string);
    if (pageIds.length === 0) {
      setStudents([]);
      setTotal(count ?? 0);
      setLoading(false);
      return;
    }

    const [{ data: tagLinkRows }, { data: enrollRows }] = await Promise.all([
      supabase
        .from('contact_tags')
        .select('contact_id, tag:tag_id(id, name, color, created_at, updated_at)')
        .in('contact_id', pageIds),
      supabase
        .from('student_products')
        .select('id, contact_id, product_id, enrolled_at, product:product_id(id, name)')
        .in('contact_id', pageIds),
    ]);

    const tagsByContact = new Map<string, Tag[]>();
    for (const row of tagLinkRows ?? []) {
      const cid = row.contact_id as string;
      const tag = row.tag as unknown as Tag | null;
      if (!tag) continue;
      const arr = tagsByContact.get(cid) ?? [];
      arr.push(tag);
      tagsByContact.set(cid, arr);
    }

    const enrollByContact = new Map<string, StudentRow['enrollments']>();
    for (const row of enrollRows ?? []) {
      const cid = row.contact_id as string;
      const product = row.product as unknown as { id: string; name: string } | null;
      if (!product) continue;
      const arr = enrollByContact.get(cid) ?? [];
      arr.push({
        id: row.id as string,
        product_id: row.product_id as string,
        product_name: product.name,
        enrolled_at: row.enrolled_at as string,
      });
      enrollByContact.set(cid, arr);
    }

    const merged: StudentRow[] = (data ?? []).map((c) => ({
      ...(c as Contact),
      tags: tagsByContact.get(c.id as string) ?? [],
      enrollments: enrollByContact.get(c.id as string) ?? [],
    }));

    setStudents(merged);
    setTotal(count ?? 0);
    setLoading(false);
  }, [userId, search, tagId, productId, sort, page, pageSize]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addStudent: UseStudentsResult['addStudent'] = async (input) => {
    if (!userId) return;
    const supabase = getSupabase();
    let contactId = input.contactId ?? null;

    if (!contactId) {
      const phone = (input.phone ?? '').trim();
      if (!phone) throw new Error('Informe o telefone do aluno.');
      // Reaproveita contato existente pelo telefone (não sobrescreve nome/e-mail
      // já cadastrados); só cria se realmente não existir.
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();
      if (existing) {
        contactId = existing.id as string;
      } else {
        const { data: created, error: createErr } = await supabase
          .from('contacts')
          .insert({ phone, name: input.name || null, email: input.email || null, custom_fields: {} })
          .select('id')
          .single();
        if (createErr) throw new Error(translateStudentError(createErr.message));
        contactId = created.id as string;
      }
    }

    const tagIds = input.tagIds ?? [];
    if (tagIds.length > 0) {
      const { error: tagErr } = await supabase
        .from('contact_tags')
        .upsert(
          tagIds.map((tag_id) => ({ contact_id: contactId, tag_id })),
          { onConflict: 'contact_id,tag_id' },
        );
      if (tagErr) throw new Error(translateStudentError(tagErr.message));
    }

    const { error: linkErr } = await supabase
      .from('student_products')
      .upsert(
        { contact_id: contactId, product_id: input.productId, created_by: userId },
        { onConflict: 'contact_id,product_id' },
      );
    if (linkErr) throw new Error(translateStudentError(linkErr.message));

    await reload();
  };

  const removeEnrollment: UseStudentsResult['removeEnrollment'] = async (linkId) => {
    const supabase = getSupabase();
    const { error: err } = await supabase.from('student_products').delete().eq('id', linkId);
    if (err) throw new Error(translateStudentError(err.message));
    await reload();
  };

  return { students, total, loading, error, reload, addStudent, removeEnrollment };
}

function translateStudentError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('duplicate key') && lower.includes('phone')) {
    return 'Já existe um contato com este telefone.';
  }
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return 'Você não tem permissão para esta ação.';
  }
  if (lower.includes('violates check constraint') || lower.includes('invalid input')) {
    return 'Dados inválidos — revise os campos e tente novamente.';
  }
  return message || 'Não foi possível concluir a operação.';
}
