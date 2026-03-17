-- ============================================================================
-- Story 54.8 — Standardize RLS Policies Across Cache Tables
-- ============================================================================
-- Problem: flow/campaign metrics have 5 policies each (select/insert/update/delete
-- for authenticated + all for service_role), while the modern pattern used by
-- store_revenue_summary only needs 2: service_all + org_select.
--
-- These cache tables are ONLY written by service_role (cron + adminClient).
-- Authenticated users only need SELECT access.
--
-- Dashboard_cache may still have the old permissive "Service role can manage
-- dashboard cache" policy (FOR ALL USING(true) without TO role restriction).
--
-- IDEMPOTENT: All DROP IF EXISTS + CREATE.
-- ============================================================================

-- ============================================================================
-- 1. KLAVIYO_FLOW_METRICS — Drop legacy policies, create modern pair
-- ============================================================================

-- Drop all existing authenticated policies (from 20260216 migration)
DROP POLICY IF EXISTS "org_flow_metrics_select" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "org_flow_metrics_insert" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "org_flow_metrics_update" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "org_flow_metrics_delete" ON klaviyo_flow_metrics;

-- Drop any legacy policies from older migrations
DROP POLICY IF EXISTS "flow_metrics_select" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "flow_metrics_all" ON klaviyo_flow_metrics;

-- Drop and recreate service_role policy (idempotent)
DROP POLICY IF EXISTS "service_flow_metrics_all" ON klaviyo_flow_metrics;
CREATE POLICY "service_flow_metrics_all" ON klaviyo_flow_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Single SELECT policy for authenticated users (modern pattern)
CREATE POLICY "org_flow_metrics_select" ON klaviyo_flow_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

-- ============================================================================
-- 2. KLAVIYO_CAMPAIGN_METRICS — Drop legacy policies, create modern pair
-- ============================================================================

-- Drop all existing authenticated policies (from 20260216 migration)
DROP POLICY IF EXISTS "org_campaign_metrics_select" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "org_campaign_metrics_insert" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "org_campaign_metrics_update" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "org_campaign_metrics_delete" ON klaviyo_campaign_metrics;

-- Drop any legacy policies from older migrations
DROP POLICY IF EXISTS "campaign_metrics_select" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_all" ON klaviyo_campaign_metrics;

-- Drop and recreate service_role policy (idempotent)
DROP POLICY IF EXISTS "service_campaign_metrics_all" ON klaviyo_campaign_metrics;
CREATE POLICY "service_campaign_metrics_all" ON klaviyo_campaign_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Single SELECT policy for authenticated users (modern pattern)
CREATE POLICY "org_campaign_metrics_select" ON klaviyo_campaign_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

-- ============================================================================
-- 3. DASHBOARD_CACHE — Clean up old permissive policy if it exists
-- ============================================================================

-- Drop the old permissive policy (no TO role restriction = any authenticated can write)
DROP POLICY IF EXISTS "Service role can manage dashboard cache" ON dashboard_cache;

-- Ensure the proper service_role policy exists (from 20260304 hardening)
DROP POLICY IF EXISTS "dashboard_cache_service_all" ON dashboard_cache;
CREATE POLICY "dashboard_cache_service_all" ON dashboard_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Ensure the SELECT policy exists for authenticated users
DROP POLICY IF EXISTS "org_dashboard_cache_select" ON dashboard_cache;
CREATE POLICY "org_dashboard_cache_select" ON dashboard_cache
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

-- Keep the INSERT policy for authenticated (defense-in-depth from 20260304)
DROP POLICY IF EXISTS "dashboard_cache_insert_authenticated" ON dashboard_cache;
CREATE POLICY "dashboard_cache_insert_authenticated" ON dashboard_cache
  FOR INSERT TO authenticated
  WITH CHECK (can_access_store(store_id));

-- ============================================================================
-- Expected final state for ALL cache tables:
--
-- | Table                    | service_role      | authenticated SELECT                          |
-- |--------------------------|-------------------|-----------------------------------------------|
-- | store_revenue_summary    | FOR ALL USING(t)  | org_id = current_org_id() OR can_access_store |
-- | dashboard_cache          | FOR ALL USING(t)  | org_id = current_org_id() OR can_access_store |
-- | klaviyo_flow_metrics     | FOR ALL USING(t)  | org_id = current_org_id() OR can_access_store |
-- | klaviyo_campaign_metrics | FOR ALL USING(t)  | org_id = current_org_id() OR can_access_store |
-- | klaviyo_audiences        | (own pattern)     | (own pattern — not modified here)             |
--
-- VERIFICATION QUERY:
-- SELECT tablename, policyname, cmd, roles, LEFT(qual::text, 80) as using_clause
-- FROM pg_policies
-- WHERE tablename IN (
--   'store_revenue_summary', 'dashboard_cache',
--   'klaviyo_flow_metrics', 'klaviyo_campaign_metrics'
-- )
-- ORDER BY tablename, policyname;
-- ============================================================================
