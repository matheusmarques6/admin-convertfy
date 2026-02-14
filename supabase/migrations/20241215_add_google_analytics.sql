-- =====================================================
-- MIGRATION: Add Google Analytics Integration Fields
-- Run this in your Supabase SQL Editor
-- =====================================================

-- Add Google Analytics credential columns to client_stores
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS ga4_property_id VARCHAR(50);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS ga4_credentials JSONB;

-- Add store_name and store_url columns if they don't exist (for consistency)
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS store_name VARCHAR(255);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS store_url VARCHAR(500);

-- Copy data from old columns to new if they exist
UPDATE client_stores SET store_name = name WHERE store_name IS NULL AND name IS NOT NULL;
UPDATE client_stores SET store_url = url WHERE store_url IS NULL AND url IS NOT NULL;

-- =====================================================
-- DONE! Google Analytics fields added.
-- =====================================================
