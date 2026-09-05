-- ============================================================
-- Cobrança com VÁRIAS lojas (set/2026)
--
-- Comissão de um cliente com duas lojas é cobrada numa fatura só. A
-- classificação tinha uma loja (`store_id`); agora `store_ids UUID[]`
-- guarda todas. Contrato: com UMA loja, `store_id` = ela e
-- `store_ids` = [ela]; com várias, `store_id` = NULL e `store_ids` =
-- todas (quem só lê store_id vê "sem loja definida" em vez de uma loja
-- errada). A view expõe `store_ids` já resolvido (fallback do store_id
-- para linhas antigas), coluna APENDADA.
-- ============================================================

ALTER TABLE client_charges ADD COLUMN IF NOT EXISTS store_ids UUID[];
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS store_ids UUID[];

CREATE INDEX IF NOT EXISTS idx_client_charges_store_ids ON client_charges USING GIN (store_ids);
CREATE INDEX IF NOT EXISTS idx_invoices_store_ids ON invoices USING GIN (store_ids);

CREATE OR REPLACE VIEW unified_invoices WITH (security_invoker = true) AS
SELECT
  i.id,
  i.client_id,
  i.amount,
  i.due_date,
  i.payment_date,
  i.status::TEXT                               AS status,
  i.description,
  i.asaas_id,
  (
    SELECT cs.id FROM client_subscriptions cs
    WHERE i.asaas_subscription_id IS NOT NULL
      AND cs.asaas_subscription_id = i.asaas_subscription_id
      AND cs.client_id = i.client_id
    ORDER BY cs.created_at
    LIMIT 1
  )                                            AS subscription_id,
  NULL::TEXT                                   AS payment_method,
  NULL::TEXT                                   AS actual_payment_method,
  NULL::TEXT                                   AS notes,
  i.created_at,
  COALESCE(i.updated_at, i.created_at)         AS updated_at,
  'asaas'::TEXT                                AS source,
  COALESCE(rs.total_refunded, 0)               AS refund_total,
  i.amount - COALESCE(rs.total_refunded, 0)    AS net_amount,
  i.charge_type,
  i.reference_months,
  i.store_id,
  i.asaas_subscription_id,
  COALESCE(i.store_ids, CASE WHEN i.store_id IS NULL THEN NULL ELSE ARRAY[i.store_id] END) AS store_ids
FROM invoices i
LEFT JOIN refund_summaries rs ON rs.invoice_id = i.id

UNION ALL

SELECT
  cc.id,
  cc.client_id,
  cc.value                                     AS amount,
  cc.due_date,
  cc.payment_date,
  cc.status,
  cc.description,
  NULL::TEXT                                   AS asaas_id,
  cc.subscription_id,
  cc.payment_method,
  cc.actual_payment_method,
  cc.notes,
  cc.created_at,
  COALESCE(cc.updated_at, cc.created_at)       AS updated_at,
  'local'::TEXT                                AS source,
  COALESCE(rs.total_refunded, 0)               AS refund_total,
  cc.value - COALESCE(rs.total_refunded, 0)    AS net_amount,
  cc.charge_type,
  cc.reference_months,
  cc.store_id,
  NULL::TEXT                                   AS asaas_subscription_id,
  COALESCE(cc.store_ids, CASE WHEN cc.store_id IS NULL THEN NULL ELSE ARRAY[cc.store_id] END) AS store_ids
FROM client_charges cc
LEFT JOIN refund_summaries rs ON rs.charge_id = cc.id;

COMMENT ON COLUMN client_charges.store_ids IS
  'Lojas da cobrança (comissão de várias lojas numa fatura). Uma loja → store_id preenchido também; várias → store_id NULL.';
COMMENT ON COLUMN invoices.store_ids IS
  'Lojas da cobrança (comissão de várias lojas numa fatura). Uma loja → store_id preenchido também; várias → store_id NULL.';
