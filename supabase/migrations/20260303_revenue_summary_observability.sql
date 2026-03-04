-- =============================================
-- Migration: Revenue Summary Observability
-- =============================================
-- Adds sync_source, updated_at trigger, and optimized composite index
-- to store_revenue_summary for better debugging and query performance.
-- Epic 11 - Dashboard Store Count Integrity (Story 11.5)

-- 1. sync_source column
ALTER TABLE store_revenue_summary
  ADD COLUMN IF NOT EXISTS sync_source VARCHAR(10) NOT NULL DEFAULT 'cron';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'store_revenue_summary_sync_source_check'
      AND conrelid = 'store_revenue_summary'::regclass
  ) THEN
    ALTER TABLE store_revenue_summary
      ADD CONSTRAINT store_revenue_summary_sync_source_check
      CHECK (sync_source IN ('cron', 'live'));
  END IF;
END $$;

COMMENT ON COLUMN store_revenue_summary.sync_source IS
  'Source of the data: cron (scheduled sync) or live (on-demand fallback)';

-- 2. updated_at column + trigger
ALTER TABLE store_revenue_summary
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_revenue_summary_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revenue_summary_updated_at ON store_revenue_summary;
CREATE TRIGGER trg_revenue_summary_updated_at
  BEFORE UPDATE ON store_revenue_summary
  FOR EACH ROW
  EXECUTE FUNCTION update_revenue_summary_updated_at();

-- 3. Optimized composite index (replaces idx_revenue_summary_org)
DROP INDEX IF EXISTS idx_revenue_summary_org;

CREATE INDEX idx_revenue_summary_org_period_expires
  ON store_revenue_summary(org_id, period_label, expires_at DESC);
