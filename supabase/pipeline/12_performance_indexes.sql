-- ============================================================================
-- PIPELINE FILE 12: PERFORMANCE INDEXES FOR RLS HELPER FUNCTIONS
-- ============================================================================
-- These composite indexes speed up the RLS helper functions
-- (is_admin, is_org_member, can_access_store, can_access_client)
-- that are called on every row check.
-- ============================================================================

BEGIN;

-- Speed up is_admin() - checks profiles.role = 'admin' WHERE id = auth.uid()
CREATE INDEX IF NOT EXISTS idx_profiles_id_role
  ON profiles(id, role);

-- Speed up is_org_member() - checks org_members.is_active WHERE profile_id = auth.uid()
CREATE INDEX IF NOT EXISTS idx_org_members_profile_active
  ON org_members(profile_id, is_active);

-- Speed up can_access_client() - JOINs agent_store_access + org_members + client_stores
CREATE INDEX IF NOT EXISTS idx_agent_store_access_member_view
  ON agent_store_access(org_member_id, can_view);

CREATE INDEX IF NOT EXISTS idx_client_stores_client_active
  ON client_stores(client_id, is_active);

-- Speed up can_access_store() - checks agent_store_access by store_id + org_member
CREATE INDEX IF NOT EXISTS idx_agent_store_access_store_member
  ON agent_store_access(store_id, org_member_id);

-- Speed up is_org_owner() - checks org_members.role = 'owner'
CREATE INDEX IF NOT EXISTS idx_org_members_profile_role
  ON org_members(profile_id, role);

-- Speed up accessible_client_ids() and accessible_store_ids()
CREATE INDEX IF NOT EXISTS idx_agent_store_access_member_store
  ON agent_store_access(org_member_id, store_id);

COMMIT;

-- ============================================================================
-- 12_performance_indexes.sql DONE
-- ============================================================================
