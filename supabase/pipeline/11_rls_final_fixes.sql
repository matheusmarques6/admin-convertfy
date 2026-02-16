-- ============================================================================
-- PIPELINE FILE 11: RLS FINAL FIXES (SAFE - all tables checked for existence)
-- ============================================================================
-- Drops and recreates all USING(true) policies for authenticated users.
-- Every table is wrapped in IF EXISTS to avoid errors on missing tables.
-- service_role policies are NOT touched (they are correct).
-- ============================================================================

BEGIN;

-- ============================================================================
-- HELPER: Safe policy management via DO blocks
-- ============================================================================

-- PART 1: Core tables
DO $$
BEGIN
  -- clients
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view all clients" ON clients';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view clients" ON clients';
    EXECUTE 'CREATE POLICY "Users can view clients" ON clients FOR SELECT TO authenticated USING (is_admin() OR id IN (SELECT accessible_client_ids()))';
  END IF;

  -- client_stores
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_stores' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view client_stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated users to view stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated users to update stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated users to delete stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Allow all operations on client_stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update client_stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete client_stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert client_stores" ON client_stores';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage client_stores" ON client_stores';
    EXECUTE 'CREATE POLICY "Users can view client_stores" ON client_stores FOR SELECT TO authenticated USING (is_admin() OR can_access_store(id))';
    EXECUTE 'CREATE POLICY "Users can update client_stores" ON client_stores FOR UPDATE TO authenticated USING (is_admin() OR can_access_store(id)) WITH CHECK (is_admin() OR can_access_store(id))';
    EXECUTE 'CREATE POLICY "Users can delete client_stores" ON client_stores FOR DELETE TO authenticated USING (is_admin())';
    EXECUTE 'CREATE POLICY "Users can insert client_stores" ON client_stores FOR INSERT TO authenticated WITH CHECK (is_admin() OR can_access_client(client_id))';
  END IF;

  -- contracts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contracts' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view contracts" ON contracts';
    EXECUTE 'CREATE POLICY "Users can view contracts" ON contracts FOR SELECT TO authenticated USING (is_admin() OR can_access_client(client_id))';
  END IF;

  -- invoices
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view invoices" ON invoices';
    EXECUTE 'CREATE POLICY "Users can view invoices" ON invoices FOR SELECT TO authenticated USING (is_admin() OR can_access_client(client_id))';
  END IF;

  -- meetings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meetings' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view meetings" ON meetings';
    EXECUTE 'CREATE POLICY "Users can view meetings" ON meetings FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- reports
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reports' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view reports" ON reports';
    EXECUTE 'CREATE POLICY "Users can view reports" ON reports FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- pipelines
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipelines' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view pipelines" ON pipelines';
    EXECUTE 'DROP POLICY IF EXISTS "pipeline_select" ON pipelines';
    EXECUTE 'CREATE POLICY "Users can view pipelines" ON pipelines FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- pipeline_stages
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pipeline_stages' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view pipeline_stages" ON pipeline_stages';
    EXECUTE 'DROP POLICY IF EXISTS "stage_select" ON pipeline_stages';
    EXECUTE 'CREATE POLICY "Users can view pipeline_stages" ON pipeline_stages FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- deals
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'deals' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view deals" ON deals';
    EXECUTE 'DROP POLICY IF EXISTS "deal_select" ON deals';
    EXECUTE 'CREATE POLICY "Users can view deals" ON deals FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- automations
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'automations' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view automations" ON automations';
    EXECUTE 'CREATE POLICY "Users can view automations" ON automations FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- automation_logs
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'automation_logs' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view automation_logs" ON automation_logs';
    EXECUTE 'CREATE POLICY "Users can view automation_logs" ON automation_logs FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- activities
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'activities' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view activities" ON activities';
    EXECUTE 'CREATE POLICY "Users can view activities" ON activities FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- integrations (admin only - contains credentials)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'integrations' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view integrations" ON integrations';
    EXECUTE 'CREATE POLICY "Users can view integrations" ON integrations FOR SELECT TO authenticated USING (is_admin())';
  END IF;

  -- email_templates
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_templates' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view email_templates" ON email_templates';
    EXECUTE 'CREATE POLICY "Users can view email_templates" ON email_templates FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- settings (admin only)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'settings' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view settings" ON settings';
    EXECUTE 'CREATE POLICY "Users can view settings" ON settings FOR SELECT TO authenticated USING (is_admin())';
  END IF;
