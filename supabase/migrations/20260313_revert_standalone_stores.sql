-- Migration: Revert Standalone Stores
-- Reverts 20260224_standalone_stores.sql
-- Removes the ability to have client_stores without a client_id.
-- Re-enforces NOT NULL on client_id across all affected tables.
--
-- Current state (pre-migration):
--   - 16 client_stores rows with client_id IS NULL
--   - 0 orphaned rows in store_alerts, store_onboarding_data, client_onboardings
--   - 0 orphaned agent_store_access rows
--   - Trigger trg_set_store_org_id and function set_store_org_id() exist
--   - Index idx_client_stores_orphan exists
--   - Two INSERT policies allow client_id IS NULL
--
-- NOTE: We intentionally do NOT remove enum values (store_created, store_linked,
-- store_unlinked) from activity_type. PostgreSQL does not support DROP VALUE on
-- enums without a full type recreation, and unused enum values are harmless.

BEGIN;

-- =============================================================================
-- Step 1: Delete standalone stores (client_id IS NULL) from client_stores
-- These are the 16 stores created under the standalone stores feature.
-- CASCADE on FKs will clean up most dependent rows automatically, but we
-- explicitly clean satellite tables first for safety and clarity.
-- =============================================================================

-- Step 2: Delete orphaned rows in satellite tables
-- (rows where client_id IS NULL OR store no longer exists)
-- Even though current counts are 0, this is defensive for any rows
-- created between the time we checked and the migration runs.

DELETE FROM store_alerts
WHERE client_id IS NULL
   OR store_id NOT IN (SELECT id FROM client_stores WHERE client_id IS NOT NULL);

DELETE FROM store_onboarding_data
WHERE client_id IS NULL
   OR store_id NOT IN (SELECT id FROM client_stores WHERE client_id IS NOT NULL);

DELETE FROM client_onboardings
WHERE client_id IS NULL;

-- Step 3: Delete agent_store_access rows for stores that will be deleted
DELETE FROM agent_store_access
WHERE store_id IN (SELECT id FROM client_stores WHERE client_id IS NULL);

-- Now delete the standalone stores themselves
DELETE FROM client_stores WHERE client_id IS NULL;

-- =============================================================================
-- Step 4: Drop trigger trg_set_store_org_id (auto-fill org_id on INSERT)
-- This was only needed because standalone stores might not have org_id
-- from a client relationship. With client_id required, org_id comes from
-- the client's org_id.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_set_store_org_id ON client_stores;

-- =============================================================================
-- Step 5: Drop the function set_store_org_id()
-- =============================================================================

DROP FUNCTION IF EXISTS set_store_org_id();

-- =============================================================================
-- Step 6: Drop the partial index for orphan stores
-- =============================================================================

DROP INDEX IF EXISTS idx_client_stores_orphan;

-- =============================================================================
-- Step 7: Re-enforce NOT NULL on client_id across all affected tables
-- Safe to apply now that all NULL rows have been deleted.
-- =============================================================================

ALTER TABLE client_stores ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE store_alerts ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE store_onboarding_data ALTER COLUMN client_id SET NOT NULL;
ALTER TABLE client_onboardings ALTER COLUMN client_id SET NOT NULL;

-- =============================================================================
-- Step 8: Recreate RLS INSERT policies WITHOUT the client_id IS NULL escape
-- Two policies exist that allow inserting with NULL client_id:
--   1. "Users can insert client_stores" (from 20260224_standalone_stores.sql)
--   2. "Org members can insert client_stores" (from 20260228_cleanup_orphan_policies.sql)
-- Both must be dropped and recreated requiring client_id.
-- =============================================================================

-- Policy 1: Original policy from the standalone stores migration
DROP POLICY IF EXISTS "Users can insert client_stores" ON client_stores;
CREATE POLICY "Users can insert client_stores"
  ON client_stores FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR can_access_client(client_id)
  );

-- Policy 2: Policy from the orphan policies cleanup migration
DROP POLICY IF EXISTS "Org members can insert client_stores" ON client_stores;
CREATE POLICY "Org members can insert client_stores"
  ON client_stores FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR can_access_client(client_id)
  );

COMMIT;
