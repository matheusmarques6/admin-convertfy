-- =============================================
-- FASE 1.4: ACESSO DE AGENTES A LOJAS
-- =============================================
-- Controle granular de quais lojas cada agente pode acessar
-- Permissões específicas por loja

CREATE TABLE IF NOT EXISTS agent_store_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamentos
  org_member_id UUID REFERENCES org_members(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE NOT NULL,

  -- Permissões granulares
  can_view BOOLEAN DEFAULT true,           -- Pode visualizar dados da loja
  can_edit BOOLEAN DEFAULT false,          -- Pode editar configurações
  can_manage_onboarding BOOLEAN DEFAULT false, -- Pode gerenciar onboarding
  can_manage_campaigns BOOLEAN DEFAULT false,  -- Pode gerenciar campanhas
  can_manage_reports BOOLEAN DEFAULT false,    -- Pode gerenciar relatórios

  -- Metadados
  assigned_by UUID REFERENCES profiles(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,

  -- Constraint: um membro só pode ter acesso a cada loja uma vez
  UNIQUE(org_member_id, store_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_agent_store_access_member ON agent_store_access(org_member_id);
CREATE INDEX IF NOT EXISTS idx_agent_store_access_store ON agent_store_access(store_id);
CREATE INDEX IF NOT EXISTS idx_agent_store_access_view ON agent_store_access(org_member_id, can_view) WHERE can_view = true;

-- =============================================
-- MIGRAR: DAR ACESSO A TODAS AS LOJAS PARA OWNERS
-- =============================================
DO $$
DECLARE
  v_owner RECORD;
  v_store RECORD;
BEGIN
  -- Para cada owner
  FOR v_owner IN
    SELECT om.id as member_id, om.profile_id
    FROM org_members om
    WHERE om.role = 'owner' AND om.is_active = true
  LOOP
    -- Dar acesso a todas as lojas
    FOR v_store IN SELECT id FROM client_stores WHERE is_active = true LOOP
      INSERT INTO agent_store_access (
        org_member_id,
        store_id,
        can_view,
        can_edit,
        can_manage_onboarding,
        can_manage_campaigns,
        can_manage_reports,
        assigned_by
      )
      VALUES (
        v_owner.member_id,
        v_store.id,
        true,
        true,
        true,
        true,
        true,
        v_owner.profile_id
      )
      ON CONFLICT (org_member_id, store_id) DO NOTHING;
    END LOOP;
  END LOOP;
END$$;

-- Comentários
COMMENT ON TABLE agent_store_access IS 'Controle granular de acesso de agentes a lojas específicas';
COMMENT ON COLUMN agent_store_access.can_view IS 'Pode visualizar dados da loja no dashboard';
COMMENT ON COLUMN agent_store_access.can_edit IS 'Pode editar configurações da loja';
COMMENT ON COLUMN agent_store_access.can_manage_onboarding IS 'Pode gerenciar processo de onboarding';
COMMENT ON COLUMN agent_store_access.can_manage_campaigns IS 'Pode criar/editar campanhas';
COMMENT ON COLUMN agent_store_access.can_manage_reports IS 'Pode gerenciar relatórios';
