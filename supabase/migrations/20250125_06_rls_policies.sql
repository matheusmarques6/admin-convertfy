-- =============================================
-- FASE 1.6: POLÍTICAS RLS COMPLETAS
-- =============================================
-- Atualiza RLS em tabelas existentes
-- Adiciona RLS nas novas tabelas

-- =============================================
-- RLS: ORGANIZATIONS
-- =============================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View active organizations" ON organizations;
DROP POLICY IF EXISTS "Manage organizations" ON organizations;

CREATE POLICY "View active organizations"
  ON organizations FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Manage organizations"
  ON organizations FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- Service role tem acesso total
DROP POLICY IF EXISTS "Service role full access organizations" ON organizations;
CREATE POLICY "Service role full access organizations"
  ON organizations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- RLS: ORG_MEMBERS
-- =============================================
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View org members" ON org_members;
DROP POLICY IF EXISTS "Manage org members" ON org_members;

-- Membros podem ver outros membros da mesma org
CREATE POLICY "View org members"
  ON org_members FOR SELECT TO authenticated
  USING (
    -- Pode ver membros da sua org
    org_id = current_org_id()
    OR is_admin()
  );

-- Apenas admin ou owner pode gerenciar membros
CREATE POLICY "Manage org members"
  ON org_members FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

DROP POLICY IF EXISTS "Service role full access org_members" ON org_members;
CREATE POLICY "Service role full access org_members"
  ON org_members FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- RLS: FEATURES_CATALOG
-- =============================================
ALTER TABLE features_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View features catalog" ON features_catalog;

-- Todos autenticados podem ver o catálogo
CREATE POLICY "View features catalog"
  ON features_catalog FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Manage features catalog" ON features_catalog;
CREATE POLICY "Manage features catalog"
  ON features_catalog FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Service role full access features_catalog" ON features_catalog;
CREATE POLICY "Service role full access features_catalog"
  ON features_catalog FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- RLS: ORG_MEMBER_FEATURES
-- =============================================
ALTER TABLE org_member_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own features" ON org_member_features;
DROP POLICY IF EXISTS "Manage features" ON org_member_features;

-- Membros podem ver suas próprias features
CREATE POLICY "View own features"
  ON org_member_features FOR SELECT TO authenticated
  USING (
    org_member_id = current_org_member_id()
    OR is_admin()
    OR is_org_owner()
  );

-- Apenas admin/owner pode atribuir features
CREATE POLICY "Manage features"
  ON org_member_features FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

DROP POLICY IF EXISTS "Service role full access org_member_features" ON org_member_features;
CREATE POLICY "Service role full access org_member_features"
  ON org_member_features FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- RLS: AGENT_STORE_ACCESS
-- =============================================
ALTER TABLE agent_store_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own store access" ON agent_store_access;
DROP POLICY IF EXISTS "Manage store access" ON agent_store_access;

-- Membros podem ver seu próprio acesso
CREATE POLICY "View own store access"
  ON agent_store_access FOR SELECT TO authenticated
  USING (
    org_member_id = current_org_member_id()
    OR is_admin()
    OR is_org_owner()
  );

-- Admin/owner pode gerenciar acesso
CREATE POLICY "Manage store access"
  ON agent_store_access FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

DROP POLICY IF EXISTS "Service role full access agent_store_access" ON agent_store_access;
CREATE POLICY "Service role full access agent_store_access"
  ON agent_store_access FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- RLS: CLIENTS (ATUALIZAR EXISTENTE)
-- =============================================
DROP POLICY IF EXISTS "Users can view clients" ON clients;
DROP POLICY IF EXISTS "Admin can manage clients" ON clients;
DROP POLICY IF EXISTS "Access clients by permission" ON clients;

CREATE POLICY "Access clients by permission"
  ON clients FOR SELECT TO authenticated
  USING (can_access_client(id));

CREATE POLICY "Admin can manage clients"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (is_admin() OR is_org_owner() OR has_feature('create_clients'));

CREATE POLICY "Admin can update clients"
  ON clients FOR UPDATE TO authenticated
  USING (can_access_client(id) AND (is_admin() OR is_org_owner()))
  WITH CHECK (is_admin() OR is_org_owner());

