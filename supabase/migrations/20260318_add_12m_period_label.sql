-- Migration: Add '12m' to period_label CHECK constraints
-- Tables: store_revenue_summary, klaviyo_flow_metrics, klaviyo_campaign_metrics
-- Context: Support 12-month period aggregation in cache tables

BEGIN;

-- 1. store_revenue_summary — does NOT allow NULL
ALTER TABLE store_revenue_summary
  DROP CONSTRAINT IF EXISTS valid_period_label;

ALTER TABLE store_revenue_summary
  ADD CONSTRAINT valid_period_label
  CHECK (period_label IN ('7d', '15d', '30d', '90d', '12m'));

-- 2. klaviyo_flow_metrics — allows NULL
ALTER TABLE klaviyo_flow_metrics
  DROP CONSTRAINT IF EXISTS chk_flow_metrics_period_label;

ALTER TABLE klaviyo_flow_metrics
  ADD CONSTRAINT chk_flow_metrics_period_label
  CHECK (period_label IS NULL OR period_label IN ('7d', '15d', '30d', '90d', '12m'));

-- 3. klaviyo_campaign_metrics — allows NULL
ALTER TABLE klaviyo_campaign_metrics
  DROP CONSTRAINT IF EXISTS chk_campaign_metrics_period_label;

ALTER TABLE klaviyo_campaign_metrics
  ADD CONSTRAINT chk_campaign_metrics_period_label
  CHECK (period_label IS NULL OR period_label IN ('7d', '15d', '30d', '90d', '12m'));

COMMIT;
