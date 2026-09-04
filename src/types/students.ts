import type { ContactWithTags } from '@/types/db';

// Produto embutido no vínculo aluno↔produto (nome só, pro badge da listagem).
export interface StudentProductLink {
  id: string; // student_products.id
  product_id: string;
  product_name: string;
  enrolled_at: string;
}

// Linha da listagem de Alunos: um contato + os produtos em que está
// matriculado (pode ter mais de um — ex.: comprou 2 pós).
export interface StudentRow extends ContactWithTags {
  enrollments: StudentProductLink[];
}
