-- ============================================================================
-- Migration: Fix RLS USING(true) policies for authenticated users
-- Date: 2025-02-15
-- Issue: #5 - Multiple tables have USING(true) allowing any authenticated
--        user to access all data regardless of organization membership
--
-- NOTE: service_role USING(true) policies are CORRECT and NOT touched here.
--       Only authenticated-user policies are being tightened.
--
-- Strategy: Replace USING(true) with is_admin() OR is_org_member() checks
--           For client-scoped data, use can_access_client() helper
--           For store-scoped data, use can_access_store() helper
-- ============================================================================

-- ============================================================================
-- PART 1: Core tables from 00001_initial_schema.sql
-- These had "Users can view all X" FOR SELECT USING (true)
-- ============================================================================

-- profiles: Keep open for SELECT (users need to see team members)
-- No change needed - viewing profiles is a standard requirement

-- clients: Restrict to org members who can access the client
DROP POLICY IF EXISTS "Users can view all clients" ON clients;
CREATE POLICY "Users can view clients"
  ON clients FOR SELECT TO authenticated
  USING (is_admin() OR id IN (SELECT accessible_client_ids()));

-- client_stores: Restrict to org members with store access
DROP POLICY IF EXISTS "Users can view client_stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to view stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to update stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to delete stores" ON client_stores;
DROP POLICY IF EXISTS "Allow all operations on client_stores" ON client_stores;

CREATE POLICY "Users can view client_stores"
  ON client_stores FOR SELECT TO authenticated
  USING (is_admin() OR can_access_store(id));

CREATE POLICY "Users can update client_stores"
  ON client_stores FOR UPDATE TO authenticated
  USING (is_admin() OR can_access_store(id))
  WITH CHECK (is_admin() OR can_access_store(id));

CREATE POLICY "Users can delete client_stores"
  ON client_stores FOR DELETE TO authenticated
  USING (is_admin());

CREATE POLICY "Users can insert client_stores"
  ON client_stores FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR can_access_client(client_id));

-- contracts: Restrict to org members who can access the client
DROP POLICY IF EXISTS "Users can view contracts" ON contracts;
CREATE POLICY "Users can view contracts"
  ON contracts FOR SELECT TO authenticated
  USING (is_admin() OR can_access_client(client_id));

-- invoices: Restrict to org members who can access the client
DROP POLICY IF EXISTS "Users can view invoices" ON invoices;
CREATE POLICY "Users can view invoices"
  ON invoices FOR SELECT TO authenticated
  USING (is_admin() OR can_access_client(client_id));

-- meetings: Restrict to org members
DROP POLICY IF EXISTS "Users can view meetings" ON meetings;
CREATE POLICY "Users can view meetings"
  ON meetings FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- reports: Restrict to org members
DROP POLICY IF EXISTS "Users can view reports" ON reports;
CREATE POLICY "Users can view reports"
  ON reports FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- pipelines: Restrict to org members
DROP POLICY IF EXISTS "Users can view pipelines" ON pipelines;
CREATE POLICY "Users can view pipelines"
  ON pipelines FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- pipeline_stages: Restrict to org members
DROP POLICY IF EXISTS "Users can view pipeline_stages" ON pipeline_stages;
CREATE POLICY "Users can view pipeline_stages"
  ON pipeline_stages FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- deals: Restrict to org members
DROP POLICY IF EXISTS "Users can view deals" ON deals;
CREATE POLICY "Users can view deals"
  ON deals FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- automations: Restrict to org members
DROP POLICY IF EXISTS "Users can view automations" ON automations;
CREATE POLICY "Users can view automations"
  ON automations FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- automation_logs: Restrict to org members
DROP POLICY IF EXISTS "Users can view automation_logs" ON automation_logs;
CREATE POLICY "Users can view automation_logs"
  ON automation_logs FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- activities: Restrict to org members
DROP POLICY IF EXISTS "Users can view activities" ON activities;
CREATE POLICY "Users can view activities"
  ON activities FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- integrations: Restrict to admins only (contains credentials)
