-- Story 58.4: Add p_store_total_revenue parameter to upsert_custom_range_cache
-- Backward compatible: DEFAULT 0 preserves existing callers (old code omits the param).
-- Deploy this migration BEFORE the code that passes the new parameter.

-- Drop the old 11-param signature to prevent PostgreSQL function overload ambiguity.
-- Without this, both the old (11-param) and new (12-param) functions would coexist,
-- causing PostgREST "function is not unique" errors when called with 11 params.
DROP FUNCTION IF EXISTS upsert_custom_range_cache(UUID, UUID, DATE, DATE, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, NUMERIC, NUMERIC, VARCHAR, TIMESTAMPTZ);

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
  p_expires_at TIMESTAMPTZ,
  p_store_total_revenue NUMERIC DEFAULT 0  -- NEW: Story 58.4
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_label VARCHAR(30);
BEGIN
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
    p_store_total_revenue, p_currency,
    'ok', 'report', p_expires_at, NOW(), NOW(), NOW()
  )
  ON CONFLICT (store_id, period_label)
  DO UPDATE SET
    klaviyo_total_revenue = EXCLUDED.klaviyo_total_revenue,
    klaviyo_campaign_revenue = EXCLUDED.klaviyo_campaign_revenue,
    klaviyo_flow_revenue = EXCLUDED.klaviyo_flow_revenue,
    store_total_revenue = EXCLUDED.store_total_revenue,  -- NEW: Story 58.4
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
  'Builds composite period_label (custom:YYYY-MM-DD:YYYY-MM-DD) to work with PK (store_id, period_label). '
  'Story 58.4: Added p_store_total_revenue parameter.';

-- Preserve SECURITY DEFINER access restrictions
REVOKE EXECUTE ON FUNCTION upsert_custom_range_cache FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION upsert_custom_range_cache FROM authenticated;
GRANT EXECUTE ON FUNCTION upsert_custom_range_cache TO service_role;
