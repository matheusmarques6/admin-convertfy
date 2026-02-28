-- =============================================
-- FASE 1.5: FUNÇÕES HELPER PARA RLS
-- =============================================
-- Funções reutilizáveis para todas as policies RLS
-- Usar SECURITY DEFINER + STABLE para performance

-- =============================================
-- FUNÇÃO: É admin do sistema?
-- =============================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_admin() IS 'Verifica se usuário atual é admin do sistema';

-- =============================================
-- FUNÇÃO: É membro de alguma organização?
-- =============================================
CREATE OR REPLACE FUNCTION is_org_member()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE profile_id = auth.uid()
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_org_member() IS 'Verifica se usuário é membro ativo de alguma org';

-- =============================================
-- FUNÇÃO: É owner da organização?
-- =============================================
-- TODO(epic-8/C2): Esta função não filtra por org_id — retorna TRUE para owner de QUALQUER org.
-- Quando multi-org for implementado, refatorar para is_org_owner(p_org_id UUID).
CREATE OR REPLACE FUNCTION is_org_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM org_members
    WHERE profile_id = auth.uid()
    AND role = 'owner'
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_org_owner() IS 'Verifica se usuário é owner de alguma org (sem filtro de org_id - ver TODO epic-8/C2)';

-- =============================================
-- FUNÇÃO: Retorna org_member_id do usuário atual
-- =============================================
CREATE OR REPLACE FUNCTION current_org_member_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM org_members
    WHERE profile_id = auth.uid()
    AND is_active = true
    ORDER BY role = 'owner' DESC -- Prioriza owner se tiver múltiplas
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION current_org_member_id() IS 'Retorna o ID do org_member do usuário atual';

-- =============================================
-- FUNÇÃO: Retorna org_id do usuário atual
-- =============================================
CREATE OR REPLACE FUNCTION current_org_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT org_id FROM org_members
    WHERE profile_id = auth.uid()
    AND is_active = true
    ORDER BY role = 'owner' DESC
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION current_org_id() IS 'Retorna o ID da organização do usuário atual';

-- =============================================
-- FUNÇÃO: Tem uma feature específica?
-- =============================================
CREATE OR REPLACE FUNCTION has_feature(p_feature_key TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin tem todas as features
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Owner tem todas as features
  IF is_org_owner() THEN
    RETURN true;
  END IF;

  -- Verifica se membro tem a feature habilitada
  RETURN EXISTS (
    SELECT 1 FROM org_member_features omf
    JOIN org_members om ON om.id = omf.org_member_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND omf.feature_key = p_feature_key
    AND omf.enabled = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION has_feature(TEXT) IS 'Verifica se usuário tem acesso a uma feature específica';

-- =============================================
-- FUNÇÃO: Pode acessar uma loja específica?
-- =============================================
CREATE OR REPLACE FUNCTION can_access_store(p_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin acessa tudo
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Owner acessa tudo
  IF is_org_owner() THEN
    RETURN true;
  END IF;

  -- Verifica acesso específico
  RETURN EXISTS (
    SELECT 1 FROM agent_store_access asa
    JOIN org_members om ON om.id = asa.org_member_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND asa.store_id = p_store_id
    AND asa.can_view = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_store(UUID) IS 'Verifica se usuário pode acessar uma loja';

-- =============================================
-- FUNÇÃO: Pode acessar um cliente? (via lojas)
-- =============================================
CREATE OR REPLACE FUNCTION can_access_client(p_client_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin acessa tudo
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Owner acessa tudo
  IF is_org_owner() THEN
    RETURN true;
  END IF;

  -- Verifica se tem acesso a alguma loja do cliente
  RETURN EXISTS (
    SELECT 1 FROM agent_store_access asa
    JOIN org_members om ON om.id = asa.org_member_id
    JOIN client_stores cs ON cs.id = asa.store_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND cs.client_id = p_client_id
    AND asa.can_view = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_access_client(UUID) IS 'Verifica se usuário pode acessar um cliente (via suas lojas)';

-- =============================================
-- FUNÇÃO: Pode gerenciar onboarding de uma loja?
-- =============================================
CREATE OR REPLACE FUNCTION can_manage_store_onboarding(p_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Admin pode tudo
  IF is_admin() THEN
    RETURN true;
  END IF;

  -- Owner pode tudo
  IF is_org_owner() THEN
    RETURN true;
  END IF;

  -- Precisa ter feature + acesso à loja
  IF NOT has_feature('onboarding_control') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM agent_store_access asa
    JOIN org_members om ON om.id = asa.org_member_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND asa.store_id = p_store_id
    AND asa.can_manage_onboarding = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_manage_store_onboarding(UUID) IS 'Verifica se pode gerenciar onboarding de uma loja';

-- =============================================
-- FUNÇÃO: Pode gerenciar campanhas de uma loja?
-- =============================================
CREATE OR REPLACE FUNCTION can_manage_store_campaigns(p_store_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  IF is_admin() OR is_org_owner() THEN
    RETURN true;
  END IF;

  IF NOT has_feature('campaign_control') THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM agent_store_access asa
    JOIN org_members om ON om.id = asa.org_member_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND asa.store_id = p_store_id
    AND asa.can_manage_campaigns = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_manage_store_campaigns(UUID) IS 'Verifica se pode gerenciar campanhas de uma loja';

-- =============================================
-- FUNÇÃO: Lista IDs de lojas acessíveis
-- =============================================
CREATE OR REPLACE FUNCTION accessible_store_ids()
RETURNS SETOF UUID AS $$
BEGIN
  -- Admin/Owner vê todas
  IF is_admin() OR is_org_owner() THEN
    RETURN QUERY SELECT id FROM client_stores WHERE is_active = true;
  END IF;

  -- Outros veem apenas as com acesso
  RETURN QUERY
    SELECT DISTINCT asa.store_id
    FROM agent_store_access asa
    JOIN org_members om ON om.id = asa.org_member_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND asa.can_view = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION accessible_store_ids() IS 'Retorna lista de store_ids que o usuário pode acessar';

-- =============================================
-- FUNÇÃO: Lista IDs de clientes acessíveis
-- =============================================
CREATE OR REPLACE FUNCTION accessible_client_ids()
RETURNS SETOF UUID AS $$
BEGIN
  -- Admin/Owner vê todos
  IF is_admin() OR is_org_owner() THEN
    RETURN QUERY SELECT id FROM clients;
  END IF;

  -- Outros veem apenas os com lojas acessíveis
  RETURN QUERY
    SELECT DISTINCT cs.client_id
    FROM agent_store_access asa
    JOIN org_members om ON om.id = asa.org_member_id
    JOIN client_stores cs ON cs.id = asa.store_id
    WHERE om.profile_id = auth.uid()
    AND om.is_active = true
    AND asa.can_view = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION accessible_client_ids() IS 'Retorna lista de client_ids que o usuário pode acessar';
