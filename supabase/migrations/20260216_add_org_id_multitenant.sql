-- =============================================
-- MIGRATION: Add org_id to multi-tenant tables
-- =============================================
-- Adds org_id column to all tables missing it for proper
-- multi-tenant isolation. Replaces broken RLS policies
-- (USING(true), auth.role(), non-existent column refs)
-- with proper org-scoped policies using helper functions.
--
-- PREREQUISITE: Run 11_rls_final_fixes.sql FIRST (pipeline)
--
-- Tables affected:
--   1. clients (needs org_id for direct lookup)
--   2. client_stores (needs org_id for direct lookup)
--   3. campaigns
--   4. campaign_batches
--   5. campaign_history
--   6. client_reports
--   7. product_costs
--   8. store_cost_settings
--   9. order_attribution
--  10. klaviyo_flow_metrics
--  11. klaviyo_campaign_metrics
--  12. store_top_customers
--  13. attribution_summary
--
-- Backfill strategy:
--   clients.owner_id -> org_members.profile_id -> org_members.org_id
--   client_stores.client_id -> clients.org_id
--   Other tables: store_id/client_id -> resolved through chain
--
-- IDEMPOTENT: Safe to re-run (IF NOT EXISTS + DROP POLICY IF EXISTS)
-- =============================================

BEGIN;

-- =============================================
-- STEP 1: ADD org_id COLUMN TO ALL TABLES
-- =============================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE campaign_batches
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE campaign_history
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE client_reports
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE product_costs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE store_cost_settings
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE order_attribution
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE klaviyo_flow_metrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE klaviyo_campaign_metrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE store_top_customers
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

ALTER TABLE attribution_summary
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);


-- =============================================
-- STEP 2: BACKFILL org_id FROM RELATIONSHIPS
-- =============================================

-- 2a. Backfill clients via owner_id -> org_members
UPDATE clients c
SET org_id = om.org_id
FROM org_members om
WHERE c.owner_id = om.profile_id
  AND om.is_active = true
  AND c.org_id IS NULL
  AND c.owner_id IS NOT NULL;

-- 2b. Backfill client_stores via client_id -> clients.org_id
UPDATE client_stores cs
SET org_id = cl.org_id
FROM clients cl
WHERE cs.client_id = cl.id
  AND cl.org_id IS NOT NULL
  AND cs.org_id IS NULL;

-- 2c. Backfill campaigns (has both store_id and client_id)
UPDATE campaigns camp
SET org_id = cl.org_id
FROM clients cl
WHERE camp.client_id = cl.id
  AND cl.org_id IS NOT NULL
  AND camp.org_id IS NULL;

-- 2d. Backfill campaign_batches via first store in store_ids array
UPDATE campaign_batches cb
SET org_id = cs.org_id
FROM client_stores cs
WHERE cs.id = cb.store_ids[1]
  AND cs.org_id IS NOT NULL
  AND cb.org_id IS NULL;

-- 2e. Backfill campaign_history via campaign -> campaigns.org_id
UPDATE campaign_history ch
SET org_id = camp.org_id
FROM campaigns camp
WHERE ch.campaign_id = camp.id
  AND camp.org_id IS NOT NULL
  AND ch.org_id IS NULL;

-- 2f. Backfill client_reports via client_id -> clients.org_id
UPDATE client_reports cr
SET org_id = cl.org_id
FROM clients cl
WHERE cr.client_id = cl.id
  AND cl.org_id IS NOT NULL
  AND cr.org_id IS NULL;

-- 2g. Backfill all store_id-based advanced reporting tables
UPDATE product_costs pc
SET org_id = cs.org_id
FROM client_stores cs
WHERE pc.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND pc.org_id IS NULL;

UPDATE store_cost_settings scs
SET org_id = cs.org_id
FROM client_stores cs
WHERE scs.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND scs.org_id IS NULL;

UPDATE order_attribution oa
SET org_id = cs.org_id
FROM client_stores cs
WHERE oa.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND oa.org_id IS NULL;

