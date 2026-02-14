-- =============================================
-- FASE 6: SISTEMA DE ONBOARDING
-- =============================================
-- Templates de onboarding com etapas padrão
-- Tracking de progresso por cliente/loja

-- Enum de status do onboarding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_status') THEN
    CREATE TYPE onboarding_status AS ENUM (
      'not_started',    -- Ainda não iniciou
      'in_progress',    -- Em andamento
      'paused',         -- Pausado (aguardando cliente)
      'completed',      -- Concluído com sucesso
      'cancelled'       -- Cancelado
    );
  END IF;
END$$;

-- Enum de status da etapa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onboarding_step_status') THEN
    CREATE TYPE onboarding_step_status AS ENUM (
      'pending',        -- Aguardando
      'in_progress',    -- Em andamento
      'blocked',        -- Bloqueada (dependência)
      'completed',      -- Concluída
      'skipped'         -- Pulada
    );
  END IF;
END$$;

-- =============================================
-- TEMPLATES DE ONBOARDING
-- =============================================
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  description TEXT,

  -- Para qual tipo de cliente/plano
  plan_type TEXT, -- 'starter', 'growth', 'scale', 'enterprise', null = todos

  -- Configurações
  estimated_days INT DEFAULT 14,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Template padrão

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Apenas um template pode ser default
CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_templates_default
  ON onboarding_templates(is_default) WHERE is_default = true;

-- =============================================
-- ETAPAS DO TEMPLATE
-- =============================================
CREATE TABLE IF NOT EXISTS onboarding_template_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  template_id UUID REFERENCES onboarding_templates(id) ON DELETE CASCADE NOT NULL,

  -- Identificação
  name TEXT NOT NULL,
  description TEXT,

  -- Categoria da etapa
  category TEXT NOT NULL, -- 'setup', 'integration', 'training', 'launch'

  -- Ordem e dependências
  position INT NOT NULL DEFAULT 0,
  depends_on UUID REFERENCES onboarding_template_steps(id), -- Etapa que precisa ser concluída antes

  -- Responsável padrão (role)
  default_assignee_role TEXT, -- 'cs', 'developer', 'designer', etc.

  -- Estimativa
  estimated_hours INT DEFAULT 2,

  -- Webhook n8n (para automação futura)
  webhook_on_complete TEXT, -- URL do webhook a chamar quando concluir

  -- Metadados extras
  metadata JSONB DEFAULT '{}',

  is_required BOOLEAN DEFAULT true, -- Se pode ser pulada

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_steps_template ON onboarding_template_steps(template_id);
CREATE INDEX IF NOT EXISTS idx_template_steps_position ON onboarding_template_steps(template_id, position);

