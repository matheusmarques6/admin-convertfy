-- ============================================================
-- invoices.asaas_id ÚNICO (set/2026)
--
-- O espelho local de um pagamento do Asaas nasce em três lugares (sync,
-- webhook e agora sob demanda ao classificar/marcar pago). Todos fazem
-- "existe? senão insere" — sem unicidade no banco, dois em paralelo
-- gravavam a MESMA fatura duas vezes, e a partir daí o `.single()` do
-- sync falhava em "multiple rows" e inseria uma terceira a cada rodada.
-- Índice parcial: asaas_id NULL é cobrança local sem espelho.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_asaas_id
  ON invoices (asaas_id)
  WHERE asaas_id IS NOT NULL;
