-- ============================================================================
-- Story 54.9 — Add TTL/Cleanup for Flow/Campaign Metrics Tables
-- ============================================================================
-- Problem: klaviyo_flow_metrics and klaviyo_campaign_metrics have no expires_at
-- column and no cleanup function. Rows from removed/disabled stores persist
-- forever.
--
-- Solution:
--   1. Add expires_at TIMESTAMPTZ (default NULL — existing rows untouched)
--   2. Create clean_expired_metrics() SECURITY DEFINER function
--   3. Verify FK CASCADE already exists (it does — ON DELETE CASCADE from client_stores)
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================================

-- 1. Add expires_at column to both tables
ALTER TABLE klaviyo_flow_metrics
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

ALTER TABLE klaviyo_campaign_metrics
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Partial indexes for cleanup (only rows with expires_at set)
CREATE INDEX IF NOT EXISTS idx_flow_metrics_expires
  ON klaviyo_flow_metrics(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_expires
  ON klaviyo_campaign_metrics(expires_at)
  WHERE expires_at IS NOT NULL;

-- 2. Cleanup function (matches pattern of clean_expired_revenue_summaries)
CREATE OR REPLACE FUNCTION clean_expired_metrics()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_deleted INTEGER;
  v_camp_deleted INTEGER;
BEGIN
  DELETE FROM klaviyo_flow_metrics
  WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_flow_deleted = ROW_COUNT;

  DELETE FROM klaviyo_campaign_metrics
  WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_camp_deleted = ROW_COUNT;

  RETURN v_flow_deleted + v_camp_deleted;
END;
$$;

COMMENT ON FUNCTION clean_expired_metrics() IS
  'Deletes expired rows from klaviyo_flow_metrics and klaviyo_campaign_metrics. '
  'Called by the cron sync-reports job after each sync cycle.';

-- 3. FK CASCADE verification (already exists from table creation):
-- klaviyo_flow_metrics.store_id REFERENCES client_stores(id) ON DELETE CASCADE
-- klaviyo_campaign_metrics.store_id REFERENCES client_stores(id) ON DELETE CASCADE
-- No action needed.
