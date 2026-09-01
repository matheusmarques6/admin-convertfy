-- Reconcilia dashboard_cache com o estado canônico de RLS multi-tenant.
--
-- A migration 20260228_dashboard_cache_org_id.sql não foi aplicada no banco
-- de produção. Esta migration é idempotente e leva a tabela ao padrão de
-- 20260319_standardize_cache_rls.sql.

ALTER TABLE dashboard_cache
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

UPDATE dashboard_cache dc
SET org_id = cs.org_id
FROM client_stores cs
WHERE dc.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND dc.org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_dashboard_cache_org
  ON dashboard_cache(org_id, cache_type, period);

DROP POLICY IF EXISTS "Users can view dashboard_cache" ON dashboard_cache;
DROP POLICY IF EXISTS "Users can access cache for their client stores" ON dashboard_cache;
DROP POLICY IF EXISTS "Service role can manage dashboard cache" ON dashboard_cache;
DROP POLICY IF EXISTS "org_dashboard_cache_select" ON dashboard_cache;
CREATE POLICY "org_dashboard_cache_select" ON dashboard_cache
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "dashboard_cache_service_all" ON dashboard_cache;
CREATE POLICY "dashboard_cache_service_all" ON dashboard_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dashboard_cache_insert_authenticated" ON dashboard_cache;
CREATE POLICY "dashboard_cache_insert_authenticated" ON dashboard_cache
  FOR INSERT TO authenticated
  WITH CHECK (can_access_store(store_id));
