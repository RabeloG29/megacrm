-- ============================================================================
-- Produtos: preço de catálogo
-- ----------------------------------------------------------------------------
-- Preço padrão do produto, usado para pré-preencher automaticamente o valor
-- do negócio (deals.value) quando o produto é vinculado a um lead/negócio no
-- funil — assim a venda já aparece com o valor certo no dashboard sem digitar
-- manualmente. Preço fica opcional (nem toda "classe" precisa de um valor
-- fixo — ex.: produtos com preço variável negociado caso a caso).
-- ============================================================================

SET search_path TO whatsapp_hub, public;

ALTER TABLE whatsapp_hub.products
  ADD COLUMN IF NOT EXISTS price NUMERIC(12, 2);

ALTER TABLE whatsapp_hub.products DROP CONSTRAINT IF EXISTS products_price_chk;
ALTER TABLE whatsapp_hub.products
  ADD CONSTRAINT products_price_chk CHECK (price IS NULL OR price >= 0);
