-- Story 8.17: Cache audience metrics (totalLeads, engagedLeads) in store_revenue_summary
-- These are Klaviyo list/segment snapshots fetched by the cron and cached per store+period.

ALTER TABLE store_revenue_summary
  ADD COLUMN IF NOT EXISTS total_leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engaged_leads integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_rate numeric(5,2) DEFAULT 0;

COMMENT ON COLUMN store_revenue_summary.total_leads IS 'Profile count from largest Klaviyo list';
COMMENT ON COLUMN store_revenue_summary.engaged_leads IS 'Profile count from Engaged 90d segment';
COMMENT ON COLUMN store_revenue_summary.engagement_rate IS 'engagedLeads / totalLeads * 100';
