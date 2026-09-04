-- Módulo Alunos: liga um contato a um produto (curso/pós) já vendido/matriculado,
-- pra separar "Alunos" de "Contatos" (leads) sem duplicar cadastro — reusa
-- contacts + tags existentes, só adiciona o vínculo aluno↔produto.
SET search_path TO whatsapp_hub;

CREATE TABLE IF NOT EXISTS whatsapp_hub.student_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT whatsapp_hub.current_org_id()
    REFERENCES whatsapp_hub.organizations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES whatsapp_hub.contacts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES whatsapp_hub.products(id) ON DELETE CASCADE,
  enrolled_at date NOT NULL DEFAULT current_date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, product_id)
);

CREATE INDEX IF NOT EXISTS student_products_org_idx ON whatsapp_hub.student_products (org_id);
CREATE INDEX IF NOT EXISTS student_products_contact_idx ON whatsapp_hub.student_products (contact_id);
CREATE INDEX IF NOT EXISTS student_products_product_idx ON whatsapp_hub.student_products (product_id);

ALTER TABLE whatsapp_hub.student_products ENABLE ROW LEVEL SECURITY;

-- Mesmo padrão de contacts/tags: leitura pra qualquer membro da org, escrita
-- admin+operator.
CREATE POLICY student_products_select ON whatsapp_hub.student_products FOR SELECT TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active());
CREATE POLICY student_products_write ON whatsapp_hub.student_products FOR ALL TO authenticated
  USING (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() IN ('admin', 'operator'))
  WITH CHECK (org_id = whatsapp_hub.current_org_id() AND whatsapp_hub.current_org_active()
    AND whatsapp_hub.current_user_role() IN ('admin', 'operator'));

GRANT SELECT, INSERT, UPDATE, DELETE ON whatsapp_hub.student_products TO authenticated;

ALTER TABLE whatsapp_hub.student_products REPLICA IDENTITY FULL;
