-- =============================================================
-- 20261069 — Intervalos de cobrança: Semestral + snapshot na linha
--
-- Incidente (ago/2026): o catálogo só aceitava mensal/trimestral/anual
-- (o plano SEMESTRAL da operação não existia como opção) e o item do
-- negócio não guardava o intervalo — a UI assumia "/mês" para qualquer
-- recorrência e o "Em 12m" multiplicava tudo por 12.
--
-- 1. crm_products.recurring_interval passa a aceitar 'semiannual'.
-- 2. crm_deal_products ganha recurring_interval (SNAPSHOT — como
--    nome/preço, a linha congela o combinado na venda; mudar o produto
--    no catálogo depois não mexe em negócio já lançado).
-- 3. Backfill: linhas recorrentes existentes herdam o intervalo do
--    produto de origem (as sem produto ficam NULL = mensal, o
--    comportamento que sempre tiveram).
--
-- Idempotente — pode rodar mais de uma vez.
-- =============================================================

-- 1) Catálogo: aceita semestral
ALTER TABLE crm_products
  DROP CONSTRAINT IF EXISTS crm_products_recurring_interval_check;
ALTER TABLE crm_products
  ADD CONSTRAINT crm_products_recurring_interval_check
  CHECK (recurring_interval IS NULL
         OR recurring_interval IN ('monthly','quarterly','semiannual','yearly'));

-- 2) Linha do negócio: snapshot do intervalo
ALTER TABLE crm_deal_products
  ADD COLUMN IF NOT EXISTS recurring_interval TEXT;
ALTER TABLE crm_deal_products
  DROP CONSTRAINT IF EXISTS crm_deal_products_recurring_interval_check;
ALTER TABLE crm_deal_products
  ADD CONSTRAINT crm_deal_products_recurring_interval_check
  CHECK (recurring_interval IS NULL
         OR recurring_interval IN ('monthly','quarterly','semiannual','yearly'));

-- 3) Backfill a partir do catálogo (só linhas recorrentes sem intervalo)
UPDATE crm_deal_products dp
SET recurring_interval = p.recurring_interval
FROM crm_products p
WHERE dp.product_id = p.id
  AND dp.billing_type = 'recurring'
  AND dp.recurring_interval IS NULL
  AND p.recurring_interval IS NOT NULL;

-- Verificação: deve retornar 2 linhas (as duas constraints novas)
SELECT conname AS constraint_ok
FROM pg_constraint
WHERE conname IN (
  'crm_products_recurring_interval_check',
  'crm_deal_products_recurring_interval_check'
)
ORDER BY conname;
