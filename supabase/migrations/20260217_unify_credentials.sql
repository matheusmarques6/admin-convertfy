-- Migration: Unify credentials in client_stores
-- Date: 2026-02-17
-- Purpose: Add missing credential fields to client_stores so ALL integrations
--          (OAuth and manual) save to a single table per store.

-- 1. Add Meta credentials fields
ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS meta_access_token TEXT,
  ADD COLUMN IF NOT EXISTS meta_page_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_user_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_ad_account_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_instagram_account_id TEXT;

-- 2. Add Google credentials fields (JSON encrypted blobs)
ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS google_ads_credentials TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_credentials TEXT;

-- 3. Add integration status tracking (JSON)
ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS integration_status JSONB DEFAULT '{}';

-- 4. Add store metadata fields for onboarding
ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS niche VARCHAR(100),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS target_audience TEXT,
  ADD COLUMN IF NOT EXISTS free_shipping_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shopify_collaborator_code TEXT;

-- 5. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_client_stores_client_id ON client_stores(client_id);
CREATE INDEX IF NOT EXISTS idx_client_stores_org_id ON client_stores(org_id);