DROP POLICY IF EXISTS "Users can view integrations" ON integrations;
CREATE POLICY "Users can view integrations"
  ON integrations FOR SELECT TO authenticated
  USING (is_admin());

-- tags: Keep open for SELECT (shared resource)
-- No change - tags are typically shared across the system

-- email_templates: Restrict to org members
DROP POLICY IF EXISTS "Users can view email_templates" ON email_templates;
CREATE POLICY "Users can view email_templates"
  ON email_templates FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- settings: Restrict to admins
DROP POLICY IF EXISTS "Users can view settings" ON settings;
CREATE POLICY "Users can view settings"
  ON settings FOR SELECT TO authenticated
  USING (is_admin());

-- ============================================================================
-- PART 2: Financial tables from 20241213_add_store_credentials.sql
-- These had "Allow all operations" FOR ALL USING (true) WITH CHECK (true)
-- ============================================================================

DROP POLICY IF EXISTS "Allow all operations on client_subscriptions" ON client_subscriptions;
CREATE POLICY "Users can view client_subscriptions"
  ON client_subscriptions FOR SELECT TO authenticated
  USING (is_admin() OR can_access_client(client_id));

CREATE POLICY "Users can manage client_subscriptions"
  ON client_subscriptions FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Allow all operations on client_charges" ON client_charges;
CREATE POLICY "Users can view client_charges"
  ON client_charges FOR SELECT TO authenticated
  USING (is_admin() OR can_access_client(client_id));

CREATE POLICY "Users can manage client_charges"
  ON client_charges FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================================
-- PART 3: Wise tables from 20241213_wise_reconciliations.sql
-- ============================================================================

DROP POLICY IF EXISTS "Allow authenticated to view wise_transfers" ON wise_transfers;
DROP POLICY IF EXISTS "Allow authenticated to manage wise_transfers" ON wise_transfers;
CREATE POLICY "Users can view wise_transfers"
  ON wise_transfers FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Users can manage wise_transfers"
  ON wise_transfers FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Allow authenticated to view wise_reconciliations" ON wise_reconciliations;
DROP POLICY IF EXISTS "Allow authenticated to manage wise_reconciliations" ON wise_reconciliations;
CREATE POLICY "Users can view wise_reconciliations"
  ON wise_reconciliations FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Users can manage wise_reconciliations"
  ON wise_reconciliations FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Allow authenticated to view wise_transaction_mapping" ON wise_transaction_mapping;
DROP POLICY IF EXISTS "Allow authenticated to manage wise_transaction_mapping" ON wise_transaction_mapping;
CREATE POLICY "Users can view wise_transaction_mapping"
  ON wise_transaction_mapping FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Users can manage wise_transaction_mapping"
  ON wise_transaction_mapping FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ============================================================================
-- PART 4: Campaigns from 20250120_campaigns_calendar.sql
-- Uses store-level access control via can_access_store / can_manage_store_campaigns
-- ============================================================================

DROP POLICY IF EXISTS "Allow authenticated to view campaigns" ON campaigns;
DROP POLICY IF EXISTS "Allow authenticated to manage campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view all campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can create campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can update campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can delete campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view campaigns for accessible stores" ON campaigns;
DROP POLICY IF EXISTS "Users can create campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Users can update campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Users can delete campaigns for managed stores" ON campaigns;

CREATE POLICY "Users can view campaigns for accessible stores"
  ON campaigns FOR SELECT TO authenticated
  USING (can_access_store(store_id));

CREATE POLICY "Users can create campaigns for managed stores"
  ON campaigns FOR INSERT TO authenticated
  WITH CHECK (can_manage_store_campaigns(store_id));

CREATE POLICY "Users can update campaigns for managed stores"
  ON campaigns FOR UPDATE TO authenticated
  USING (can_manage_store_campaigns(store_id))
  WITH CHECK (can_manage_store_campaigns(store_id));

