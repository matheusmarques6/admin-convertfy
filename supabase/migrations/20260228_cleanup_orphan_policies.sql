-- ============================================================================
-- CLEANUP: Remove orphan RLS policies from initial schema
-- These were replaced by proper org-scoped policies in later migrations
-- (20250215_fix_rls_using_true.sql, 20260216_add_org_id_multitenant.sql)
-- but the old permissive policies may still exist if migrations ran additively.
-- ============================================================================

-- client_stores: originals from 00001 and 20241212
DROP POLICY IF EXISTS "Users can view client_stores" ON client_stores;
DROP POLICY IF EXISTS "Users can manage client_stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to view stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to insert stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to update stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to delete stores" ON client_stores;
DROP POLICY IF EXISTS "Allow all operations on client_stores" ON client_stores;
DROP POLICY IF EXISTS "Access stores by permission" ON client_stores;

-- clients: overly permissive from 00001
DROP POLICY IF EXISTS "Users can view all clients" ON clients;

-- contracts: overly permissive from 00001
DROP POLICY IF EXISTS "Users can view contracts" ON contracts;
DROP POLICY IF EXISTS "Users can manage contracts" ON contracts;

-- reports: overly permissive from 00001
DROP POLICY IF EXISTS "Users can view reports" ON reports;
DROP POLICY IF EXISTS "Users can manage reports" ON reports;

-- ============================================================================
-- RE-CREATE proper policies that were dropped above
-- (only if they were the ACTIVE ones from 20250215_fix_rls_using_true.sql)
-- ============================================================================

-- client_stores: proper org-scoped policies
-- DROP first to make this migration idempotent, then CREATE
DROP POLICY IF EXISTS "Org members can view client_stores" ON client_stores;
CREATE POLICY "Org members can view client_stores"
  ON client_stores FOR SELECT TO authenticated
  USING (is_admin() OR can_access_store(id));

DROP POLICY IF EXISTS "Org members can update client_stores" ON client_stores;
CREATE POLICY "Org members can update client_stores"
  ON client_stores FOR UPDATE TO authenticated
  USING (is_admin() OR can_access_store(id))
  WITH CHECK (is_admin() OR can_access_store(id));

DROP POLICY IF EXISTS "Admins can delete client_stores" ON client_stores;
CREATE POLICY "Admins can delete client_stores"
  ON client_stores FOR DELETE TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Org members can insert client_stores" ON client_stores;
CREATE POLICY "Org members can insert client_stores"
  ON client_stores FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR client_id IS NULL
    OR can_access_client(client_id)
  );

-- clients: proper org-scoped policy
DROP POLICY IF EXISTS "Org members can view clients" ON clients;
CREATE POLICY "Org members can view clients"
  ON clients FOR SELECT TO authenticated
  USING (is_admin() OR id IN (SELECT accessible_client_ids()));

-- ============================================================================
-- VERIFICATION QUERY (run manually after applying):
--
-- SELECT tablename, policyname, cmd, roles, LEFT(qual::text, 80) as using_clause
-- FROM pg_policies
-- WHERE tablename IN ('client_stores', 'clients', 'contracts', 'reports')
-- ORDER BY tablename, policyname;
-- ============================================================================
