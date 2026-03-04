-- Fix RLS signature mismatch on ALL legacy klaviyo tables
-- from migration 20250125_10_klaviyo_metrics.sql
--
-- Problem: policies used is_admin(auth.uid()) and has_store_access(auth.uid(), store_id)
-- Current functions: is_admin() [no args] and can_access_store(store_id) [1 arg]
--
-- NOTE: These DROP names match the ACTUAL policy names in the database.
-- (v1 of this story had wrong names — corrected after QA review)

-- ============================================================
-- TABLE: klaviyo_campaigns
-- ============================================================
DROP POLICY IF EXISTS "klaviyo_campaigns_select" ON klaviyo_campaigns;
DROP POLICY IF EXISTS "klaviyo_campaigns_insert" ON klaviyo_campaigns;
DROP POLICY IF EXISTS "klaviyo_campaigns_update" ON klaviyo_campaigns;
DROP POLICY IF EXISTS "klaviyo_campaigns_delete" ON klaviyo_campaigns;

CREATE POLICY "klaviyo_campaigns_select" ON klaviyo_campaigns
  FOR SELECT USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "klaviyo_campaigns_insert" ON klaviyo_campaigns
  FOR INSERT WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "klaviyo_campaigns_update" ON klaviyo_campaigns
  FOR UPDATE USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "klaviyo_campaigns_delete" ON klaviyo_campaigns
  FOR DELETE USING (is_admin());

-- ============================================================
-- TABLE: campaign_metrics
-- ============================================================
DROP POLICY IF EXISTS "campaign_metrics_select" ON campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_all" ON campaign_metrics;

CREATE POLICY "campaign_metrics_select" ON campaign_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_metrics.campaign_id
      AND (is_admin() OR can_access_store(kc.store_id))
    )
  );

CREATE POLICY "campaign_metrics_all" ON campaign_metrics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_metrics.campaign_id
      AND (is_admin() OR can_access_store(kc.store_id))
    )
  );

-- ============================================================
-- TABLE: campaign_metrics_history
-- ============================================================
DROP POLICY IF EXISTS "campaign_metrics_history_select" ON campaign_metrics_history;
DROP POLICY IF EXISTS "campaign_metrics_history_all" ON campaign_metrics_history;

CREATE POLICY "campaign_metrics_history_select" ON campaign_metrics_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_metrics_history.campaign_id
      AND (is_admin() OR can_access_store(kc.store_id))
    )
  );

CREATE POLICY "campaign_metrics_history_all" ON campaign_metrics_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_metrics_history.campaign_id
      AND (is_admin() OR can_access_store(kc.store_id))
    )
  );

-- ============================================================
-- TABLE: campaign_alerts
-- ============================================================
DROP POLICY IF EXISTS "campaign_alerts_select" ON campaign_alerts;
DROP POLICY IF EXISTS "campaign_alerts_insert" ON campaign_alerts;
DROP POLICY IF EXISTS "campaign_alerts_update" ON campaign_alerts;
DROP POLICY IF EXISTS "campaign_alerts_delete" ON campaign_alerts;

CREATE POLICY "campaign_alerts_select" ON campaign_alerts
  FOR SELECT USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "campaign_alerts_insert" ON campaign_alerts
  FOR INSERT WITH CHECK (is_admin() OR can_access_store(store_id));

CREATE POLICY "campaign_alerts_update" ON campaign_alerts
  FOR UPDATE USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "campaign_alerts_delete" ON campaign_alerts
  FOR DELETE USING (is_admin() OR can_access_store(store_id));

-- ============================================================
-- TABLE: klaviyo_sync_config
-- ============================================================
DROP POLICY IF EXISTS "sync_config_select" ON klaviyo_sync_config;
DROP POLICY IF EXISTS "sync_config_all" ON klaviyo_sync_config;

CREATE POLICY "sync_config_select" ON klaviyo_sync_config
  FOR SELECT USING (is_admin() OR can_access_store(store_id));

CREATE POLICY "sync_config_all" ON klaviyo_sync_config
  FOR ALL USING (is_admin() OR can_access_store(store_id));

-- ============================================================
-- TABLE: klaviyo_sync_jobs
-- ============================================================
DROP POLICY IF EXISTS "sync_jobs_select" ON klaviyo_sync_jobs;
DROP POLICY IF EXISTS "sync_jobs_insert" ON klaviyo_sync_jobs;
DROP POLICY IF EXISTS "sync_jobs_update" ON klaviyo_sync_jobs;

CREATE POLICY "sync_jobs_select" ON klaviyo_sync_jobs
  FOR SELECT USING (
    is_admin()
    OR (store_id IS NOT NULL AND can_access_store(store_id))
  );

CREATE POLICY "sync_jobs_insert" ON klaviyo_sync_jobs
  FOR INSERT WITH CHECK (
    is_admin()
    OR (store_id IS NOT NULL AND can_access_store(store_id))
  );

CREATE POLICY "sync_jobs_update" ON klaviyo_sync_jobs
  FOR UPDATE USING (is_admin());
