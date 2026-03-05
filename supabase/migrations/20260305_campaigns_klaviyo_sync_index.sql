-- Add unique index for Klaviyo campaign sync upsert.
-- Prevents duplicate campaigns per store when syncing from Klaviyo.
-- NULLs are distinct in PostgreSQL unique indexes, so manually-created
-- campaigns (klaviyo_campaign_id = NULL) won't conflict with each other.
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_store_klaviyo_id_unique
  ON campaigns(store_id, klaviyo_campaign_id);

-- Make client_id nullable since auto-synced campaigns resolve client_id
-- from client_stores, and it simplifies the sync code path.
ALTER TABLE campaigns ALTER COLUMN client_id DROP NOT NULL;