-- =============================================
-- ONBOARDING DO CLIENTE
-- =============================================
CREATE TABLE IF NOT EXISTS client_onboardings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relacionamentos
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE, -- Pode ser por loja específica
  template_id UUID REFERENCES onboarding_templates(id),

  -- Status geral
  status onboarding_status NOT NULL DEFAULT 'not_started',

  -- Progresso
  progress_percent INT DEFAULT 0,

  -- Responsável principal
  assigned_to UUID REFERENCES org_members(id),

  -- Datas
  started_at TIMESTAMPTZ,
  target_completion_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Notas
  notes TEXT,

  -- Resultado da análise n8n (quando implementado)
  store_analysis JSONB, -- Dados da análise da loja
  generated_copies JSONB, -- Copies geradas pela IA

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Um cliente só pode ter um onboarding ativo por loja
  UNIQUE(client_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_client_onboardings_client ON client_onboardings(client_id);
CREATE INDEX IF NOT EXISTS idx_client_onboardings_store ON client_onboardings(store_id);
CREATE INDEX IF NOT EXISTS idx_client_onboardings_status ON client_onboardings(status);
CREATE INDEX IF NOT EXISTS idx_client_onboardings_assigned ON client_onboardings(assigned_to);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_client_onboardings_updated_at ON client_onboardings;
CREATE TRIGGER set_client_onboardings_updated_at
  BEFORE UPDATE ON client_onboardings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- ETAPAS DO ONBOARDING DO CLIENTE
-- =============================================
CREATE TABLE IF NOT EXISTS client_onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  onboarding_id UUID REFERENCES client_onboardings(id) ON DELETE CASCADE NOT NULL,
  template_step_id UUID REFERENCES onboarding_template_steps(id), -- Referência ao template

  -- Identificação (copiado do template para permitir customização)
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0,

  -- Status
  status onboarding_step_status NOT NULL DEFAULT 'pending',

  -- Responsável
  assigned_to UUID REFERENCES org_members(id),

  -- Datas
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  due_date TIMESTAMPTZ,

  -- Quem completou
  completed_by UUID REFERENCES profiles(id),

  -- Notas e bloqueios
  notes TEXT,
  blocked_reason TEXT,

  -- Metadados
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_onboarding_steps_onboarding ON client_onboarding_steps(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_steps_status ON client_onboarding_steps(status);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_steps_assigned ON client_onboarding_steps(assigned_to);
CREATE INDEX IF NOT EXISTS idx_client_onboarding_steps_position ON client_onboarding_steps(onboarding_id, position);

DROP TRIGGER IF EXISTS set_client_onboarding_steps_updated_at ON client_onboarding_steps;
CREATE TRIGGER set_client_onboarding_steps_updated_at
  BEFORE UPDATE ON client_onboarding_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- INSERIR TEMPLATE PADRÃO COM ETAPAS
-- =============================================
DO $$
DECLARE
  v_template_id UUID;
  v_step1_id UUID;
  v_step2_id UUID;
  v_step3_id UUID;
  v_step4_id UUID;
  v_step5_id UUID;
BEGIN
  -- Criar template padrão
  INSERT INTO onboarding_templates (name, description, estimated_days, is_default)
  VALUES (
    'Onboarding Padrão',
    'Template padrão de onboarding para novos clientes',
    14,
    true
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_template_id;

  -- Se criou o template, adicionar etapas
  IF v_template_id IS NOT NULL THEN
    -- Etapa 1: Contrato e Pagamento
    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, estimated_hours, is_required)
    VALUES (v_template_id, 'Contrato Assinado', 'Confirmar assinatura do contrato pelo cliente', 'setup', 1, 1, true)
    RETURNING id INTO v_step1_id;

    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, depends_on, estimated_hours, is_required)
    VALUES (v_template_id, 'Pagamento Confirmado', 'Confirmar primeiro pagamento ou setup fee', 'setup', 2, v_step1_id, 1, true)
    RETURNING id INTO v_step2_id;

    -- Etapa 2: Integrações
    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, depends_on, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Acesso à Loja Configurado', 'Configurar acesso à loja Shopify/Nuvemshop do cliente', 'integration', 3, v_step2_id, 2, 'developer', true)
    RETURNING id INTO v_step3_id;

    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, depends_on, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Klaviyo Conectado', 'Integrar conta Klaviyo do cliente ou criar nova', 'integration', 4, v_step3_id, 3, 'developer', true)
    RETURNING id INTO v_step4_id;

    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, depends_on, estimated_hours, default_assignee_role, is_required, metadata)
    VALUES (v_template_id, 'Análise da Loja', 'Realizar análise completa da loja e gerar copies', 'integration', 5, v_step4_id, 4, 'cs', true, '{"trigger_n8n": true}'::jsonb)
    RETURNING id INTO v_step5_id;

    -- Etapa 3: Configuração
    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, depends_on, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Flows Básicos Criados', 'Criar flows de boas-vindas, carrinho abandonado e pós-compra', 'setup', 6, v_step5_id, 8, 'cs', true);

    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, depends_on, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Templates de Email Configurados', 'Configurar templates com identidade visual do cliente', 'setup', 7, v_step5_id, 4, 'designer', true);

    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Segmentos Criados', 'Criar segmentos de clientes (ativos, inativos, VIP, etc)', 'setup', 8, 2, 'cs', true);

    -- Etapa 4: Treinamento
    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Reunião de Kickoff', 'Realizar reunião inicial com o cliente', 'training', 9, 1, 'cs', true);

    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Treinamento do Dashboard', 'Treinar cliente no uso do dashboard e relatórios', 'training', 10, 2, 'cs', false);

    -- Etapa 5: Lançamento
    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Primeira Campanha Enviada', 'Criar e enviar primeira campanha de email', 'launch', 11, 3, 'cs', true);

    INSERT INTO onboarding_template_steps (template_id, name, description, category, position, estimated_hours, default_assignee_role, is_required)
    VALUES (v_template_id, 'Revisão Final e Go-Live', 'Revisar todas as configurações e ativar cliente', 'launch', 12, 2, 'cs', true);
  END IF;
