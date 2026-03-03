-- Add currency column to store_revenue_summary
-- Tracks the original currency of Klaviyo revenue data (from account preferred_currency)
ALTER TABLE store_revenue_summary
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'BRL';

COMMENT ON COLUMN store_revenue_summary.currency IS
  'ISO 4217 currency code from Klaviyo account (e.g. USD, BRL, EUR). Revenue values are stored in original currency.';
