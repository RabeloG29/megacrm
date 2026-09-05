-- Aluno?: toggle manual no cadastro do contato (modal "Editar contato") +
-- datas de compra / vencimento da assinatura. Até aqui, "ser aluno" só
-- existia implicitamente via whatsapp_hub.student_products (vínculo a um
-- produto matriculado); agora contacts.is_student vira a fonte de verdade de
-- quem aparece em /alunos — permite marcar alguém como aluno direto no
-- cadastro do contato, sem precisar escolher um produto.
SET search_path TO whatsapp_hub;

ALTER TABLE whatsapp_hub.contacts
  ADD COLUMN IF NOT EXISTS is_student boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS subscription_expires_at date;

-- Backfill: quem já tinha matrícula em student_products passa a contar como
-- aluno também pelo novo flag — sem isso, sumiriam de /alunos (que agora lê
-- is_student em vez de inferir só pela matrícula).
UPDATE whatsapp_hub.contacts c
SET is_student = true
WHERE c.is_student = false
  AND EXISTS (SELECT 1 FROM whatsapp_hub.student_products sp WHERE sp.contact_id = c.id);