END$$;

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_onboarding_steps ENABLE ROW LEVEL SECURITY;

-- Templates: todos autenticados podem ver
CREATE POLICY "View templates" ON onboarding_templates
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY "Manage templates" ON onboarding_templates
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

-- Template steps
CREATE POLICY "View template steps" ON onboarding_template_steps
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage template steps" ON onboarding_template_steps
  FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

-- Client onboardings
CREATE POLICY "View client onboardings" ON client_onboardings
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR has_feature('onboarding_control')
    OR has_feature('onboarding_view')
    OR assigned_to = current_org_member_id()
    OR can_access_client(client_id)
  );

CREATE POLICY "Manage client onboardings" ON client_onboardings
  FOR ALL TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR has_feature('onboarding_control')
    OR assigned_to = current_org_member_id()
  )
  WITH CHECK (
    is_admin()
    OR is_org_owner()
    OR has_feature('onboarding_control')
  );

-- Client onboarding steps
CREATE POLICY "View onboarding steps" ON client_onboarding_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM client_onboardings co
      WHERE co.id = onboarding_id
      AND (
        is_admin()
        OR is_org_owner()
        OR has_feature('onboarding_control')
        OR has_feature('onboarding_view')
        OR co.assigned_to = current_org_member_id()
        OR assigned_to = current_org_member_id()
      )
    )
  );

CREATE POLICY "Manage onboarding steps" ON client_onboarding_steps
  FOR ALL TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR has_feature('onboarding_control')
    OR assigned_to = current_org_member_id()
  )
  WITH CHECK (
    is_admin()
    OR is_org_owner()
    OR has_feature('onboarding_control')
    OR assigned_to = current_org_member_id()
  );

-- Service role full access
CREATE POLICY "Service role templates" ON onboarding_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role template_steps" ON onboarding_template_steps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role client_onboardings" ON client_onboardings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role client_onboarding_steps" ON client_onboarding_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- FUNÇÃO: CALCULAR PROGRESSO DO ONBOARDING
-- =============================================
CREATE OR REPLACE FUNCTION calculate_onboarding_progress(p_onboarding_id UUID)
RETURNS INT AS $$
DECLARE
  v_total INT;
  v_completed INT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed' OR status = 'skipped')
  INTO v_total, v_completed
  FROM client_onboarding_steps
  WHERE onboarding_id = p_onboarding_id;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND((v_completed::DECIMAL / v_total) * 100);
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- TRIGGER: ATUALIZAR PROGRESSO AUTOMATICAMENTE
-- =============================================
CREATE OR REPLACE FUNCTION update_onboarding_progress()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar progresso
  UPDATE client_onboardings
  SET
    progress_percent = calculate_onboarding_progress(NEW.onboarding_id),
    status = CASE
      WHEN calculate_onboarding_progress(NEW.onboarding_id) = 100 THEN 'completed'::onboarding_status
      WHEN calculate_onboarding_progress(NEW.onboarding_id) > 0 THEN 'in_progress'::onboarding_status
      ELSE status
    END,
    completed_at = CASE
      WHEN calculate_onboarding_progress(NEW.onboarding_id) = 100 THEN NOW()
      ELSE completed_at
    END
  WHERE id = NEW.onboarding_id;

  -- Se completou, atualizar status do cliente para 'active'
  IF calculate_onboarding_progress(NEW.onboarding_id) = 100 THEN
    UPDATE clients
    SET status = 'active'
    WHERE id = (SELECT client_id FROM client_onboardings WHERE id = NEW.onboarding_id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS onboarding_step_progress_trigger ON client_onboarding_steps;
CREATE TRIGGER onboarding_step_progress_trigger
  AFTER UPDATE OF status ON client_onboarding_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_progress();

-- =============================================
-- COMENTÁRIOS
-- =============================================
COMMENT ON TABLE onboarding_templates IS 'Templates de onboarding com etapas padrão';
COMMENT ON TABLE onboarding_template_steps IS 'Etapas de cada template de onboarding';
COMMENT ON TABLE client_onboardings IS 'Onboarding ativo de cada cliente/loja';
COMMENT ON TABLE client_onboarding_steps IS 'Progresso das etapas de onboarding do cliente';
COMMENT ON COLUMN client_onboardings.store_analysis IS 'Resultado da análise da loja via n8n (futuro)';
COMMENT ON COLUMN client_onboardings.generated_copies IS 'Copies de email geradas pela IA (futuro)';
