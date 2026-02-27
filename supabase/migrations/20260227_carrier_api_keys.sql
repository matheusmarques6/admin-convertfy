-- =====================================================
-- MIGRATION: Add carrier_api_keys to tracking_stores
-- Stores encrypted API keys for individual carriers
-- (TrackingMore, PostNL, etc.)
-- =====================================================

BEGIN;

ALTER TABLE tracking_stores
  ADD COLUMN IF NOT EXISTS carrier_api_keys JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN tracking_stores.carrier_api_keys IS 'Encrypted API keys for individual carriers: { "trackingmore": "enc::...", "postnl": "enc::...", "cainiao": true }';

COMMIT;
