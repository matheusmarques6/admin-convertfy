-- Story 33.2: Add CHECK constraints for engagement rate columns on store_revenue_summary.
-- Prerequisite: Story 33.1 (app-level fix) must be deployed before applying this migration.
--
-- Step 1: Correct any existing rows that would violate the new constraints.
-- Step 2: Add CHECK constraints (idempotent via pg_constraint lookup).

-- ============================================================
-- Step 1: Fix existing data
-- ============================================================

-- Cap engagement_rate at 100 for existing rows
UPDATE store_revenue_summary
  SET engagement_rate = 100
  WHERE engagement_rate > 100;

-- Ensure no negative values
UPDATE store_revenue_summary
  SET total_leads = 0
  WHERE total_leads < 0;

UPDATE store_revenue_summary
  SET engaged_leads = 0
  WHERE engaged_leads < 0;

UPDATE store_revenue_summary
  SET engagement_rate = 0
  WHERE engagement_rate < 0;

-- ============================================================
-- Step 2: Add CHECK constraints (idempotent)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_total_leads_non_negative'
  ) THEN
    ALTER TABLE store_revenue_summary
      ADD CONSTRAINT chk_total_leads_non_negative CHECK (total_leads >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_engaged_leads_non_negative'
  ) THEN
    ALTER TABLE store_revenue_summary
      ADD CONSTRAINT chk_engaged_leads_non_negative CHECK (engaged_leads >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_engagement_rate_range'
  ) THEN
    ALTER TABLE store_revenue_summary
      ADD CONSTRAINT chk_engagement_rate_range CHECK (engagement_rate >= 0 AND engagement_rate <= 100);
  END IF;
END $$;
