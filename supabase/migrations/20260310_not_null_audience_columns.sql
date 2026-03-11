-- Story 33.2: Add NOT NULL constraints to audience columns on store_revenue_summary.
-- This migration runs AFTER 20260310_check_constraints_engagement.sql (CHECK constraints).
--
-- Step 1: Backfill any NULL values to 0.
-- Step 2: Add NOT NULL constraints (idempotent — skips if already NOT NULL).

-- ============================================================
-- Step 1: Backfill NULLs to 0
-- ============================================================

UPDATE store_revenue_summary
  SET total_leads    = COALESCE(total_leads, 0),
      engaged_leads  = COALESCE(engaged_leads, 0),
      engagement_rate = COALESCE(engagement_rate, 0)
  WHERE total_leads IS NULL
     OR engaged_leads IS NULL
     OR engagement_rate IS NULL;

-- ============================================================
-- Step 2: Add NOT NULL constraints (idempotent)
-- ============================================================

DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'store_revenue_summary'
       AND column_name  IN ('total_leads', 'engaged_leads', 'engagement_rate')
       AND is_nullable   = 'YES'
  LOOP
    EXECUTE format(
      'ALTER TABLE store_revenue_summary ALTER COLUMN %I SET NOT NULL',
      col.column_name
    );
  END LOOP;
END $$;