UPDATE klaviyo_flow_metrics kfm
SET org_id = cs.org_id
FROM client_stores cs
WHERE kfm.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND kfm.org_id IS NULL;

UPDATE klaviyo_campaign_metrics kcm
SET org_id = cs.org_id
FROM client_stores cs
WHERE kcm.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND kcm.org_id IS NULL;

UPDATE store_top_customers stc
SET org_id = cs.org_id
FROM client_stores cs
WHERE stc.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND stc.org_id IS NULL;

UPDATE attribution_summary ats
SET org_id = cs.org_id
FROM client_stores cs
WHERE ats.store_id = cs.id
  AND cs.org_id IS NOT NULL
  AND ats.org_id IS NULL;


-- =============================================
-- STEP 3: CREATE INDEXES ON org_id
-- =============================================

CREATE INDEX IF NOT EXISTS idx_clients_org_id ON clients(org_id);
CREATE INDEX IF NOT EXISTS idx_client_stores_org_id ON client_stores(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_org_id ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_batches_org_id ON campaign_batches(org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_history_org_id ON campaign_history(org_id);
CREATE INDEX IF NOT EXISTS idx_client_reports_org_id ON client_reports(org_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_org_id ON product_costs(org_id);
CREATE INDEX IF NOT EXISTS idx_store_cost_settings_org_id ON store_cost_settings(org_id);
CREATE INDEX IF NOT EXISTS idx_order_attribution_org_id ON order_attribution(org_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_flow_metrics_org_id ON klaviyo_flow_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaign_metrics_org_id ON klaviyo_campaign_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_store_top_customers_org_id ON store_top_customers(org_id);
CREATE INDEX IF NOT EXISTS idx_attribution_summary_org_id ON attribution_summary(org_id);


-- =============================================
-- STEP 4: DROP BROKEN RLS POLICIES
-- =============================================

-- 4a. Campaigns
DROP POLICY IF EXISTS "Users can view campaigns for accessible stores" ON campaigns;
DROP POLICY IF EXISTS "Users can create campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Users can update campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Users can delete campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Access campaigns by store" ON campaigns;
DROP POLICY IF EXISTS "Manage campaigns by permission" ON campaigns;

-- 4b. Campaign batches
DROP POLICY IF EXISTS "Admin full access to campaign_batches" ON campaign_batches;
DROP POLICY IF EXISTS "Portal users can view campaigns for their stores" ON campaign_batches;
DROP POLICY IF EXISTS "Service role full access to campaign_batches" ON campaign_batches;
DROP POLICY IF EXISTS "Access campaign_batches by store" ON campaign_batches;
DROP POLICY IF EXISTS "Manage campaign_batches" ON campaign_batches;
DROP POLICY IF EXISTS "Users can view campaign_batches" ON campaign_batches;

-- 4c. Campaign history
DROP POLICY IF EXISTS "Users can view campaign history for accessible stores" ON campaign_history;
DROP POLICY IF EXISTS "Campaign managers can create history" ON campaign_history;

-- 4d. Client reports - BROKEN: uses auth.role() = 'authenticated'
DROP POLICY IF EXISTS "Users can view client reports" ON client_reports;
DROP POLICY IF EXISTS "Users can create client reports" ON client_reports;
DROP POLICY IF EXISTS "Users can delete client reports" ON client_reports;

-- 4e. Advanced reporting - BROKEN: ref agent_store_access.user_id/client_id (non-existent columns)
DROP POLICY IF EXISTS "product_costs_select" ON product_costs;
DROP POLICY IF EXISTS "product_costs_insert" ON product_costs;
DROP POLICY IF EXISTS "product_costs_update" ON product_costs;
DROP POLICY IF EXISTS "product_costs_delete" ON product_costs;

DROP POLICY IF EXISTS "store_cost_settings_select" ON store_cost_settings;
DROP POLICY IF EXISTS "store_cost_settings_all" ON store_cost_settings;

DROP POLICY IF EXISTS "order_attribution_select" ON order_attribution;
DROP POLICY IF EXISTS "order_attribution_all" ON order_attribution;

DROP POLICY IF EXISTS "flow_metrics_select" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "flow_metrics_all" ON klaviyo_flow_metrics;

DROP POLICY IF EXISTS "campaign_metrics_select" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_all" ON klaviyo_campaign_metrics;

DROP POLICY IF EXISTS "top_customers_select" ON store_top_customers;
DROP POLICY IF EXISTS "top_customers_all" ON store_top_customers;

DROP POLICY IF EXISTS "attribution_summary_select" ON attribution_summary;
DROP POLICY IF EXISTS "attribution_summary_all" ON attribution_summary;


-- =============================================
-- STEP 5: CREATE PROPER ORG-SCOPED RLS POLICIES
-- (DROP IF EXISTS before each CREATE for idempotency)
-- =============================================

-- 5a. CAMPAIGNS
DROP POLICY IF EXISTS "org_campaigns_select" ON campaigns;
CREATE POLICY "org_campaigns_select" ON campaigns
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_campaigns_insert" ON campaigns;
CREATE POLICY "org_campaigns_insert" ON campaigns
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_manage_store_campaigns(store_id)
  );

DROP POLICY IF EXISTS "org_campaigns_update" ON campaigns;
CREATE POLICY "org_campaigns_update" ON campaigns
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_manage_store_campaigns(store_id));

DROP POLICY IF EXISTS "org_campaigns_delete" ON campaigns;
CREATE POLICY "org_campaigns_delete" ON campaigns
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND can_manage_store_campaigns(store_id)
  );

DROP POLICY IF EXISTS "service_campaigns_all" ON campaigns;
CREATE POLICY "service_campaigns_all" ON campaigns
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5b. CAMPAIGN_BATCHES
DROP POLICY IF EXISTS "org_campaign_batches_select" ON campaign_batches;
CREATE POLICY "org_campaign_batches_select" ON campaign_batches
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR EXISTS (
      SELECT 1 FROM unnest(store_ids) AS sid
      WHERE can_access_store(sid)
    )
  );

