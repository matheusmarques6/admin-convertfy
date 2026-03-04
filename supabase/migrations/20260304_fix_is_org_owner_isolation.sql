-- =============================================
-- FIX: is_org_owner() cross-org data isolation
-- =============================================
-- CRÍTICO #2 (QA Audit): is_org_owner() sem filtro de org_id permitia que
-- owners de Org A acessassem dados de Org B via can_access_store() e
-- can_access_client(), e gerenciassem membros/lojas de outras orgs.
--
-- Correções aplicadas:
-- 1. Adiciona is_org_owner(p_org_id UUID) - versão parametrizada
-- 2. Remove atalho is_org_owner() não-scopado de can_access_store()
--    e can_access_client() — o JOIN com org_members já cobre owners
-- 3. Atualiza políticas RLS que usavam is_org_owner() para gerenciar
--    dados inter-org (org_members, org_member_features, agent_store_access,
--    clients, client_stores)
--
-- IDEMPOTENT: Safe to re-run
-- =============================================

BEGIN;

-- =============================================
-- 1. ADICIONAR is_org_owner(p_org_id UUID)
--    Versão parametrizada para verificar ownership de org específica
-- =============================================
CREATE OR REPLACE FUNCTION is_org_owner(p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE profile_id = auth.uid()
    AND org_id = p_org_id
    AND role = 'owner'
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_org_owner(UUID) IS 'Verifica se usuário é owner da org especificada (org-scoped, seguro para multi-tenant)';

-- Atualiza comentário da versão sem parâmetro
COMMENT ON FUNCTION is_org_owner() IS 'DEPRECATED: Verifica se usuário é owner de QUALQUER org. Usar is_org_owner(org_id) para isolamento correto. Mantida para compatibilidade com has_feature(), can_manage_store_onboarding(), can_manage_store_campaigns() que já validam acesso pela própria lógica.';


-- =============================================
-- 2. CORRIGIR can_access_store()
--    Remove atalho is_org_owner() não-scopado.
--    O JOIN com org_members já filtra por org corretamente para todos,
--    incluindo owners (que também são org_members com role='owner').
-- =============================================
CREATE OR REPLACE FUNCTION can_access_store(p_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin acessa tudo
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Any active org member can view stores in their org (includes owners)
  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN client_stores cs ON cs.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND cs.id = p_store_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_store(UUID) IS 'Verifica se usuário pode acessar uma loja. Owners incluídos via org_members join (org-scoped).';


-- =============================================
-- 3. CORRIGIR can_access_client()
--    Mesmo padrão de can_access_store().
-- =============================================
CREATE OR REPLACE FUNCTION can_access_client(p_client_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin acessa tudo
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Any active org member can view clients in their org (includes owners)
  RETURN EXISTS (
    SELECT 1 FROM org_members om
    JOIN clients c ON c.org_id = om.org_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND c.id = p_client_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_client(UUID) IS 'Verifica se usuário pode acessar um cliente. Owners incluídos via org_members join (org-scoped).';


-- =============================================
-- 4. CORRIGIR RLS: ORG_MEMBERS
--    Owner só pode gerenciar membros da SUA org
-- =============================================
DROP POLICY IF EXISTS "Manage org members" ON org_members;
CREATE POLICY "Manage org members"
  ON org_members FOR ALL TO authenticated
  USING (
    is_admin()
    OR (is_org_owner(org_id))  -- org_id = coluna da linha sendo acessada
  )
  WITH CHECK (
    is_admin()
    OR (is_org_owner(org_id))
  );


-- =============================================
-- 5. CORRIGIR RLS: ORG_MEMBER_FEATURES
--    Owner só pode gerenciar features de membros da SUA org
-- =============================================
DROP POLICY IF EXISTS "View own features" ON org_member_features;
CREATE POLICY "View own features"
  ON org_member_features FOR SELECT TO authenticated
  USING (
    org_member_id = current_org_member_id()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.id = org_member_features.org_member_id
      AND is_org_owner(om.org_id)
    )
  );

DROP POLICY IF EXISTS "Manage features" ON org_member_features;
CREATE POLICY "Manage features"
  ON org_member_features FOR ALL TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.id = org_member_features.org_member_id
      AND is_org_owner(om.org_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.id = org_member_features.org_member_id
      AND is_org_owner(om.org_id)
    )
  );


-- =============================================
-- 6. CORRIGIR RLS: AGENT_STORE_ACCESS
--    Owner só pode gerenciar permissões da SUA org
-- =============================================
DROP POLICY IF EXISTS "View own store access" ON agent_store_access;
CREATE POLICY "View own store access"
  ON agent_store_access FOR SELECT TO authenticated
  USING (
    org_member_id = current_org_member_id()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.id = agent_store_access.org_member_id
      AND is_org_owner(om.org_id)
    )
  );

DROP POLICY IF EXISTS "Manage store access" ON agent_store_access;
CREATE POLICY "Manage store access"
  ON agent_store_access FOR ALL TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.id = agent_store_access.org_member_id
      AND is_org_owner(om.org_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.id = agent_store_access.org_member_id
      AND is_org_owner(om.org_id)
    )
  );


