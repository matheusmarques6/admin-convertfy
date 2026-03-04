-- Harden dashboard_cache write policies
-- Story 15.4 — safe to apply AFTER all setCache() calls use createAdminClient()

-- Remove the permissive FOR ALL policy (actual name confirmed via pg_policies)
DROP POLICY IF EXISTS "Service role full access" ON dashboard_cache;

-- Service role: unrestricted access (explicit TO service_role for clarity)
CREATE POLICY "dashboard_cache_service_all" ON dashboard_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users: INSERT only for stores they can access (defense-in-depth)
-- table uses store_id (not org_id) — use can_access_store()
CREATE POLICY "dashboard_cache_insert_authenticated" ON dashboard_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (
    can_access_store(store_id)
  );

-- No UPDATE/DELETE policy for authenticated role = denied by default
-- All updates/deletes must use createAdminClient() (service role)