DROP POLICY IF EXISTS "org_campaign_batches_insert" ON campaign_batches;
CREATE POLICY "org_campaign_batches_insert" ON campaign_batches
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND (is_admin() OR is_org_owner() OR has_feature('campaign_control'))
  );

DROP POLICY IF EXISTS "org_campaign_batches_update" ON campaign_batches;
CREATE POLICY "org_campaign_batches_update" ON campaign_batches
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR is_admin())
  WITH CHECK (is_admin() OR is_org_owner() OR has_feature('campaign_control'));

DROP POLICY IF EXISTS "org_campaign_batches_delete" ON campaign_batches;
CREATE POLICY "org_campaign_batches_delete" ON campaign_batches
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR is_admin())
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_campaign_batches_all" ON campaign_batches;
CREATE POLICY "service_campaign_batches_all" ON campaign_batches
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5c. CAMPAIGN_HISTORY
DROP POLICY IF EXISTS "org_campaign_history_select" ON campaign_history;
CREATE POLICY "org_campaign_history_select" ON campaign_history
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_access_store(c.store_id)
    )
  );

DROP POLICY IF EXISTS "org_campaign_history_insert" ON campaign_history;
CREATE POLICY "org_campaign_history_insert" ON campaign_history
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_manage_store_campaigns(c.store_id)
    )
  );

DROP POLICY IF EXISTS "service_campaign_history_all" ON campaign_history;
CREATE POLICY "service_campaign_history_all" ON campaign_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5d. CLIENT_REPORTS
DROP POLICY IF EXISTS "org_client_reports_select" ON client_reports;
CREATE POLICY "org_client_reports_select" ON client_reports
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_client(client_id)
  );

DROP POLICY IF EXISTS "org_client_reports_insert" ON client_reports;
CREATE POLICY "org_client_reports_insert" ON client_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_client(client_id)
  );

DROP POLICY IF EXISTS "org_client_reports_update" ON client_reports;
CREATE POLICY "org_client_reports_update" ON client_reports
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_client(client_id))
  WITH CHECK (can_access_client(client_id));

