-- ============================================================
-- Story 54.1: Add missing period_label column to metrics tables
-- ============================================================
-- The column period_label is used by sync-persistence.service.ts
-- and portal/dashboard/route.ts but was never in a migration.
-- This migration formalizes it so new environments are reproducible.
-- Fully idempotent: safe to run multiple times.

-- ============================================================
-- Step 1: ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE klaviyo_flow_metrics
  ADD COLUMN IF NOT EXISTS period_label TEXT;

ALTER TABLE klaviyo_campaign_metrics
  ADD COLUMN IF NOT EXISTS period_label TEXT;

-- ============================================================
-- Step 2: Backfill rows that have NULL period_label
-- Derive from the difference between period_end and period_start.
-- ============================================================

UPDATE klaviyo_flow_metrics
SET period_label = CASE
  WHEN period_end - period_start <= interval '8 days'  THEN '7d'
  WHEN period_end - period_start <= interval '16 days' THEN '15d'
  WHEN period_end - period_start <= interval '31 days' THEN '30d'
  ELSE '90d'
END
WHERE period_label IS NULL;

UPDATE klaviyo_campaign_metrics
SET period_label = CASE
  WHEN period_end - period_start <= interval '8 days'  THEN '7d'
  WHEN period_end - period_start <= interval '16 days' THEN '15d'
  WHEN period_end - period_start <= interval '31 days' THEN '30d'
  ELSE '90d'
END
WHERE period_label IS NULL;

-- ============================================================
-- Step 3: ADD CHECK constraints (idempotent via pg_constraint)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_flow_metrics_period_label'
  ) THEN
    ALTER TABLE klaviyo_flow_metrics
      ADD CONSTRAINT chk_flow_metrics_period_label
      CHECK (period_label IS NULL OR period_label IN ('7d', '15d', '30d', '90d'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_campaign_metrics_period_label'
  ) THEN
    ALTER TABLE klaviyo_campaign_metrics
      ADD CONSTRAINT chk_campaign_metrics_period_label
      CHECK (period_label IS NULL OR period_label IN ('7d', '15d', '30d', '90d'));
  END IF;
END $$;
