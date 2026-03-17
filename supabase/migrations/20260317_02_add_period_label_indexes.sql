-- Story 54.4: Add missing indexes on period_label for metrics tables
-- These indexes support the frequent queries:
--   .eq("store_id", storeId).eq("period_label", period)
-- on both flow and campaign metrics tables.

CREATE INDEX IF NOT EXISTS idx_flow_metrics_store_period
  ON klaviyo_flow_metrics(store_id, period_label);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_store_period
  ON klaviyo_campaign_metrics(store_id, period_label);