-- =============================================
-- 7. CORRIGIR RLS: CLIENTS
--    Owner só pode gerenciar clientes da SUA org
-- =============================================
DROP POLICY IF EXISTS "Admin can manage clients" ON clients;
CREATE POLICY "Admin can manage clients"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR is_org_owner(current_org_id())
    OR has_feature('create_clients')
  );

DROP POLICY IF EXISTS "Admin can update clients" ON clients;
CREATE POLICY "Admin can update clients"
  ON clients FOR UPDATE TO authenticated
  USING (can_access_client(id) AND (is_admin() OR is_org_owner(org_id)))
  WITH CHECK (is_admin() OR is_org_owner(org_id));

DROP POLICY IF EXISTS "Admin can delete clients" ON clients;
CREATE POLICY "Admin can delete clients"
  ON clients FOR DELETE TO authenticated
  USING (is_admin() OR is_org_owner(org_id));


-- =============================================
-- 8. CORRIGIR RLS: CLIENT_STORES
--    Owner só pode gerenciar lojas da SUA org
-- =============================================
DROP POLICY IF EXISTS "Admin can manage stores" ON client_stores;
CREATE POLICY "Admin can manage stores"
  ON client_stores FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner(org_id))
  WITH CHECK (is_admin() OR is_org_owner(org_id));


-- =============================================
-- 9. CORRIGIR RLS: INVOICES
--    Owner só pode gerenciar invoices da SUA org
--    (via client.org_id lookup)
-- =============================================
DROP POLICY IF EXISTS "Admin can manage invoices" ON invoices;
CREATE POLICY "Admin can manage invoices"
  ON invoices FOR ALL TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = invoices.client_id
      AND is_org_owner(c.org_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = invoices.client_id
      AND is_org_owner(c.org_id)
    )
  );


-- =============================================
-- 10. CORRIGIR RLS: MEETINGS
--     Owner só pode gerenciar meetings da SUA org
-- =============================================
DROP POLICY IF EXISTS "Manage own meetings" ON meetings;
CREATE POLICY "Manage own meetings"
  ON meetings FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = meetings.client_id
      AND is_org_owner(c.org_id)
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = meetings.client_id
      AND is_org_owner(c.org_id)
    )
  );


-- =============================================
-- 11. CORRIGIR RLS: REPORTS
--     Owner só pode gerenciar reports da SUA org
-- =============================================
DROP POLICY IF EXISTS "Admin can manage reports" ON reports;
CREATE POLICY "Admin can manage reports"
  ON reports FOR ALL TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = reports.client_id
      AND is_org_owner(c.org_id)
    )
  )
  WITH CHECK (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM clients c
      WHERE c.id = reports.client_id
      AND is_org_owner(c.org_id)
    )
  );

COMMIT;
