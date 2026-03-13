-- =============================================
-- ROLLBACK: ENFORCE EXPLICIT STORE ACCESS
-- =============================================
-- Reverses migration 20260317_01_enforce_explicit_store_access.sql
--
-- Restores the Story 3.2 behavior (20260226_02_rls_helpers_org_member_access):
--   - Any active org member can view ALL stores in their org.
--   - agent_store_access is only used for granular manage flags.
--
-- NOTE: The backfill rows inserted in STEP 1 of the forward migration are
-- NOT removed here. They are inert once can_access_store() no longer checks
-- them for basic view access. Removing them would risk deleting legitimate
-- can_edit / can_manage_* grants that existed before the migration.
-- If a clean removal is needed, target only rows where notes LIKE 'Auto-backfill%'.
--
-- IMPORTANT: Run this only after verifying no application code depends on
-- the new explicit-access behavior.

BEGIN;

-- =============================================
-- STEP R1: DROP triggers added by 20260317_01
-- =============================================
DROP TRIGGER IF EXISTS trg_auto_assign_store_access ON client_stores;
DROP TRIGGER IF EXISTS trg_auto_assign_member_store_access ON org_members;
DROP FUNCTION IF EXISTS fn_auto_assign_store_access_on_store_insert();
DROP FUNCTION IF EXISTS fn_auto_assign_store_access_on_member_insert();

-- =============================================
-- STEP R2: RESTORE can_access_store() to Story 3.2 behavior
-- =============================================
CREATE OR REPLACE FUNCTION can_access_store(p_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF is_admin() THEN
    RETURN true;
  END IF;

  IF is_org_owner() THEN
    RETURN true;
  END IF;

  -- Any active org member can view stores in their org (Story 3.2 behavior)
  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN client_stores cs ON cs.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND cs.id = p_store_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_store(UUID) IS 'Any active org member can view stores in their org. Restored to Story 3.2 version by ROLLBACK of 20260317_01.';

-- =============================================
-- STEP R3: RESTORE accessible_store_ids() to Story 3.2 behavior
-- =============================================
CREATE OR REPLACE FUNCTION accessible_store_ids()
RETURNS SETOF UUID AS $$
BEGIN
  IF is_admin() THEN
    RETURN QUERY SELECT id FROM client_stores WHERE is_active = true;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT cs.id FROM client_stores cs
    JOIN org_members om ON om.org_id = cs.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND cs.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION accessible_store_ids() IS 'Returns all stores in org for active members. Restored to Story 3.2 version by ROLLBACK of 20260317_01.';

-- =============================================
-- STEP R4: RESTORE can_access_client() to Story 3.2 behavior
-- =============================================
CREATE OR REPLACE FUNCTION can_access_client(p_client_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF is_admin() THEN
    RETURN true;
  END IF;

  IF is_org_owner() THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN clients c ON c.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND c.id = p_client_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_client(UUID) IS 'Any active org member can view clients in their org. Restored to Story 3.2 version by ROLLBACK of 20260317_01.';

-- =============================================
-- STEP R5: RESTORE accessible_client_ids() to Story 3.2 behavior
-- =============================================
CREATE OR REPLACE FUNCTION accessible_client_ids()
RETURNS SETOF UUID AS $$
BEGIN
  IF is_admin() THEN
    RETURN QUERY SELECT id FROM clients;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT c.id FROM clients c
    JOIN org_members om ON om.org_id = c.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION accessible_client_ids() IS 'Returns all clients in org for active members. Restored to Story 3.2 version by ROLLBACK of 20260317_01.';

COMMIT;
