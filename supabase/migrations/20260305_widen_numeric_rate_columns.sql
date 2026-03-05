-- Fix "numeric field overflow" errors caused by restrictive precision on rate columns.
-- Klaviyo API can return rate values that overflow numeric(5,2) (max 999.99).
-- Widen all rate/percentage columns to unconstrained numeric.
-- Must drop and recreate dependent views first.

-- Drop dependent views
DROP VIEW IF EXISTS v_campaigns_by_revenue;
DROP VIEW IF EXISTS v_flows_by_revenue;

-- klaviyo_campaign_metrics: widen rate columns
ALTER TABLE klaviyo_campaign_metrics
  ALTER COLUMN delivery_rate TYPE numeric,
  ALTER COLUMN open_rate TYPE numeric,
  ALTER COLUMN click_rate TYPE numeric,
  ALTER COLUMN click_to_open_rate TYPE numeric,
  ALTER COLUMN conversion_rate TYPE numeric,
  ALTER COLUMN bounce_rate TYPE numeric,
  ALTER COLUMN unsubscribe_rate TYPE numeric,
  ALTER COLUMN spam_rate TYPE numeric;

-- klaviyo_flow_metrics: widen rate columns
ALTER TABLE klaviyo_flow_metrics
  ALTER COLUMN delivery_rate TYPE numeric,
  ALTER COLUMN open_rate TYPE numeric,
  ALTER COLUMN click_rate TYPE numeric,
  ALTER COLUMN click_to_open_rate TYPE numeric,
  ALTER COLUMN conversion_rate TYPE numeric,
  ALTER COLUMN bounce_rate TYPE numeric,
  ALTER COLUMN unsubscribe_rate TYPE numeric,
  ALTER COLUMN spam_rate TYPE numeric;

-- store_revenue_summary: widen engagement_rate
ALTER TABLE store_revenue_summary
  ALTER COLUMN engagement_rate TYPE numeric;

-- Recreate views with same definitions
CREATE VIEW v_campaigns_by_revenue AS
SELECT cm.id, cm.store_id, cm.campaign_id, cm.campaign_name, cm.campaign_status,
       cm.send_time, cm.subject, cm.channel, cm.period_start, cm.period_end,
       cm.recipients, cm.delivered, cm.delivery_rate, cm.opened, cm.open_rate,
       cm.clicked, cm.click_rate, cm.click_to_open_rate, cm.conversions,
       cm.conversion_rate, cm.conversion_value, cm.revenue_per_recipient,
       cm.average_order_value, cm.bounced, cm.bounce_rate, cm.unsubscribed,
       cm.unsubscribe_rate, cm.spam_complaints, cm.spam_rate, cm.fetched_at,
       s.store_name, c.name AS client_name
FROM klaviyo_campaign_metrics cm
JOIN client_stores s ON cm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY cm.conversion_value DESC;

CREATE VIEW v_flows_by_revenue AS
SELECT fm.id, fm.store_id, fm.flow_id, fm.flow_name, fm.flow_status,
       fm.trigger_type, fm.period_start, fm.period_end,
       fm.recipients, fm.delivered, fm.delivery_rate, fm.opened, fm.open_rate,
       fm.clicked, fm.click_rate, fm.click_to_open_rate, fm.conversions,
       fm.conversion_rate, fm.conversion_value, fm.revenue_per_recipient,
       fm.average_order_value, fm.bounced, fm.bounce_rate, fm.unsubscribed,
       fm.unsubscribe_rate, fm.spam_complaints, fm.spam_rate,
       fm.sms_delivered, fm.sms_clicked, fm.sms_conversion_value,
       fm.fetched_at, s.store_name, c.name AS client_name
FROM klaviyo_flow_metrics fm
JOIN client_stores s ON fm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY fm.conversion_value DESC;