END$$;

-- ============================================================================
-- PART 2: Financial tables
-- ============================================================================

DO $$
BEGIN
  -- client_subscriptions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_subscriptions' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow all operations on client_subscriptions" ON client_subscriptions';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view client_subscriptions" ON client_subscriptions';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage client_subscriptions" ON client_subscriptions';
    EXECUTE 'CREATE POLICY "Users can view client_subscriptions" ON client_subscriptions FOR SELECT TO authenticated USING (is_admin() OR can_access_client(client_id))';
    EXECUTE 'CREATE POLICY "Users can manage client_subscriptions" ON client_subscriptions FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())';
  END IF;

  -- client_charges
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_charges' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow all operations on client_charges" ON client_charges';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view client_charges" ON client_charges';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage client_charges" ON client_charges';
    EXECUTE 'CREATE POLICY "Users can view client_charges" ON client_charges FOR SELECT TO authenticated USING (is_admin() OR can_access_client(client_id))';
    EXECUTE 'CREATE POLICY "Users can manage client_charges" ON client_charges FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())';
  END IF;
END$$;

-- ============================================================================
-- PART 3: Wise tables
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wise_transfers' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view wise_transfers" ON wise_transfers';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to manage wise_transfers" ON wise_transfers';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view wise_transfers" ON wise_transfers';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage wise_transfers" ON wise_transfers';
    EXECUTE 'CREATE POLICY "Users can view wise_transfers" ON wise_transfers FOR SELECT TO authenticated USING (is_admin())';
    EXECUTE 'CREATE POLICY "Users can manage wise_transfers" ON wise_transfers FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wise_reconciliations' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view wise_reconciliations" ON wise_reconciliations';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to manage wise_reconciliations" ON wise_reconciliations';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view wise_reconciliations" ON wise_reconciliations';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage wise_reconciliations" ON wise_reconciliations';
    EXECUTE 'CREATE POLICY "Users can view wise_reconciliations" ON wise_reconciliations FOR SELECT TO authenticated USING (is_admin())';
    EXECUTE 'CREATE POLICY "Users can manage wise_reconciliations" ON wise_reconciliations FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wise_transaction_mapping' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view wise_transaction_mapping" ON wise_transaction_mapping';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to manage wise_transaction_mapping" ON wise_transaction_mapping';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view wise_transaction_mapping" ON wise_transaction_mapping';
    EXECUTE 'DROP POLICY IF EXISTS "Users can manage wise_transaction_mapping" ON wise_transaction_mapping';
    EXECUTE 'CREATE POLICY "Users can view wise_transaction_mapping" ON wise_transaction_mapping FOR SELECT TO authenticated USING (is_admin())';
    EXECUTE 'CREATE POLICY "Users can manage wise_transaction_mapping" ON wise_transaction_mapping FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin())';
  END IF;
END$$;

-- ============================================================================
-- PART 4: Campaigns
-- ============================================================================

DO $$
BEGIN
  -- campaign_history: skip if org_id migration has already run (org_* policies exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaign_history' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaign_history' AND column_name = 'org_id' AND table_schema = 'public')
  THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view campaign history" ON campaign_history';
    EXECUTE 'DROP POLICY IF EXISTS "Users can create campaign history" ON campaign_history';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view campaign history for accessible stores" ON campaign_history';
    EXECUTE 'DROP POLICY IF EXISTS "Campaign managers can create history" ON campaign_history';
    EXECUTE 'CREATE POLICY "Users can view campaign history for accessible stores" ON campaign_history FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_history.campaign_id AND can_access_store(c.store_id)))';
    EXECUTE 'CREATE POLICY "Campaign managers can create history" ON campaign_history FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_history.campaign_id AND can_manage_store_campaigns(c.store_id)))';
  END IF;
