-- =============================================
-- ENFORCE EXPLICIT STORE-LEVEL ACCESS
-- =============================================
-- Reverses Story 3.2 (20260226_02_rls_helpers_org_member_access.sql) which
-- allowed ANY active org member to view ALL stores in their org.
--
-- New rule: non-owner/non-admin members MUST have an explicit
-- agent_store_access row with can_view = true to access a store.
--
-- Owners and admins retain full bypass (unchanged).
--
-- Safety:
--   - Backfills agent_store_access for ALL existing active non-owner members
--     (one row per member per in-org store, can_view=true, all manage flags=false)
--     before the helpers are replaced, so no member loses access abruptly.
--   - All operations are idempotent (ON CONFLICT DO NOTHING).
--   - Wrapped in a transaction so rollback is atomic.
--
-- Rollback: see companion file 20260317_01_ROLLBACK_enforce_explicit_store_access.sql

BEGIN;

-- =============================================
-- STEP 1: BACKFILL agent_store_access
-- =============================================
-- Give every active member (including owners) view access to every store in their org.
-- Owners already bypass agent_store_access via role='owner' checks, but rows are
-- inserted for consistency — if an owner is later demoted, they retain access.
-- This preserves existing access — no member sees fewer stores than before.
-- Granular flags (can_edit, can_manage_*) default to false and must be
-- explicitly granted by an owner/admin afterward.
--
-- Uses ON CONFLICT DO NOTHING so:
--   - Existing rows are preserved (including custom can_edit / manage flags).
--   - Duplicate runs are safe.

INSERT INTO agent_store_access (
  org_member_id,
  store_id,
  can_view,
  can_edit,
  can_manage_onboarding,
  can_manage_campaigns,
  can_manage_reports,
  assigned_by,
  assigned_at,
  notes
)
SELECT
  om.id                      AS org_member_id,
  cs.id                      AS store_id,
  true                       AS can_view,
  false                      AS can_edit,
  false                      AS can_manage_onboarding,
  false                      AS can_manage_campaigns,
  false                      AS can_manage_reports,
  -- assigned_by: use the first owner of the same org, or NULL if none
  (
    SELECT om2.profile_id
    FROM   org_members om2
    WHERE  om2.org_id    = om.org_id
    AND    om2.role      = 'owner'
    AND    om2.is_active = true
    ORDER  BY om2.created_at
    LIMIT  1
  )                          AS assigned_by,
  NOW()                      AS assigned_at,
  'Auto-backfill: enforce_explicit_store_access migration 20260317' AS notes
FROM org_members om
JOIN client_stores cs ON cs.org_id = om.org_id
WHERE om.is_active  = true
  -- All active members get rows, including owners (for demotion safety).
  -- Owners bypass agent_store_access at runtime via role='owner' checks.
ON CONFLICT (org_member_id, store_id) DO NOTHING;

-- =============================================
-- STEP 2: REPLACE can_access_store()
-- =============================================
-- Restores the original _05_rls_helpers behaviour:
-- non-owner/non-admin members must have can_view = true in agent_store_access.
--
-- NOTE: Does NOT use is_org_owner() (no-param variant) because it was deprecated
-- in 20260304_fix_is_org_owner_isolation.sql — it returns true for owners of ANY
-- org, causing a cross-org leak.  Instead we inline the org-scoped owner check
-- via org_members JOIN.

