-- Story 45.12 — Add org_id defense-in-depth to portal campaigns RPC
--
-- Adds optional p_org_id parameter. When provided, filters campaigns
-- through client_stores.org_id for defense-in-depth tenant isolation.
-- Backward compatible: p_org_id DEFAULT NULL means existing calls still work.

-- 1. DROP old signature (7 params)
DROP FUNCTION IF EXISTS get_portal_campaigns_with_metrics(UUID[], DATE, DATE, TEXT, TEXT, INT, INT);

-- 2. CREATE new function with p_org_id (8 params)
CREATE OR REPLACE FUNCTION get_portal_campaigns_with_metrics(
  p_store_ids UUID[],
  p_start_date DATE,
  p_end_date DATE,
  p_status TEXT DEFAULT NULL,
  p_channel TEXT DEFAULT NULL,
  p_limit INT DEFAULT 500,
  p_offset INT DEFAULT 0,
  p_org_id UUID DEFAULT NULL
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
  has_klaviyo_metrics BOOLEAN,
  metrics_fetched_at TIMESTAMPTZ,
  source TEXT,
  total_count BIGINT
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
  ),
  campaigns_cte AS (
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
      COALESCE(lm.km_recipients, c.recipients)::INTEGER    AS recipients,
      COALESCE(lm.km_delivered, c.delivered)::INTEGER       AS delivered,
      COALESCE(lm.km_opened, c.opened)::INTEGER            AS opened,
      COALESCE(lm.km_clicked, c.clicked)::INTEGER          AS clicked,
      COALESCE(lm.km_conversions, c.converted)::INTEGER    AS converted,
      COALESCE(lm.km_revenue, c.revenue)::NUMERIC          AS revenue,
      lm.km_open_rate::NUMERIC                              AS open_rate,
      lm.km_click_rate::NUMERIC                             AS click_rate,
      lm.km_bounce_rate::NUMERIC                            AS bounce_rate,
      lm.km_conversion_rate::NUMERIC                        AS conversion_rate,
      lm.km_delivery_rate::NUMERIC                          AS delivery_rate,
      lm.km_ctor::NUMERIC                                   AS click_to_open_rate,
      lm.km_rpr::NUMERIC                                    AS revenue_per_recipient,
      lm.km_aov::NUMERIC                                    AS average_order_value,
      COALESCE(lm.km_bounced, 0)::INTEGER                  AS bounced,
      COALESCE(lm.km_unsubscribed, 0)::INTEGER             AS unsubscribed,
      lm.km_unsub_rate::NUMERIC                             AS unsubscribe_rate,
      (lm.fetched_at IS NOT NULL)::BOOLEAN                  AS has_klaviyo_metrics,
      lm.fetched_at                                         AS metrics_fetched_at,
      CASE WHEN c.klaviyo_campaign_id IS NOT NULL
        THEN 'klaviyo'::TEXT ELSE 'manual'::TEXT
      END                                                    AS source,
      COALESCE(c.send_datetime, c.scheduled_date::TIMESTAMPTZ) AS sort_dt
    FROM campaigns c
    INNER JOIN client_stores cs ON cs.id = c.store_id
    LEFT JOIN latest_metrics lm
      ON lm.campaign_id = c.klaviyo_campaign_id
      AND lm.store_id = c.store_id
    WHERE c.store_id = ANY(p_store_ids)
      AND (p_org_id IS NULL OR cs.org_id = p_org_id)
      AND c.scheduled_date >= p_start_date
      AND c.scheduled_date < (p_end_date + INTERVAL '1 day')
      AND (p_status IS NULL OR c.status::TEXT = p_status)
      AND (p_channel IS NULL OR c.channel::TEXT = p_channel)
  ),
  batches_cte AS (
    SELECT
      cb.id,
      s_id                                                   AS store_id,
      cs.store_name,
      cb.name,
      NULL::TEXT                                              AS klaviyo_campaign_id,
      NULL::TEXT                                              AS description,
      CASE cb.status
        WHEN 'completed'  THEN 'sent'
        WHEN 'processing' THEN 'scheduled'
        WHEN 'failed'     THEN 'cancelled'
        ELSE cb.status
      END                                                    AS status,
      cb.campaign_type::TEXT                                  AS channel,
      cb.campaign_type::TEXT                                  AS campaign_type,
      (cb.scheduled_at AT TIME ZONE 'UTC')::DATE             AS scheduled_date,
      (cb.scheduled_at AT TIME ZONE 'UTC')::TIME             AS scheduled_time,
      cb.scheduled_at                                        AS send_datetime,
      NULL::TEXT                                              AS subject_line,
      NULL::TEXT                                              AS segment_name,
      NULL::INTEGER                                          AS estimated_recipients,
      CASE cb.campaign_type
        WHEN 'sms'      THEN '#10b981'
        WHEN 'whatsapp'  THEN '#25d366'
        ELSE '#3b82f6'
      END                                                    AS color,
      NULL::INTEGER AS recipients,
      NULL::INTEGER AS delivered,
      NULL::INTEGER AS opened,
      NULL::INTEGER AS clicked,
      NULL::INTEGER AS converted,
      NULL::NUMERIC AS revenue,
      NULL::NUMERIC AS open_rate,
      NULL::NUMERIC AS click_rate,
      NULL::NUMERIC AS bounce_rate,
      NULL::NUMERIC AS conversion_rate,
      NULL::NUMERIC AS delivery_rate,
      NULL::NUMERIC AS click_to_open_rate,
      NULL::NUMERIC AS revenue_per_recipient,
      NULL::NUMERIC AS average_order_value,
      NULL::INTEGER AS bounced,
      NULL::INTEGER AS unsubscribed,
      NULL::NUMERIC AS unsubscribe_rate,
      FALSE                                                  AS has_klaviyo_metrics,
      NULL::TIMESTAMPTZ                                      AS metrics_fetched_at,
      'batch'::TEXT                                           AS source,
      cb.scheduled_at                                        AS sort_dt
    FROM campaign_batches cb
    CROSS JOIN LATERAL unnest(cb.store_ids) AS s_id
    INNER JOIN client_stores cs ON cs.id = s_id
    WHERE s_id = ANY(p_store_ids)
      AND (p_org_id IS NULL OR cs.org_id = p_org_id)
      AND cb.scheduled_at::DATE >= p_start_date
      AND cb.scheduled_at::DATE < (p_end_date + INTERVAL '1 day')
      AND (p_status IS NULL OR
           CASE cb.status
             WHEN 'completed'  THEN 'sent'
             WHEN 'processing' THEN 'scheduled'
             WHEN 'failed'     THEN 'cancelled'
             ELSE cb.status
           END = p_status)
      AND (p_channel IS NULL OR
           cb.campaign_type::TEXT = p_channel OR
           (p_channel = 'sms' AND cb.campaign_type IN ('sms', 'whatsapp')))
  ),
  unified AS (
    SELECT * FROM campaigns_cte
    UNION ALL
    SELECT * FROM batches_cte
  )
  SELECT
    u.id, u.store_id, u.store_name, u.name, u.klaviyo_campaign_id,
    u.description, u.status, u.channel, u.campaign_type,
    u.scheduled_date, u.scheduled_time, u.send_datetime,
    u.subject_line, u.segment_name, u.estimated_recipients, u.color,
    u.recipients, u.delivered, u.opened, u.clicked, u.converted, u.revenue,
    u.open_rate, u.click_rate, u.bounce_rate, u.conversion_rate,
    u.delivery_rate, u.click_to_open_rate, u.revenue_per_recipient,
    u.average_order_value, u.bounced, u.unsubscribed, u.unsubscribe_rate,
    u.has_klaviyo_metrics, u.metrics_fetched_at,
    u.source,
    COUNT(*) OVER()                                          AS total_count
  FROM unified u
  ORDER BY u.sort_dt DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 3. PERMISSIONS
REVOKE ALL ON FUNCTION get_portal_campaigns_with_metrics(UUID[], DATE, DATE, TEXT, TEXT, INT, INT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_portal_campaigns_with_metrics(UUID[], DATE, DATE, TEXT, TEXT, INT, INT, UUID) TO service_role;
