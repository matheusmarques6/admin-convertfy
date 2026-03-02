-- Add columns to track Klaviyo scope validation results
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS klaviyo_missing_scopes TEXT[];
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS klaviyo_has_reporting_access BOOLEAN;