END$$;

-- ============================================================================
-- PART 5: Other tables
-- ============================================================================

DO $$
BEGIN
  -- campaign_batches: skip if org_id migration has already run (org_* policies exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaign_batches' AND table_schema = 'public')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'campaign_batches' AND column_name = 'org_id' AND table_schema = 'public')
  THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view campaign_batches" ON campaign_batches';
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to manage campaign_batches" ON campaign_batches';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view campaign_batches" ON campaign_batches';
    EXECUTE 'CREATE POLICY "Users can view campaign_batches" ON campaign_batches FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- dashboard_cache
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dashboard_cache' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view dashboard_cache" ON dashboard_cache';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view dashboard_cache" ON dashboard_cache';
    EXECUTE 'CREATE POLICY "Users can view dashboard_cache" ON dashboard_cache FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- meeting_participants
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'meeting_participants' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view meeting_participants" ON meeting_participants';
    EXECUTE 'DROP POLICY IF EXISTS "meeting_participants_select" ON meeting_participants';
    EXECUTE 'DROP POLICY IF EXISTS "meeting_participants_select_policy" ON meeting_participants';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view meeting_participants" ON meeting_participants';
    EXECUTE 'CREATE POLICY "Users can view meeting_participants" ON meeting_participants FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- rate_limits
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'rate_limits' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view rate_limits" ON rate_limits';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view rate_limits" ON rate_limits';
    EXECUTE 'CREATE POLICY "Users can view rate_limits" ON rate_limits FOR SELECT TO authenticated USING (is_admin())';
  END IF;

  -- campaign_approvals
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaign_approvals' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view campaign_approvals" ON campaign_approvals';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view campaign_approvals" ON campaign_approvals';
    EXECUTE 'CREATE POLICY "Users can view campaign_approvals" ON campaign_approvals FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- onboarding_system_config
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_system_config' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view onboarding_system_config" ON onboarding_system_config';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view onboarding_system_config" ON onboarding_system_config';
    EXECUTE 'CREATE POLICY "Users can view onboarding_system_config" ON onboarding_system_config FOR SELECT TO authenticated USING (is_admin())';
  END IF;

  -- onboarding_templates (only if "View templates" policy doesn't exist)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'onboarding_templates' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view onboarding_templates" ON onboarding_templates';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view onboarding_templates_auth" ON onboarding_templates';
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'onboarding_templates' AND policyname = 'View templates') THEN
      EXECUTE 'CREATE POLICY "Users can view onboarding_templates_auth" ON onboarding_templates FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
    END IF;
  END IF;

  -- store_feedback_prompts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'store_feedback_prompts' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view store_feedback_prompts" ON store_feedback_prompts';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view store_feedback_prompts" ON store_feedback_prompts';
    EXECUTE 'CREATE POLICY "Users can view store_feedback_prompts" ON store_feedback_prompts FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;

  -- feedback_responses
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'feedback_responses' AND table_schema = 'public') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow authenticated to view feedback_responses" ON feedback_responses';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view feedback_responses" ON feedback_responses';
    EXECUTE 'CREATE POLICY "Users can view feedback_responses" ON feedback_responses FOR SELECT TO authenticated USING (is_admin() OR is_org_member())';
  END IF;
END$$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY
-- Run this after all pipeline files to check for remaining USING(true) policies
-- that are NOT for service_role:
-- ============================================================================
-- SELECT schemaname, tablename, policyname, roles::text[], qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND qual = 'true'
--   AND NOT (roles::text[] @> ARRAY['service_role'])
-- ORDER BY tablename, policyname;
-- ============================================================================

-- 11_rls_final_fixes.sql DONE
