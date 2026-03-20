-- Story 58.2: Cleanup poisoned cache rows where flow report failed silently
-- (flowRevenue=0 but campaignRevenue>0 indicates the flow API returned null).
--
-- IMPORTANT: This migration should run AFTER the code guard (Story 58.2) is deployed
-- to prevent re-poisoning. The guard blocks new partial writes.
--
-- Only targets 'live' and 'report' sync_source — cron-written rows already have
-- partial-data protection via sync-persistence.service.ts.

-- 1. Clean poisoned custom range rows
DELETE FROM store_revenue_summary
WHERE period_label LIKE 'custom:%'
  AND klaviyo_flow_revenue = 0
  AND klaviyo_campaign_revenue > 0
  AND sync_source IN ('live', 'report');

-- 2. Clean poisoned 1d rows
DELETE FROM store_revenue_summary
WHERE period_label = '1d'
  AND klaviyo_flow_revenue = 0
  AND klaviyo_campaign_revenue > 0
  AND sync_source = 'live';
