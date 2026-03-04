-- Add store_orders column to store_revenue_summary
-- QA Finding F3: storeOrders was computed by syncKlaviyoForPeriod but never persisted.
ALTER TABLE store_revenue_summary
  ADD COLUMN IF NOT EXISTS store_orders INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN store_revenue_summary.store_orders IS
  'Total Placed Order count from Klaviyo metric-aggregates for the period.';