CREATE OR REPLACE FUNCTION can_access_store(p_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- System admin bypasses all restrictions
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Check org membership + either owner role OR explicit store grant
  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN client_stores cs ON cs.org_id = om.org_id AND cs.id = p_store_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND (
      om.role = 'owner'
      OR EXISTS (
        SELECT 1 FROM agent_store_access asa
        WHERE asa.org_member_id = om.id
        AND asa.store_id = p_store_id
        AND asa.can_view = true
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_store(UUID) IS
  'Returns true if the current user may view the given store. '
  'Admins bypass unconditionally. Org owners bypass within their own org '
  '(scoped via org_members JOIN, NOT the deprecated is_org_owner()). '
  'All other members require an explicit agent_store_access row with can_view=true. '
  'Replaces the Story 3.2 version (20260226_02) which granted blanket org-level access. '
  'Updated by migration 20260317_01.';

-- =============================================
-- STEP 3: REPLACE accessible_store_ids()
-- =============================================
-- Fixes two issues present in the _05 version:
--   1. Story 3.2 overrode this to return ALL in-org stores (no explicit check).
--   2. The _05 version had a SETOF bug: after RETURN QUERY for admin/owner
--      execution continued into the member branch (double rows).
-- This version uses explicit RETURN after the admin/owner branch.
--
-- NOTE: Does NOT use is_org_owner() (no-param variant) — see Step 2 comment.
-- Owner check is inlined via org_members.role = 'owner'.

CREATE OR REPLACE FUNCTION accessible_store_ids()
RETURNS SETOF UUID AS $$
BEGIN
  -- Admin: all stores across all orgs
  IF is_admin() THEN
    RETURN QUERY SELECT id FROM client_stores WHERE is_active = true;
    RETURN; -- ← explicit RETURN prevents fall-through into member branch
  END IF;

  -- Org owner: all active stores in their org (scoped via org_members JOIN)
  -- Combined with member branch: owners get all org stores, members get granted stores
  RETURN QUERY
    SELECT DISTINCT cs.id
    FROM org_members om
    JOIN client_stores cs ON cs.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND cs.is_active = true
    AND (
      om.role = 'owner'
      OR EXISTS (
        SELECT 1 FROM agent_store_access asa
        WHERE asa.org_member_id = om.id
        AND asa.store_id = cs.id
        AND asa.can_view = true
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION accessible_store_ids() IS
  'Returns the set of store UUIDs the current user may access. '
  'Admins see all stores; owners see all stores in their org '
  '(scoped via org_members JOIN, NOT the deprecated is_org_owner()); '
  'members see only explicitly granted stores (agent_store_access.can_view=true). '
  'Also fixes the SETOF fall-through bug present in the _05 version. '
  'Updated by migration 20260317_01.';

-- =============================================
-- STEP 4: REPLACE can_access_client()
-- =============================================
-- A client is accessible if the user can access at least one of its stores.
-- Story 3.2 overrode this with a blanket org-id check; we restore store-gating.
--
-- NOTE: Does NOT use is_org_owner() (no-param variant) — see Step 2 comment.

CREATE OR REPLACE FUNCTION can_access_client(p_client_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Check org membership + either owner role OR explicit store grant for a client store
  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN client_stores cs ON cs.org_id = om.org_id AND cs.client_id = p_client_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND (
      om.role = 'owner'
      OR EXISTS (
        SELECT 1 FROM agent_store_access asa
        WHERE asa.org_member_id = om.id
        AND asa.store_id = cs.id
        AND asa.can_view = true
      )
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_client(UUID) IS
  'Returns true if the current user can access the given client '
  '(i.e., they are an org owner or have can_view=true on at least one of the client''s stores). '
  'Admins bypass unconditionally. Owner check is org-scoped via org_members JOIN. '
  'Updated by migration 20260317_01.';

-- =============================================
-- STEP 5: REPLACE accessible_client_ids()
-- =============================================
-- Same pattern: clients reachable through accessible stores only.
--
-- NOTE: Does NOT use is_org_owner() (no-param variant) — see Step 2 comment.

CREATE OR REPLACE FUNCTION accessible_client_ids()
RETURNS SETOF UUID AS $$
BEGIN
  IF is_admin() THEN
    RETURN QUERY SELECT id FROM clients;
    RETURN;
  END IF;

  -- Owners see all clients in their org; members see only clients
  -- reachable through their explicitly granted stores.
  RETURN QUERY
    SELECT DISTINCT c.id
    FROM org_members om
    JOIN clients c ON c.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND (
      om.role = 'owner'
      OR EXISTS (
        SELECT 1 FROM client_stores cs
        JOIN agent_store_access asa ON asa.store_id = cs.id
        WHERE cs.client_id = c.id
        AND asa.org_member_id = om.id
        AND asa.can_view = true
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION accessible_client_ids() IS
  'Returns the set of client UUIDs the current user may access. '
  'Admins see all clients; owners see all clients in their org '
  '(scoped via org_members JOIN, NOT the deprecated is_org_owner()); '
  'members see only clients reachable through their explicitly granted stores. '
  'Updated by migration 20260317_01.';

-- =============================================
-- STEP 6: TRIGGER — auto-assign access when a new store is created
-- =============================================
-- When a new store is added to an org, all active non-owner members of that
-- org automatically receive a can_view=true row.
-- Owners are excluded because they bypass agent_store_access entirely.
-- Adjust the WHERE clause if you want new stores to start as restricted
-- (i.e., require explicit grants even for existing members).

CREATE OR REPLACE FUNCTION fn_auto_assign_store_access_on_store_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Skip if store has no org (standalone / portal-only store)
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO agent_store_access (
    org_member_id,
    store_id,
    can_view,
    can_edit,
    can_manage_onboarding,
    can_manage_campaigns,
    can_manage_reports,
    assigned_by,
    assigned_at,
    notes
  )
  SELECT
    om.id,
    NEW.id,
    true,
    false,
    false,
    false,
    false,
    (
      SELECT om2.profile_id
      FROM   org_members om2
      WHERE  om2.org_id    = NEW.org_id
      AND    om2.role      = 'owner'
      AND    om2.is_active = true
      ORDER  BY om2.created_at
      LIMIT  1
    ),
    NOW(),
    'Auto-assigned on store creation (trigger fn_auto_assign_store_access_on_store_insert)'
  FROM org_members om
  WHERE om.org_id    = NEW.org_id
  AND   om.is_active = true
  ON CONFLICT (org_member_id, store_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_assign_store_access ON client_stores;
CREATE TRIGGER trg_auto_assign_store_access
  AFTER INSERT ON client_stores
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_store_access_on_store_insert();

COMMENT ON FUNCTION fn_auto_assign_store_access_on_store_insert() IS
  'Auto-assigns can_view=true to all active org members when a new store is added. '
  'Created by migration 20260317_01. '
  'To start new stores as restricted (no auto-access), drop this trigger.';

-- =============================================
-- STEP 7: TRIGGER — auto-assign access when a new org member is added
-- =============================================
-- When a new member joins an org, they receive can_view=true for every
-- active store in that org.
-- To start new members with NO store access (restricted by default), remove
-- or disable this trigger and grant access explicitly via the UI.

CREATE OR REPLACE FUNCTION fn_auto_assign_store_access_on_member_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Only for non-owner active members (owners bypass agent_store_access)
  -- Remove the role check if you want to track owners in the table too.
  IF NOT NEW.is_active OR NEW.role = 'owner' THEN
    RETURN NEW;
  END IF;

  INSERT INTO agent_store_access (
    org_member_id,
    store_id,
    can_view,
    can_edit,
    can_manage_onboarding,
    can_manage_campaigns,
    can_manage_reports,
    assigned_by,
    assigned_at,
    notes
  )
  SELECT
    NEW.id,
    cs.id,
    true,
    false,
    false,
    false,
    false,
    NEW.invited_by,
    NOW(),
    'Auto-assigned on member creation (trigger fn_auto_assign_store_access_on_member_insert)'
  FROM client_stores cs
  WHERE cs.org_id    = NEW.org_id
  AND   cs.is_active = true
  ON CONFLICT (org_member_id, store_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_assign_member_store_access ON org_members;
CREATE TRIGGER trg_auto_assign_member_store_access
  AFTER INSERT ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_assign_store_access_on_member_insert();

COMMENT ON FUNCTION fn_auto_assign_store_access_on_member_insert() IS
  'Auto-assigns can_view=true to all active stores in the org when a new member joins. '
  'Owners are excluded (they bypass agent_store_access). '
  'Created by migration 20260317_01. '
  'To start new members with NO access, drop this trigger and grant explicitly.';

-- =============================================
-- STEP 8: VERIFY backfill (informational only — safe to comment out)
-- =============================================
DO $$
DECLARE
  v_unassigned INT;
BEGIN
  -- Count active non-owner members who have at least one in-org store
  -- but no corresponding agent_store_access row.
  SELECT COUNT(*) INTO v_unassigned
  FROM (
    SELECT om.id AS member_id, cs.id AS store_id
    FROM   org_members om
    JOIN   client_stores cs ON cs.org_id = om.org_id
    WHERE  om.is_active  = true
    AND    NOT EXISTS (
      SELECT 1
      FROM   agent_store_access asa
      WHERE  asa.org_member_id = om.id
      AND    asa.store_id      = cs.id
    )
  ) gaps;

  IF v_unassigned > 0 THEN
    RAISE WARNING 'enforce_explicit_store_access: % (member, store) pairs still have no agent_store_access row. '
                  'This is unexpected after the backfill — investigate before applying.', v_unassigned;
  ELSE
    RAISE NOTICE 'enforce_explicit_store_access: backfill complete — all active member/store pairs have agent_store_access rows.';
  END IF;
END$$;

COMMIT;