DROP POLICY IF EXISTS "org_client_reports_delete" ON client_reports;
CREATE POLICY "org_client_reports_delete" ON client_reports
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_client(client_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_client_reports_all" ON client_reports;
CREATE POLICY "service_client_reports_all" ON client_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5e. PRODUCT_COSTS
DROP POLICY IF EXISTS "org_product_costs_select" ON product_costs;
CREATE POLICY "org_product_costs_select" ON product_costs
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_product_costs_insert" ON product_costs;
CREATE POLICY "org_product_costs_insert" ON product_costs
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_store(store_id)
  );

DROP POLICY IF EXISTS "org_product_costs_update" ON product_costs;
CREATE POLICY "org_product_costs_update" ON product_costs
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_access_store(store_id));

DROP POLICY IF EXISTS "org_product_costs_delete" ON product_costs;
CREATE POLICY "org_product_costs_delete" ON product_costs
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_product_costs_all" ON product_costs;
CREATE POLICY "service_product_costs_all" ON product_costs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5f. STORE_COST_SETTINGS
DROP POLICY IF EXISTS "org_store_cost_settings_select" ON store_cost_settings;
CREATE POLICY "org_store_cost_settings_select" ON store_cost_settings
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_store_cost_settings_insert" ON store_cost_settings;
CREATE POLICY "org_store_cost_settings_insert" ON store_cost_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_store(store_id)
  );

DROP POLICY IF EXISTS "org_store_cost_settings_update" ON store_cost_settings;
CREATE POLICY "org_store_cost_settings_update" ON store_cost_settings
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_access_store(store_id));

DROP POLICY IF EXISTS "org_store_cost_settings_delete" ON store_cost_settings;
CREATE POLICY "org_store_cost_settings_delete" ON store_cost_settings
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_store_cost_settings_all" ON store_cost_settings;
CREATE POLICY "service_store_cost_settings_all" ON store_cost_settings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5g. ORDER_ATTRIBUTION
DROP POLICY IF EXISTS "org_order_attribution_select" ON order_attribution;
CREATE POLICY "org_order_attribution_select" ON order_attribution
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_order_attribution_insert" ON order_attribution;
CREATE POLICY "org_order_attribution_insert" ON order_attribution
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_store(store_id)
  );

DROP POLICY IF EXISTS "org_order_attribution_update" ON order_attribution;
CREATE POLICY "org_order_attribution_update" ON order_attribution
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_access_store(store_id));

DROP POLICY IF EXISTS "org_order_attribution_delete" ON order_attribution;
CREATE POLICY "org_order_attribution_delete" ON order_attribution
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_order_attribution_all" ON order_attribution;
CREATE POLICY "service_order_attribution_all" ON order_attribution
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5h. KLAVIYO_FLOW_METRICS
DROP POLICY IF EXISTS "org_flow_metrics_select" ON klaviyo_flow_metrics;
CREATE POLICY "org_flow_metrics_select" ON klaviyo_flow_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_flow_metrics_insert" ON klaviyo_flow_metrics;
CREATE POLICY "org_flow_metrics_insert" ON klaviyo_flow_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_store(store_id)
  );

DROP POLICY IF EXISTS "org_flow_metrics_update" ON klaviyo_flow_metrics;
CREATE POLICY "org_flow_metrics_update" ON klaviyo_flow_metrics
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_access_store(store_id));

DROP POLICY IF EXISTS "org_flow_metrics_delete" ON klaviyo_flow_metrics;
CREATE POLICY "org_flow_metrics_delete" ON klaviyo_flow_metrics
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_flow_metrics_all" ON klaviyo_flow_metrics;
CREATE POLICY "service_flow_metrics_all" ON klaviyo_flow_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5i. KLAVIYO_CAMPAIGN_METRICS
DROP POLICY IF EXISTS "org_campaign_metrics_select" ON klaviyo_campaign_metrics;
CREATE POLICY "org_campaign_metrics_select" ON klaviyo_campaign_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_campaign_metrics_insert" ON klaviyo_campaign_metrics;
CREATE POLICY "org_campaign_metrics_insert" ON klaviyo_campaign_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_store(store_id)
  );

