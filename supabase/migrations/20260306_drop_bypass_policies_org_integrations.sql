-- =============================================
-- SECURITY HOTFIX: Drop bypass RLS policies + add org_id to integrations
-- Story 15.6
-- =============================================
-- CRITICAL: 4 tables have USING(true) bypass policies in production that
-- allow ANY authenticated user to access ALL data across ALL organizations.
--
-- This migration:
--   1. Adds org_id to integrations + backfills existing row
--   2. DROPs all 4 bypass policies
--   3. Creates org-scoped replacement policies for integrations and contracts
--   4. deals and reports already have sufficient granular policies
--
-- IDEMPOTENT: Safe to re-run (all operations use IF EXISTS / IF NOT EXISTS)
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: Add org_id to integrations table
-- =============================================
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Backfill: assign all existing integrations to the single org
UPDATE integrations
SET org_id = 'd1ae3cf9-558d-40cc-9272-4a5633894ef8'
WHERE org_id IS NULL;

-- Create index for RLS performance
CREATE INDEX IF NOT EXISTS idx_integrations_org_id ON integrations(org_id);

COMMENT ON COLUMN integrations.org_id IS 'Organization that owns this integration (added in Story 15.6 security hotfix)';

-- =============================================
-- STEP 2: DROP all 4 bypass policies
-- =============================================

-- 2a. integrations: "Authenticated users can manage integrations" → ALL → USING(true)
DROP POLICY IF EXISTS "Authenticated users can manage integrations" ON integrations;

-- 2b. contracts: "Authenticated users can manage contracts" → ALL → USING(true)
DROP POLICY IF EXISTS "Authenticated users can manage contracts" ON contracts;

-- 2c. deals: "Authenticated users can manage deals" → ALL → USING(true)
DROP POLICY IF EXISTS "Authenticated users can manage deals" ON deals;

-- 2d. reports: "Authenticated users can manage reports" → ALL → USING(true)
DROP POLICY IF EXISTS "Authenticated users can manage reports" ON reports;

-- =============================================
-- STEP 3: Replacement policies for integrations
-- =============================================
-- Existing policy kept: "Users can view integrations" → SELECT → is_admin()
-- Need to add: org_member SELECT + admin/owner write

-- Drop existing SELECT policy to recreate with org scope
DROP POLICY IF EXISTS "Users can view integrations" ON integrations;

-- 3a. SELECT: any active org member can view their org's integrations
CREATE POLICY "Org members can view integrations"
  ON integrations FOR SELECT TO authenticated
  USING (
    is_admin()
    OR org_id = current_org_id()
  );

-- 3b. INSERT/UPDATE/DELETE: admin or org owner only
CREATE POLICY "Admin or owner can manage integrations"
  ON integrations FOR ALL TO authenticated
  USING (
    is_admin()
    OR is_org_owner(org_id)
  )
  WITH CHECK (
    is_admin()
    OR (is_org_owner(current_org_id()) AND (org_id = current_org_id()))
  );

-- =============================================
-- STEP 4: Replacement policies for contracts
-- =============================================
-- contracts has 0 rows, no org_id, but has client_id FK
-- Need SELECT + manage policies scoped via client ownership

-- 4a. SELECT: org members who can access the client
CREATE POLICY "Org members can view contracts"
  ON contracts FOR SELECT TO authenticated
  USING (
    is_admin()
    OR can_access_client(client_id)
  );

-- 4b. INSERT/UPDATE/DELETE: admin or org owner of the client's org
CREATE POLICY "Admin or owner can manage contracts"
  ON contracts FOR ALL TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = contracts.client_id
      AND is_org_owner(c.org_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = contracts.client_id
      AND is_org_owner(c.org_id)
    )
  );

-- =============================================
-- STEP 5: Verification comments
-- =============================================
COMMENT ON POLICY "Org members can view integrations" ON integrations IS 'Story 15.6: Replaces USING(true) bypass. Org members see their org integrations.';
COMMENT ON POLICY "Admin or owner can manage integrations" ON integrations IS 'Story 15.6: Only admin/owner can modify integrations.';
COMMENT ON POLICY "Org members can view contracts" ON contracts IS 'Story 15.6: Replaces USING(true) bypass. Scoped via can_access_client.';
COMMENT ON POLICY "Admin or owner can manage contracts" ON contracts IS 'Story 15.6: Only admin/owner can modify contracts.';

-- =============================================
-- STEP 6: Make org_id NOT NULL now that all rows are backfilled
-- =============================================
ALTER TABLE integrations ALTER COLUMN org_id SET NOT NULL;

COMMIT;
