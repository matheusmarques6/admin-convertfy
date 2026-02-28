-- Migration: Add org_id to dashboard_cache for multi-tenant isolation
-- Story 8.2 - Epic 8: Performance Revenue Cache
--
-- Problem: dashboard_cache RLS uses is_org_member() which returns TRUE for
-- any authenticated user in ANY org, allowing cross-tenant cache reads.
-- Fix: Add org_id column, backfill from client_stores, update RLS policy.

-- 1. Add org_id column (nullable for backfill)
ALTER TABLE dashboard_cache
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- 2. Backfill org_id from client_stores
UPDATE dashboard_cache dc
SET org_id = cs.org_id
FROM client_stores cs
WHERE dc.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND dc.org_id IS NULL;

-- 3. Index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_dashboard_cache_org
  ON dashboard_cache(org_id, cache_type, period);

-- 4. Drop the vulnerable policy
DROP POLICY IF EXISTS "Users can view dashboard_cache" ON dashboard_cache;
DROP POLICY IF EXISTS "org_dashboard_cache_select" ON dashboard_cache;

-- 5. Create corrected RLS policy: restrict to user's org + store access fallback
CREATE POLICY "org_dashboard_cache_select" ON dashboard_cache
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_store(store_id)
  );

-- 6. Ensure service role still has full access (for cron/API writes)
-- The existing "Service role can manage dashboard cache" policy covers this.
-- Verify it exists:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dashboard_cache'
      AND policyname = 'Service role can manage dashboard cache'
  ) THEN
    CREATE POLICY "Service role can manage dashboard cache"
      ON dashboard_cache FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;
