-- Migration: adiciona coluna omnisend_total_orders em store_revenue_summary
-- Data: 2026-04-22
--
-- A Statistics API do Omnisend (Omnisend-Version 2026-03-15) retorna tanto
-- attributedRevenue quanto attributedOrders. Ja tinhamos omnisend_total_revenue
-- mas nao tinhamos a coluna para persistir os pedidos atribuidos, o que
-- impedia o card "Pedidos Atribuidos" de exibir o valor correto no report.

ALTER TABLE store_revenue_summary
  ADD COLUMN IF NOT EXISTS omnisend_total_orders INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN store_revenue_summary.omnisend_total_orders IS
  'Pedidos atribuidos ao Omnisend no periodo (retornado por attributedOrders da Statistics API).';
