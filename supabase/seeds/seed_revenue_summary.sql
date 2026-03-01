-- =============================================
-- seed_revenue_summary.sql
-- =============================================
-- One-time seed: popula store_revenue_summary com dados existentes
-- em klaviyo_flow_metrics e klaviyo_campaign_metrics.
--
-- Quando rodar: APOS aplicar migration 20260228_store_revenue_summary.sql,
--               ANTES do cron normal assumir.
--
-- Idempotente: usa INSERT ... ON CONFLICT (store_id, period_label) DO UPDATE.
-- Seguro para rodar multiplas vezes sem duplicar dados.
--
-- Periodo: 30d (mais usado no dashboard)
-- expires_at: NOW() + 6 horas (cron normal sobrescreve depois)
-- =============================================

DO $$
DECLARE
  v_inserted  INTEGER := 0;
  v_skipped   INTEGER := 0;
  v_total     INTEGER := 0;
BEGIN

  -- Count stores that have metrics but no org_id (will be skipped)
  SELECT COUNT(DISTINCT sub.store_id) INTO v_skipped
  FROM (
    SELECT DISTINCT fm.store_id FROM klaviyo_flow_metrics fm
    UNION
    SELECT DISTINCT cm.store_id FROM klaviyo_campaign_metrics cm
  ) sub
  JOIN client_stores cs ON cs.id = sub.store_id
  WHERE cs.org_id IS NULL;

  IF v_skipped > 0 THEN
    RAISE NOTICE '[seed_revenue_summary] % stores skipped (org_id IS NULL)', v_skipped;
  END IF;

  -- Main upsert: aggregate flow + campaign revenue per store for period 30d
  WITH flow_totals AS (
    SELECT
      fm.store_id,
      SUM(fm.conversion_value) AS flow_revenue
    FROM klaviyo_flow_metrics fm
    WHERE fm.period_start >= (NOW() - INTERVAL '35 days')
      AND fm.period_end   <= (NOW() + INTERVAL '1 day')
    GROUP BY fm.store_id
  ),
  campaign_totals AS (
    SELECT
      cm.store_id,
      SUM(cm.conversion_value) AS campaign_revenue
    FROM klaviyo_campaign_metrics cm
    WHERE cm.period_start >= (NOW() - INTERVAL '35 days')
      AND cm.period_end   <= (NOW() + INTERVAL '1 day')
    GROUP BY cm.store_id
  ),
  combined AS (
    SELECT
      COALESCE(ft.store_id, ct.store_id) AS store_id,
      cs.org_id,
      COALESCE(ft.flow_revenue, 0) AS flow_revenue,
      COALESCE(ct.campaign_revenue, 0) AS campaign_revenue
    FROM flow_totals ft
    FULL OUTER JOIN campaign_totals ct ON ft.store_id = ct.store_id
    JOIN client_stores cs ON cs.id = COALESCE(ft.store_id, ct.store_id)
    WHERE cs.org_id IS NOT NULL
      AND (COALESCE(ft.flow_revenue, 0) + COALESCE(ct.campaign_revenue, 0)) > 0
  )
  INSERT INTO store_revenue_summary (
    store_id, org_id, period_label,
    period_start, period_end,
    klaviyo_total_revenue, klaviyo_campaign_revenue, klaviyo_flow_revenue,
    shopify_total_revenue, sync_status, sync_error,
    expires_at, fetched_at
  )
  SELECT
    c.store_id,
    c.org_id,
    '30d',
    NOW() - INTERVAL '30 days',
    NOW(),
    c.flow_revenue + c.campaign_revenue,
    c.campaign_revenue,
    c.flow_revenue,
    0,
    'ok',
    NULL,
    NOW() + INTERVAL '6 hours',
    NOW()
  FROM combined c
  ON CONFLICT (store_id, period_label) DO UPDATE SET
    klaviyo_total_revenue    = EXCLUDED.klaviyo_total_revenue,
    klaviyo_campaign_revenue = EXCLUDED.klaviyo_campaign_revenue,
    klaviyo_flow_revenue     = EXCLUDED.klaviyo_flow_revenue,
    sync_status              = 'ok',
    sync_error               = NULL,
    expires_at               = EXCLUDED.expires_at,
    fetched_at               = NOW();

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Count total stores that now have a 30d row
  SELECT COUNT(*) INTO v_total
  FROM store_revenue_summary
  WHERE period_label = '30d';

  RAISE NOTICE '[seed_revenue_summary] Done: % rows upserted, % total rows for 30d, % stores skipped (no org_id)',
    v_inserted, v_total, v_skipped;

END;
$$;

-- =============================================
-- Verification queries (run manually after seed)
-- =============================================

-- 1. Check total revenue seeded
-- SELECT SUM(klaviyo_total_revenue) AS total_seeded FROM store_revenue_summary WHERE period_label = '30d';

-- 2. Compare with source tables (should be approximately equal)
-- SELECT
--   (SELECT COALESCE(SUM(conversion_value), 0) FROM klaviyo_flow_metrics
--    WHERE period_start >= (NOW() - INTERVAL '35 days')) +
--   (SELECT COALESCE(SUM(conversion_value), 0) FROM klaviyo_campaign_metrics
--    WHERE period_start >= (NOW() - INTERVAL '35 days'))
-- AS source_total;

-- 3. Check for stores with metrics but missing from summary (should return 0)
-- SELECT COUNT(DISTINCT fm.store_id) FROM klaviyo_flow_metrics fm
-- JOIN client_stores cs ON cs.id = fm.store_id
-- WHERE cs.org_id IS NOT NULL
--   AND NOT EXISTS (
--     SELECT 1 FROM store_revenue_summary srs
--     WHERE srs.store_id = fm.store_id AND srs.period_label = '30d'
--   );
