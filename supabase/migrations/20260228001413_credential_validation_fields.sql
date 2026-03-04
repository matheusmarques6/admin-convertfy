-- Add credential validation tracking fields to client_stores
-- These fields track real-time validation status of Shopify/Klaviyo credentials

ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS shopify_validated_at TIMESTAMPTZ;
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS shopify_validation_error TEXT;
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS klaviyo_validated_at TIMESTAMPTZ;
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS klaviyo_validation_error TEXT;

-- Add comment for documentation
COMMENT ON COLUMN client_stores.shopify_validated_at IS 'Last successful/attempted Shopify credential validation timestamp';
COMMENT ON COLUMN client_stores.shopify_validation_error IS 'Last Shopify validation error message (null = valid)';
COMMENT ON COLUMN client_stores.klaviyo_validated_at IS 'Last successful/attempted Klaviyo credential validation timestamp';
COMMENT ON COLUMN client_stores.klaviyo_validation_error IS 'Last Klaviyo validation error message (null = valid)';
