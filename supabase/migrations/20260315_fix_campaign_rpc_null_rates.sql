-- Migration: Fix COALESCE returning 0 instead of NULL for rate fields
-- Story 45.4 — Rate fields should be NULL when no Klaviyo data exists,
-- not 0 (which falsely implies "0% open rate" for manual campaigns).
--
-- Count fields (recipients, delivered, opened, clicked, etc.) keep COALESCE
-- because 0 is a valid fallback from the campaigns table.

-- =====================================================
-- 1. REPLACE FUNCTION get_portal_campaigns_with_metrics
-- =====================================================

CREATE OR REPLACE FUNCTION get_portal_campaigns_with_metrics(
  p_store_ids UUID[],
  p_start_date DATE,
  p_end_date DATE,
  p_status TEXT DEFAULT NULL,
  p_channel TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  store_id UUID,
  store_name TEXT,
  name TEXT,
  klaviyo_campaign_id TEXT,
  description TEXT,
  status TEXT,
  channel TEXT,
  campaign_type TEXT,
  scheduled_date DATE,
  scheduled_time TIME,
  send_datetime TIMESTAMPTZ,
  subject_line TEXT,
  segment_name TEXT,
  estimated_recipients INTEGER,
  color TEXT,
  -- metricas enriquecidas (COALESCE: cache > campaigns)
  recipients INTEGER,
  delivered INTEGER,
  opened INTEGER,
  clicked INTEGER,
  converted INTEGER,
  revenue NUMERIC,
  open_rate NUMERIC,
  click_rate NUMERIC,
  bounce_rate NUMERIC,
  conversion_rate NUMERIC,
  delivery_rate NUMERIC,
  click_to_open_rate NUMERIC,
  revenue_per_recipient NUMERIC,
  average_order_value NUMERIC,
  bounced INTEGER,
  unsubscribed INTEGER,
  unsubscribe_rate NUMERIC,
  -- metadata de cache
  has_klaviyo_metrics BOOLEAN,
  metrics_fetched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH latest_metrics AS (
    SELECT DISTINCT ON (km.store_id, km.campaign_id)
      km.store_id,
      km.campaign_id,
      km.recipients     AS km_recipients,
      km.delivered      AS km_delivered,
      km.opened         AS km_opened,
      km.clicked        AS km_clicked,
      km.conversions    AS km_conversions,
      km.conversion_value AS km_revenue,
      km.open_rate      AS km_open_rate,
      km.click_rate     AS km_click_rate,
      km.bounce_rate    AS km_bounce_rate,
      km.conversion_rate AS km_conversion_rate,
      km.delivery_rate  AS km_delivery_rate,
      km.click_to_open_rate AS km_ctor,
      km.revenue_per_recipient AS km_rpr,
      km.average_order_value AS km_aov,
      km.bounced        AS km_bounced,
      km.unsubscribed   AS km_unsubscribed,
      km.unsubscribe_rate AS km_unsub_rate,
      km.fetched_at
    FROM klaviyo_campaign_metrics km
    WHERE km.store_id = ANY(p_store_ids)
    ORDER BY km.store_id, km.campaign_id, km.fetched_at DESC
  )
  SELECT
    c.id,
    c.store_id,
    cs.store_name,
    c.name,
    c.klaviyo_campaign_id,
    c.description,
    c.status::TEXT,
    c.channel::TEXT,
    c.campaign_type::TEXT,
    c.scheduled_date,
    c.scheduled_time,
    c.send_datetime,
    c.subject_line,
    c.segment_name,
    c.estimated_recipients,
    c.color,
    -- Count fields: COALESCE to 0 (valid fallback)
    COALESCE(lm.km_recipients, c.recipients)::INTEGER    AS recipients,
    COALESCE(lm.km_delivered, c.delivered)::INTEGER      AS delivered,
    COALESCE(lm.km_opened, c.opened)::INTEGER           AS opened,
    COALESCE(lm.km_clicked, c.clicked)::INTEGER         AS clicked,
    COALESCE(lm.km_conversions, c.converted)::INTEGER   AS converted,
    COALESCE(lm.km_revenue, c.revenue)::NUMERIC         AS revenue,
    -- Rate fields: NULL when no Klaviyo data (no COALESCE — Story 45.4)
    lm.km_open_rate::NUMERIC                             AS open_rate,
    lm.km_click_rate::NUMERIC                            AS click_rate,
    lm.km_bounce_rate::NUMERIC                           AS bounce_rate,
    lm.km_conversion_rate::NUMERIC                       AS conversion_rate,
    lm.km_delivery_rate::NUMERIC                         AS delivery_rate,
    lm.km_ctor::NUMERIC                                  AS click_to_open_rate,
    lm.km_rpr::NUMERIC                                   AS revenue_per_recipient,
    lm.km_aov::NUMERIC                                   AS average_order_value,
    -- Count fields: COALESCE to 0
    COALESCE(lm.km_bounced, 0)::INTEGER                 AS bounced,
    COALESCE(lm.km_unsubscribed, 0)::INTEGER            AS unsubscribed,
    -- Rate field: NULL when no Klaviyo data
    lm.km_unsub_rate::NUMERIC                            AS unsubscribe_rate,
    -- Metadata
    (lm.fetched_at IS NOT NULL)::BOOLEAN                 AS has_klaviyo_metrics,
    lm.fetched_at                                        AS metrics_fetched_at
  FROM campaigns c
  INNER JOIN client_stores cs ON cs.id = c.store_id
  LEFT JOIN latest_metrics lm
    ON lm.campaign_id = c.klaviyo_campaign_id
    AND lm.store_id = c.store_id
  WHERE c.store_id = ANY(p_store_ids)
    AND c.scheduled_date >= p_start_date
    AND c.scheduled_date < (p_end_date + INTERVAL '1 day')
    AND (p_status IS NULL OR c.status::TEXT = p_status)
    AND (p_channel IS NULL OR c.channel::TEXT = p_channel)
  ORDER BY c.scheduled_date DESC;
END;
$$;

-- =====================================================
-- 2. PERMISSOES
-- =====================================================

REVOKE ALL ON FUNCTION get_portal_campaigns_with_metrics(UUID[], DATE, DATE, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_portal_campaigns_with_metrics(UUID[], DATE, DATE, TEXT, TEXT) TO service_role;
