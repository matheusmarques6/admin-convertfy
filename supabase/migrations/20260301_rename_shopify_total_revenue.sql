-- Story 10.8: Rename shopify_total_revenue -> store_total_revenue
-- The column stores data from Klaviyo metric-aggregates (Placed Order), not Shopify API.
-- This is an atomic DDL operation — no downtime required.

ALTER TABLE store_revenue_summary
  RENAME COLUMN shopify_total_revenue TO store_total_revenue;

COMMENT ON COLUMN store_revenue_summary.store_total_revenue
  IS 'Total store revenue from Klaviyo metric-aggregates (Placed Order). Not from Shopify API directly.';
