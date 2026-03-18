-- =============================================
-- RG-1: Write-through Cache for Custom Ranges
-- =============================================
-- Extends store_revenue_summary to support custom date ranges.
-- Custom ranges use composite period_label: 'custom:YYYY-MM-DD:YYYY-MM-DD'
-- This preserves the existing PK (store_id, period_label) and keeps all
-- cron UPSERT paths working with onConflict: "store_id,period_label".
--
-- CR1 FIX: Does NOT drop the PK. The original migration dropped it,
-- which broke all cron upserts using onConflict: "store_id,period_label".

-- 1. Widen period_label to accommodate 'custom:YYYY-MM-DD:YYYY-MM-DD' (max ~27 chars)
ALTER TABLE store_revenue_summary
  ALTER COLUMN period_label TYPE VARCHAR(30);

-- 2. Drop and re-create valid_period_label CHECK to include custom:% pattern, '1d', '12m'
ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS valid_period_label;
ALTER TABLE store_revenue_summary ADD CONSTRAINT valid_period_label CHECK (
  period_label IN ('7d', '15d', '30d', '90d', '1d', '12m')
  OR period_label LIKE 'custom:%'
);

-- 3. Drop and re-create sync_source CHECK to include 'report'
ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS store_revenue_summary_sync_source_check;
ALTER TABLE store_revenue_summary ADD CONSTRAINT store_revenue_summary_sync_source_check CHECK (
  sync_source IN ('cron', 'live', 'report')
);

-- 4. Add range columns (denormalized for easy querying)
ALTER TABLE store_revenue_summary ADD COLUMN IF NOT EXISTS range_start DATE;
ALTER TABLE store_revenue_summary ADD COLUMN IF NOT EXISTS range_end DATE;

-- 5. CHECK: custom ranges require dates, standard periods forbid them
ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS chk_custom_range_dates;
ALTER TABLE store_revenue_summary ADD CONSTRAINT chk_custom_range_dates CHECK (
  (period_label LIKE 'custom:%' AND range_start IS NOT NULL AND range_end IS NOT NULL)
  OR (period_label NOT LIKE 'custom:%' AND range_start IS NULL AND range_end IS NULL)
);

-- 6. Partial unique index for custom ranges — secondary guarantee on (store_id, range_start, range_end)
-- The PK (store_id, period_label) already guarantees uniqueness per custom range,
-- but this index allows efficient lookups by date range.
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_custom_range
  ON store_revenue_summary (store_id, range_start, range_end)
  WHERE period_label LIKE 'custom:%';

-- 7. RPC function for atomic UPSERT of custom range cache
-- Builds composite period_label from dates, so ON CONFLICT works with PK.
CREATE OR REPLACE FUNCTION upsert_custom_range_cache(
  p_store_id UUID,
  p_org_id UUID,
  p_range_start DATE,
  p_range_end DATE,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_klaviyo_total_revenue NUMERIC,
  p_klaviyo_campaign_revenue NUMERIC,
  p_klaviyo_flow_revenue NUMERIC,
  p_currency VARCHAR,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_label VARCHAR(30);
BEGIN
  -- Build composite period_label: 'custom:2026-01-01:2026-03-18'
  v_period_label := 'custom:' || p_range_start::text || ':' || p_range_end::text;

  INSERT INTO store_revenue_summary (
    store_id, period_label, org_id, range_start, range_end,
    period_start, period_end,
    klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue,
    store_total_revenue, currency,
    sync_status, sync_source, expires_at, fetched_at, created_at, updated_at
  ) VALUES (
    p_store_id, v_period_label, p_org_id, p_range_start, p_range_end,
    p_period_start, p_period_end,
    p_klaviyo_total_revenue, p_klaviyo_campaign_revenue, p_klaviyo_flow_revenue,
    0, p_currency,
    'ok', 'report', p_expires_at, NOW(), NOW(), NOW()
  )
  ON CONFLICT (store_id, period_label)
  DO UPDATE SET
    klaviyo_total_revenue = EXCLUDED.klaviyo_total_revenue,
    klaviyo_campaign_revenue = EXCLUDED.klaviyo_campaign_revenue,
    klaviyo_flow_revenue = EXCLUDED.klaviyo_flow_revenue,
    currency = EXCLUDED.currency,
    sync_status = 'ok',
    sync_error = NULL,
    expires_at = EXCLUDED.expires_at,
    fetched_at = NOW(),
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION upsert_custom_range_cache IS
  'Atomic UPSERT for custom range cache rows in store_revenue_summary. '
  'Builds composite period_label (custom:YYYY-MM-DD:YYYY-MM-DD) to work with PK (store_id, period_label).';

-- H2: Restrict SECURITY DEFINER RPC to service_role only
REVOKE EXECUTE ON FUNCTION upsert_custom_range_cache FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upsert_custom_range_cache FROM authenticated;
GRANT EXECUTE ON FUNCTION upsert_custom_range_cache TO service_role;

-- =============================================
-- ROLLBACK SQL (run manually if needed)
-- =============================================
-- Before restoring original CHECK, delete any custom rows
-- DELETE FROM store_revenue_summary WHERE period_label LIKE 'custom:%';
--
-- DROP FUNCTION IF EXISTS upsert_custom_range_cache;
-- DROP INDEX IF EXISTS uq_store_custom_range;
-- ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS chk_custom_range_dates;
-- ALTER TABLE store_revenue_summary DROP COLUMN IF EXISTS range_end;
-- ALTER TABLE store_revenue_summary DROP COLUMN IF EXISTS range_start;
-- ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS store_revenue_summary_sync_source_check;
-- ALTER TABLE store_revenue_summary ADD CONSTRAINT store_revenue_summary_sync_source_check CHECK (sync_source IN ('cron', 'live'));
-- ALTER TABLE store_revenue_summary DROP CONSTRAINT IF EXISTS valid_period_label;
-- ALTER TABLE store_revenue_summary ADD CONSTRAINT valid_period_label CHECK (period_label IN ('7d', '15d', '30d', '90d', '1d', '12m'));
-- ALTER TABLE store_revenue_summary ALTER COLUMN period_label TYPE VARCHAR(10);