DROP POLICY IF EXISTS "org_campaign_metrics_update" ON klaviyo_campaign_metrics;
CREATE POLICY "org_campaign_metrics_update" ON klaviyo_campaign_metrics
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_access_store(store_id));

DROP POLICY IF EXISTS "org_campaign_metrics_delete" ON klaviyo_campaign_metrics;
CREATE POLICY "org_campaign_metrics_delete" ON klaviyo_campaign_metrics
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_campaign_metrics_all" ON klaviyo_campaign_metrics;
CREATE POLICY "service_campaign_metrics_all" ON klaviyo_campaign_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5j. STORE_TOP_CUSTOMERS
DROP POLICY IF EXISTS "org_top_customers_select" ON store_top_customers;
CREATE POLICY "org_top_customers_select" ON store_top_customers
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_top_customers_insert" ON store_top_customers;
CREATE POLICY "org_top_customers_insert" ON store_top_customers
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_store(store_id)
  );

DROP POLICY IF EXISTS "org_top_customers_update" ON store_top_customers;
CREATE POLICY "org_top_customers_update" ON store_top_customers
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_access_store(store_id));

DROP POLICY IF EXISTS "org_top_customers_delete" ON store_top_customers;
CREATE POLICY "org_top_customers_delete" ON store_top_customers
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_top_customers_all" ON store_top_customers;
CREATE POLICY "service_top_customers_all" ON store_top_customers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5k. ATTRIBUTION_SUMMARY
DROP POLICY IF EXISTS "org_attribution_summary_select" ON attribution_summary;
CREATE POLICY "org_attribution_summary_select" ON attribution_summary
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "org_attribution_summary_insert" ON attribution_summary;
CREATE POLICY "org_attribution_summary_insert" ON attribution_summary
  FOR INSERT TO authenticated
  WITH CHECK (
    (org_id = current_org_id() OR org_id IS NULL)
    AND can_access_store(store_id)
  );

DROP POLICY IF EXISTS "org_attribution_summary_update" ON attribution_summary;
CREATE POLICY "org_attribution_summary_update" ON attribution_summary
  FOR UPDATE TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id))
  WITH CHECK (can_access_store(store_id));

DROP POLICY IF EXISTS "org_attribution_summary_delete" ON attribution_summary;
CREATE POLICY "org_attribution_summary_delete" ON attribution_summary
  FOR DELETE TO authenticated
  USING (
    (org_id = current_org_id() OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

DROP POLICY IF EXISTS "service_attribution_summary_all" ON attribution_summary;
CREATE POLICY "service_attribution_summary_all" ON attribution_summary
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- =============================================
-- STEP 6: COMMENTS
-- =============================================
COMMENT ON COLUMN clients.org_id IS 'Organization that owns this client';
COMMENT ON COLUMN client_stores.org_id IS 'Organization that owns this store (denormalized from clients for performance)';
COMMENT ON COLUMN campaigns.org_id IS 'Organization that owns this campaign';
COMMENT ON COLUMN campaign_batches.org_id IS 'Organization that owns this batch';
COMMENT ON COLUMN campaign_history.org_id IS 'Organization (denormalized from campaigns for RLS performance)';
COMMENT ON COLUMN client_reports.org_id IS 'Organization that owns this report';
COMMENT ON COLUMN product_costs.org_id IS 'Organization that owns this product cost record';
COMMENT ON COLUMN store_cost_settings.org_id IS 'Organization that owns this cost setting';
COMMENT ON COLUMN order_attribution.org_id IS 'Organization that owns this attribution record';
COMMENT ON COLUMN klaviyo_flow_metrics.org_id IS 'Organization that owns this flow metrics cache';
COMMENT ON COLUMN klaviyo_campaign_metrics.org_id IS 'Organization that owns this campaign metrics cache';
COMMENT ON COLUMN store_top_customers.org_id IS 'Organization that owns this top customers cache';
COMMENT ON COLUMN attribution_summary.org_id IS 'Organization that owns this attribution summary';

COMMIT;