CREATE POLICY "Admin can delete clients"
  ON clients FOR DELETE TO authenticated
  USING (is_admin() OR is_org_owner());

-- =============================================
-- RLS: CLIENT_STORES (ATUALIZAR EXISTENTE)
-- =============================================
DROP POLICY IF EXISTS "Users can view stores" ON client_stores;
DROP POLICY IF EXISTS "Admin can manage stores" ON client_stores;
DROP POLICY IF EXISTS "Access stores by permission" ON client_stores;

CREATE POLICY "Access stores by permission"
  ON client_stores FOR SELECT TO authenticated
  USING (can_access_store(id));

CREATE POLICY "Admin can manage stores"
  ON client_stores FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

-- =============================================
-- RLS: INVOICES
-- =============================================
DROP POLICY IF EXISTS "Access invoices by client" ON invoices;
DROP POLICY IF EXISTS "Admin can manage invoices" ON invoices;

CREATE POLICY "Access invoices by client"
  ON invoices FOR SELECT TO authenticated
  USING (
    can_access_client(client_id)
    AND has_feature('view_financial')
  );

CREATE POLICY "Admin can manage invoices"
  ON invoices FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

-- =============================================
-- RLS: CAMPAIGNS
-- =============================================
DROP POLICY IF EXISTS "Access campaigns by store" ON campaigns;
DROP POLICY IF EXISTS "Manage campaigns by permission" ON campaigns;

CREATE POLICY "Access campaigns by store"
  ON campaigns FOR SELECT TO authenticated
  USING (can_access_store(store_id));

CREATE POLICY "Manage campaigns by permission"
  ON campaigns FOR ALL TO authenticated
  USING (can_manage_store_campaigns(store_id))
  WITH CHECK (can_manage_store_campaigns(store_id));

-- =============================================
-- RLS: CAMPAIGN_BATCHES
-- =============================================
DROP POLICY IF EXISTS "Admin full access to campaign_batches" ON campaign_batches;
DROP POLICY IF EXISTS "Portal users can view campaigns for their stores" ON campaign_batches;
DROP POLICY IF EXISTS "Service role full access to campaign_batches" ON campaign_batches;

CREATE POLICY "Access campaign_batches by store"
  ON campaign_batches FOR SELECT TO authenticated
  USING (
    -- Tem acesso se tem acesso a alguma das lojas
    EXISTS (
      SELECT 1 FROM unnest(store_ids) AS sid
      WHERE can_access_store(sid)
    )
  );

CREATE POLICY "Manage campaign_batches"
  ON campaign_batches FOR ALL TO authenticated
  USING (
    is_admin() OR is_org_owner() OR has_feature('campaign_control')
  )
  WITH CHECK (
    is_admin() OR is_org_owner() OR has_feature('campaign_control')
  );

CREATE POLICY "Service role full access to campaign_batches"
  ON campaign_batches FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- RLS: REPORTS
-- =============================================
DROP POLICY IF EXISTS "Access reports by client" ON reports;

CREATE POLICY "Access reports by client"
  ON reports FOR SELECT TO authenticated
  USING (
    can_access_client(client_id)
    AND has_feature('view_reports')
  );

CREATE POLICY "Admin can manage reports"
  ON reports FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

-- =============================================
-- RLS: MEETINGS
-- =============================================
DROP POLICY IF EXISTS "Access meetings" ON meetings;

CREATE POLICY "Access meetings"
  ON meetings FOR SELECT TO authenticated
  USING (
    -- Pode ver se é o dono ou pode acessar o cliente
    user_id = auth.uid()
    OR can_access_client(client_id)
  );

CREATE POLICY "Manage own meetings"
  ON meetings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR is_admin() OR is_org_owner())
  WITH CHECK (user_id = auth.uid() OR is_admin() OR is_org_owner());

-- =============================================
-- COMENTÁRIO FINAL
-- =============================================
COMMENT ON SCHEMA public IS 'Schema principal com RLS multi-tenant baseado em org_members + agent_store_access';
