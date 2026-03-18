-- Migration: Ensure '1d' is included in period_label CHECK constraints
-- Context: AK-13 — Write-Through Cache for 1d period.
-- The RG-1 migration (20260318_report_generation_cache.sql) already added '1d'
-- to store_revenue_summary. This migration is a safety net in case migrations
-- run in different order, and also adds '1d' to flow/campaign metrics tables.

BEGIN;

-- 1. store_revenue_summary — ensure '1d' is present (idempotent)
ALTER TABLE store_revenue_summary
  DROP CONSTRAINT IF EXISTS valid_period_label;

ALTER TABLE store_revenue_summary
  ADD CONSTRAINT valid_period_label CHECK (
    period_label IN ('7d', '15d', '30d', '90d', '1d', '12m', 'custom')
  );

-- 2. klaviyo_flow_metrics — add '1d' (allows NULL)
ALTER TABLE klaviyo_flow_metrics
  DROP CONSTRAINT IF EXISTS chk_flow_metrics_period_label;

ALTER TABLE klaviyo_flow_metrics
  ADD CONSTRAINT chk_flow_metrics_period_label
  CHECK (period_label IS NULL OR period_label IN ('7d', '15d', '30d', '90d', '1d', '12m'));

-- 3. klaviyo_campaign_metrics — add '1d' (allows NULL)
ALTER TABLE klaviyo_campaign_metrics
  DROP CONSTRAINT IF EXISTS chk_campaign_metrics_period_label;

ALTER TABLE klaviyo_campaign_metrics
  ADD CONSTRAINT chk_campaign_metrics_period_label
  CHECK (period_label IS NULL OR period_label IN ('7d', '15d', '30d', '90d', '1d', '12m'));

COMMIT;