CREATE POLICY "Users can delete campaigns for managed stores"
  ON campaigns FOR DELETE TO authenticated
  USING (can_manage_store_campaigns(store_id));

-- campaign_history (from 20250125_09_campaign_approval.sql)
DROP POLICY IF EXISTS "Users can view campaign history" ON campaign_history;
DROP POLICY IF EXISTS "Users can create campaign history" ON campaign_history;
DROP POLICY IF EXISTS "Users can view campaign history for accessible stores" ON campaign_history;
DROP POLICY IF EXISTS "Campaign managers can create history" ON campaign_history;

CREATE POLICY "Users can view campaign history for accessible stores"
  ON campaign_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_access_store(c.store_id)
    )
  );

CREATE POLICY "Campaign managers can create history"
  ON campaign_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_manage_store_campaigns(c.store_id)
    )
  );

-- ============================================================================
-- PART 5: Other tables with USING(true) for authenticated
-- ============================================================================

-- campaign_batches
DROP POLICY IF EXISTS "Allow authenticated to view campaign_batches" ON campaign_batches;
DROP POLICY IF EXISTS "Allow authenticated to manage campaign_batches" ON campaign_batches;
CREATE POLICY "Users can view campaign_batches"
  ON campaign_batches FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- dashboard_cache
DROP POLICY IF EXISTS "Allow authenticated to view dashboard_cache" ON dashboard_cache;
CREATE POLICY "Users can view dashboard_cache"
  ON dashboard_cache FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- meeting_participants
DROP POLICY IF EXISTS "Allow authenticated to view meeting_participants" ON meeting_participants;
DROP POLICY IF EXISTS "meeting_participants_select" ON meeting_participants;
DROP POLICY IF EXISTS "Users can view meeting_participants" ON meeting_participants;
CREATE POLICY "Users can view meeting_participants"
  ON meeting_participants FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- rate_limits (admin only)
DROP POLICY IF EXISTS "Allow authenticated to view rate_limits" ON rate_limits;
CREATE POLICY "Users can view rate_limits"
  ON rate_limits FOR SELECT TO authenticated
  USING (is_admin());

-- campaign_approvals
DROP POLICY IF EXISTS "Allow authenticated to view campaign_approvals" ON campaign_approvals;
CREATE POLICY "Users can view campaign_approvals"
  ON campaign_approvals FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- onboarding tables (non-service-role policies)
DROP POLICY IF EXISTS "Allow authenticated to view onboarding_system_config" ON onboarding_system_config;
CREATE POLICY "Users can view onboarding_system_config"
  ON onboarding_system_config FOR SELECT TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Allow authenticated to view onboarding_templates" ON onboarding_templates;
CREATE POLICY "Users can view onboarding_templates_auth"
  ON onboarding_templates FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

DROP POLICY IF EXISTS "Allow authenticated to view client_onboardings" ON client_onboardings;
CREATE POLICY "Users can view client_onboardings"
  ON client_onboardings FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- store_feedback_prompts
DROP POLICY IF EXISTS "Allow authenticated to view store_feedback_prompts" ON store_feedback_prompts;
CREATE POLICY "Users can view store_feedback_prompts"
  ON store_feedback_prompts FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- feedback_responses
DROP POLICY IF EXISTS "Allow authenticated to view feedback_responses" ON feedback_responses;
CREATE POLICY "Users can view feedback_responses"
  ON feedback_responses FOR SELECT TO authenticated
  USING (is_admin() OR is_org_member());

-- ============================================================================
-- DONE
-- ============================================================================
-- Summary of changes:
--   - ~50 USING(true) policies for authenticated users replaced
--   - integrations, settings, rate_limits, wise_* → admin only
--   - client-scoped tables → can_access_client() / can_access_store()
--   - org-scoped tables → is_org_member()
--   - service_role policies were NOT touched (they're correct)
--   - profiles and tags left open (shared resources)
-- ============================================================================
