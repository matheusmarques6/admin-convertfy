-- =============================================
-- FASE 1.3: SISTEMA DE FEATURES
-- =============================================
-- Catálogo de features disponíveis no sistema
-- Features atribuídas a cada membro da org

-- Catálogo de features
CREATE TABLE IF NOT EXISTS features_catalog (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'onboarding', 'campaign', 'team', 'admin', 'calendar'
  icon TEXT, -- Nome do ícone lucide
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir features do sistema
INSERT INTO features_catalog (key, name, description, category, icon, sort_order) VALUES
  -- Onboarding
  ('onboarding_control', 'Controle de Onboarding', 'Gerenciar processo de onboarding de clientes', 'onboarding', 'UserPlus', 10),
  ('onboarding_view', 'Visualizar Onboarding', 'Ver status de onboarding (somente leitura)', 'onboarding', 'Eye', 11),

  -- Equipe
  ('team_control', 'Controle de Equipe', 'Ver e gerenciar tarefas de toda a equipe', 'team', 'Users', 20),
  ('team_view', 'Visualizar Equipe', 'Ver tarefas da equipe (somente leitura)', 'team', 'Eye', 21),

  -- Campanhas
  ('campaign_control', 'Controle de Campanha', 'Criar e gerenciar campanhas em lote', 'campaign', 'Megaphone', 30),
  ('campaign_view', 'Visualizar Campanhas', 'Ver campanhas (somente leitura)', 'campaign', 'Eye', 31),
  ('campaign_copy', 'Gerar Copies', 'Gerar copies para campanhas', 'campaign', 'FileText', 32),

  -- Solicitações
  ('request_control', 'Controle de Solicitações', 'Criar e gerenciar solicitações', 'request', 'ClipboardList', 40),
  ('request_execute', 'Executar Solicitações', 'Receber e executar solicitações', 'request', 'CheckSquare', 41),

  -- Calendário
  ('calendar_control', 'Calendário Pessoal', 'Gerenciar calendário pessoal de tarefas', 'calendar', 'Calendar', 50),

  -- Admin
  ('create_clients', 'Criar Clientes', 'Criar novas contas de clientes', 'admin', 'UserPlus', 60),
  ('manage_portal_users', 'Gerenciar Usuários Portal', 'Criar e gerenciar usuários do portal do cliente', 'admin', 'Users', 61),
  ('view_reports', 'Ver Relatórios', 'Acessar relatórios de clientes', 'admin', 'BarChart', 62),
  ('view_financial', 'Ver Financeiro', 'Acessar dados financeiros', 'admin', 'DollarSign', 63)

ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

-- Features atribuídas a membros
CREATE TABLE IF NOT EXISTS org_member_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamento
  org_member_id UUID REFERENCES org_members(id) ON DELETE CASCADE NOT NULL,
  feature_key TEXT REFERENCES features_catalog(key) ON DELETE CASCADE NOT NULL,

  -- Controle
  enabled BOOLEAN DEFAULT true,

  -- Quem atribuiu
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),

  -- Notas do admin
  notes TEXT,

  -- Constraint: um membro só pode ter cada feature uma vez
  UNIQUE(org_member_id, feature_key)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_features_catalog_category ON features_catalog(category);
CREATE INDEX IF NOT EXISTS idx_org_member_features_member ON org_member_features(org_member_id);
CREATE INDEX IF NOT EXISTS idx_org_member_features_feature ON org_member_features(feature_key);
CREATE INDEX IF NOT EXISTS idx_org_member_features_enabled ON org_member_features(org_member_id, enabled) WHERE enabled = true;

-- =============================================
-- ATRIBUIR FEATURES PADRÃO POR ROLE
-- =============================================
-- Owners têm todas as features
-- Outros roles têm features específicas

DO $$
DECLARE
  v_member RECORD;
  v_feature RECORD;
BEGIN
  -- Para cada membro da org
  FOR v_member IN
    SELECT om.id, om.role, om.profile_id
    FROM org_members om
    WHERE om.is_active = true
  LOOP
    -- Owners recebem TODAS as features
    IF v_member.role = 'owner' THEN
      FOR v_feature IN SELECT key FROM features_catalog WHERE is_active = true LOOP
        INSERT INTO org_member_features (org_member_id, feature_key, enabled, granted_by)
        VALUES (v_member.id, v_feature.key, true, v_member.profile_id)
        ON CONFLICT (org_member_id, feature_key) DO NOTHING;
      END LOOP;

    -- Managers recebem controles de equipe e visualização
    ELSIF v_member.role = 'manager' THEN
      INSERT INTO org_member_features (org_member_id, feature_key, enabled)
      VALUES
        (v_member.id, 'team_control', true),
        (v_member.id, 'onboarding_view', true),
        (v_member.id, 'campaign_view', true),
        (v_member.id, 'request_control', true),
        (v_member.id, 'calendar_control', true)
      ON CONFLICT (org_member_id, feature_key) DO NOTHING;

    -- Outros roles recebem apenas calendário pessoal
    ELSE
      INSERT INTO org_member_features (org_member_id, feature_key, enabled)
      VALUES
        (v_member.id, 'calendar_control', true),
        (v_member.id, 'request_execute', true)
      ON CONFLICT (org_member_id, feature_key) DO NOTHING;
    END IF;
  END LOOP;
END$$;

-- Comentários
COMMENT ON TABLE features_catalog IS 'Catálogo de features disponíveis no sistema';
COMMENT ON TABLE org_member_features IS 'Features atribuídas a cada membro';
COMMENT ON COLUMN features_catalog.category IS 'Categoria para agrupar na UI';
COMMENT ON COLUMN org_member_features.enabled IS 'Se false, feature foi revogada mas mantida para histórico';
