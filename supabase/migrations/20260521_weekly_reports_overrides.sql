-- ============================================================
-- Weekly Reports: overrides manuais + paid_orders
--
-- Adiciona suporte a:
--  1. metrics_overrides (jsonb) — campos sobrescritos manualmente
--     pelo CM quando o auto-gerado veio errado. Merged sobre metrics
--     na hora de servir.
--  2. paid_orders no metrics — quantidade e valor de pedidos pagos
--     no periodo. Auto-populado de tracking_orders quando disponivel,
--     editavel manualmente.
--
-- Idempotente: pode rodar varias vezes.
-- ============================================================

-- ── metrics_overrides + audit fields ────────────────────────
ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS metrics_overrides JSONB DEFAULT '{}'::jsonb;

ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS edited_by UUID REFERENCES profiles(id);

ALTER TABLE weekly_reports
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

COMMENT ON COLUMN weekly_reports.metrics_overrides IS
  'Overrides manuais que sobrescrevem campos do metrics auto-gerado. Estrutura espelha metrics: { revenue: { current: N }, paid_orders: { count: N, value: N }, ... }';

COMMENT ON COLUMN weekly_reports.edited_by IS
  'Quem editou o relatorio manualmente pela ultima vez.';

COMMENT ON COLUMN weekly_reports.edited_at IS
  'Quando foi editado pela ultima vez. NULL = nunca editado.';

-- Pre-flight check (nao destrutivo)
DO $$
DECLARE
  has_overrides BOOLEAN;
  has_paid_orders_data BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weekly_reports' AND column_name = 'metrics_overrides'
  ) INTO has_overrides;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'tracking_orders'
  ) INTO has_paid_orders_data;

  RAISE NOTICE 'weekly_reports.metrics_overrides .. %', CASE WHEN has_overrides THEN 'OK' ELSE 'FALTA' END;
  RAISE NOTICE 'tracking_orders (fonte auto) ..... %', CASE WHEN has_paid_orders_data THEN 'DISPONIVEL' ELSE 'AUSENTE — paid_orders sera manual' END;
END $$;
