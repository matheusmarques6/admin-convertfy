-- ============================================================
-- Convertfy Admin - Pipeline Enhancements Migration
-- Features:
--   1. Pipeline CRUD completo (created_by)
--   2. Pipeline Members (atribuicao a agentes)
--   3. Import Rules (importacao automatica de clientes)
--   4. Import Logs
-- ============================================================

-- ========================
-- ENUMS
-- ========================

CREATE TYPE pipeline_member_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE import_status AS ENUM ('success', 'failed', 'skipped');

-- ========================
-- PIPELINE ENHANCEMENTS
-- ========================

-- Adicionar coluna created_by em pipelines
ALTER TABLE pipelines ADD COLUMN created_by UUID REFERENCES profiles(id);

-- Atualizar pipelines existentes com o primeiro admin (se houver)
UPDATE pipelines SET created_by = (
  SELECT id FROM profiles WHERE role = 'admin' LIMIT 1
) WHERE created_by IS NULL;

-- ========================
-- PIPELINE MEMBERS
-- ========================

CREATE TABLE pipeline_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role pipeline_member_role NOT NULL DEFAULT 'viewer',
  added_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pipeline_id, user_id)
);

CREATE INDEX idx_pipeline_members_pipeline ON pipeline_members(pipeline_id);
CREATE INDEX idx_pipeline_members_user ON pipeline_members(user_id);

-- Adicionar membros existentes: todos os usuarios atuais viram 'editor' na pipeline padrao
INSERT INTO pipeline_members (pipeline_id, user_id, role)
SELECT p.id, pr.id, 'owner'
FROM pipelines p
CROSS JOIN profiles pr
WHERE p.is_default = true
AND pr.role = 'admin'
ON CONFLICT (pipeline_id, user_id) DO NOTHING;

INSERT INTO pipeline_members (pipeline_id, user_id, role)
SELECT p.id, pr.id, 'editor'
FROM pipelines p
CROSS JOIN profiles pr
WHERE p.is_default = true
AND pr.role != 'admin'
ON CONFLICT (pipeline_id, user_id) DO NOTHING;

-- ========================
-- PIPELINE IMPORT RULES
-- ========================

CREATE TABLE pipeline_import_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  target_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  conditions JSONB NOT NULL DEFAULT '[]',
  deal_defaults JSONB DEFAULT '{}',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_rules_pipeline ON pipeline_import_rules(pipeline_id);
CREATE INDEX idx_import_rules_active ON pipeline_import_rules(is_active) WHERE is_active = true;

-- ========================
-- PIPELINE IMPORT LOGS
-- ========================

CREATE TABLE pipeline_import_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  rule_id UUID REFERENCES pipeline_import_rules(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  status import_status NOT NULL DEFAULT 'success',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_import_logs_rule ON pipeline_import_logs(rule_id);
CREATE INDEX idx_import_logs_client ON pipeline_import_logs(client_id);
CREATE INDEX idx_import_logs_pipeline ON pipeline_import_logs(pipeline_id);
CREATE INDEX idx_import_logs_created ON pipeline_import_logs(created_at DESC);

-- ========================
-- TRIGGERS
-- ========================

-- Auto-update updated_at on pipeline_import_rules
CREATE TRIGGER update_pipeline_import_rules_updated_at
  BEFORE UPDATE ON pipeline_import_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- FUNCTION: Avaliar condicoes de importacao
-- ========================

CREATE OR REPLACE FUNCTION evaluate_import_conditions(
  client_row clients,
  conditions JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  condition JSONB;
  field_val TEXT;
  cond_field TEXT;
  cond_operator TEXT;
  cond_value TEXT;
  result BOOLEAN := true;
BEGIN
  -- Se nao tem condicoes, retorna true
  IF conditions IS NULL OR jsonb_array_length(conditions) = 0 THEN
    RETURN true;
  END IF;

  -- Avaliar cada condicao (logica AND: todas devem ser verdadeiras)
  FOR condition IN SELECT * FROM jsonb_array_elements(conditions)
  LOOP
    cond_field := condition->>'field';
    cond_operator := condition->>'operator';
    cond_value := condition->>'value';

    -- Obter valor do campo do cliente
    CASE cond_field
      WHEN 'status' THEN field_val := client_row.status::TEXT;
      WHEN 'company' THEN field_val := client_row.company;
      WHEN 'email' THEN field_val := client_row.email;
      WHEN 'phone' THEN field_val := client_row.phone;
      WHEN 'website' THEN field_val := client_row.website;
      WHEN 'name' THEN field_val := client_row.name;
      WHEN 'health_score' THEN field_val := client_row.health_score::TEXT;
      WHEN 'owner_id' THEN field_val := client_row.owner_id::TEXT;
      WHEN 'tags' THEN field_val := array_to_string(client_row.tags, ',');
      ELSE
        -- Custom fields: custom_fields.campo
        IF cond_field LIKE 'custom_fields.%' THEN
          field_val := client_row.custom_fields->>substring(cond_field FROM 15);
        ELSE
          field_val := NULL;
        END IF;
    END CASE;

    -- Avaliar operador
    CASE cond_operator
      WHEN 'equals' THEN
        result := result AND (LOWER(COALESCE(field_val, '')) = LOWER(COALESCE(cond_value, '')));
      WHEN 'not_equals' THEN
        result := result AND (LOWER(COALESCE(field_val, '')) != LOWER(COALESCE(cond_value, '')));
      WHEN 'contains' THEN
        result := result AND (LOWER(COALESCE(field_val, '')) LIKE '%' || LOWER(COALESCE(cond_value, '')) || '%');
      WHEN 'not_contains' THEN
        result := result AND (LOWER(COALESCE(field_val, '')) NOT LIKE '%' || LOWER(COALESCE(cond_value, '')) || '%');
      WHEN 'starts_with' THEN
        result := result AND (LOWER(COALESCE(field_val, '')) LIKE LOWER(COALESCE(cond_value, '')) || '%');
      WHEN 'ends_with' THEN
        result := result AND (LOWER(COALESCE(field_val, '')) LIKE '%' || LOWER(COALESCE(cond_value, '')));
      WHEN 'is_empty' THEN
        result := result AND (field_val IS NULL OR field_val = '');
      WHEN 'is_not_empty' THEN
        result := result AND (field_val IS NOT NULL AND field_val != '');
      WHEN 'greater_than' THEN
        result := result AND (COALESCE(field_val, '0')::NUMERIC > COALESCE(cond_value, '0')::NUMERIC);
      WHEN 'less_than' THEN
        result := result AND (COALESCE(field_val, '0')::NUMERIC < COALESCE(cond_value, '0')::NUMERIC);
      WHEN 'in' THEN
        result := result AND (LOWER(COALESCE(field_val, '')) = ANY(
          SELECT LOWER(trim(v)) FROM jsonb_array_elements_text(condition->'value') AS v
        ));
      ELSE
        result := false;
    END CASE;

    -- Early exit se ja falhou
    IF NOT result THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- ========================
-- FUNCTION: Processar regras de importacao automatica
-- ========================

CREATE OR REPLACE FUNCTION process_pipeline_import_rules()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
  conditions_met BOOLEAN;
  deal_title TEXT;
  deal_owner UUID;
  new_deal_id UUID;
  deal_value DECIMAL(10,2);
  deal_probability INTEGER;
BEGIN
  -- Iterar sobre regras ativas ordenadas por prioridade (maior primeiro)
  FOR rule IN
    SELECT pir.*
    FROM pipeline_import_rules pir
    WHERE pir.is_active = true
    ORDER BY pir.priority DESC
  LOOP
    -- Verificar se ja existe deal para este cliente nesta pipeline
    IF EXISTS (
      SELECT 1 FROM deals
      WHERE client_id = NEW.id AND pipeline_id = rule.pipeline_id
    ) THEN
      -- Registrar como skipped
      INSERT INTO pipeline_import_logs (rule_id, pipeline_id, stage_id, client_id, status, metadata)
      VALUES (rule.id, rule.pipeline_id, rule.target_stage_id, NEW.id, 'skipped',
        jsonb_build_object('reason', 'deal_already_exists'));
      CONTINUE;
    END IF;

    -- Avaliar condicoes
    conditions_met := evaluate_import_conditions(NEW, rule.conditions);

    IF conditions_met THEN
      -- Gerar titulo do deal usando template
      deal_title := COALESCE(rule.deal_defaults->>'title_template', '{{client.name}} - Novo Deal');
      deal_title := replace(deal_title, '{{client.name}}', COALESCE(NEW.name, ''));
      deal_title := replace(deal_title, '{{client.company}}', COALESCE(NEW.company, ''));
      deal_title := replace(deal_title, '{{client.email}}', COALESCE(NEW.email, ''));

      -- Valores padrao
      deal_owner := COALESCE(
        (rule.deal_defaults->>'owner_id')::UUID,
        NEW.owner_id,
        rule.created_by
      );
      deal_value := COALESCE((rule.deal_defaults->>'value')::DECIMAL, 0);
      deal_probability := COALESCE((rule.deal_defaults->>'probability')::INTEGER, 10);

      -- Criar deal
      new_deal_id := uuid_generate_v4();

      BEGIN
        INSERT INTO deals (id, pipeline_id, stage_id, client_id, title, value, probability, owner_id, notes)
        VALUES (
          new_deal_id,
          rule.pipeline_id,
          rule.target_stage_id,
          NEW.id,
          deal_title,
          deal_value,
          deal_probability,
          deal_owner,
          'Importado automaticamente pela regra: ' || rule.name
        );

        -- Registrar log de sucesso
        INSERT INTO pipeline_import_logs (rule_id, pipeline_id, stage_id, client_id, deal_id, status)
        VALUES (rule.id, rule.pipeline_id, rule.target_stage_id, NEW.id, new_deal_id, 'success');

      EXCEPTION WHEN OTHERS THEN
        -- Registrar log de erro
        INSERT INTO pipeline_import_logs (rule_id, pipeline_id, stage_id, client_id, status, error_message)
        VALUES (rule.id, rule.pipeline_id, rule.target_stage_id, NEW.id, 'failed', SQLERRM);
      END;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: executar quando cliente e criado OU atualizado
CREATE TRIGGER on_client_process_import_rules
  AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION process_pipeline_import_rules();

-- ========================
-- FUNCTION: Auto-adicionar criador como owner da pipeline
-- ========================

CREATE OR REPLACE FUNCTION auto_add_pipeline_owner()
RETURNS TRIGGER AS $$
BEGIN
  -- Adicionar o criador como owner da pipeline
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO pipeline_members (pipeline_id, user_id, role, added_by)
    VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
    ON CONFLICT (pipeline_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_pipeline_created_add_owner
  AFTER INSERT ON pipelines
  FOR EACH ROW EXECUTE FUNCTION auto_add_pipeline_owner();

-- ========================
-- RLS POLICIES - Pipeline Members
-- ========================

ALTER TABLE pipeline_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_import_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_import_logs ENABLE ROW LEVEL SECURITY;

-- Pipeline Members: usuarios veem membros de pipelines onde sao membros
CREATE POLICY "Users see members of their pipelines" ON pipeline_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Pipeline Members: owners e admins podem gerenciar membros
CREATE POLICY "Owners can manage members" ON pipeline_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Owners can update members" ON pipeline_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Owners can delete members" ON pipeline_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Import Rules: membros da pipeline com role editor+ podem ver/gerenciar
CREATE POLICY "Members can view import rules" ON pipeline_import_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_import_rules.pipeline_id
      AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Editors can manage import rules" ON pipeline_import_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_import_rules.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Import Logs: membros da pipeline podem ver
CREATE POLICY "Members can view import logs" ON pipeline_import_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_import_logs.pipeline_id
      AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "System can insert import logs" ON pipeline_import_logs
  FOR INSERT WITH CHECK (true);

-- ========================
-- ATUALIZAR RLS DE PIPELINES (mais restritivo)
-- ========================

-- Remover policies antigas de pipelines (permissivas demais)
DROP POLICY IF EXISTS "Users can view pipelines" ON pipelines;
DROP POLICY IF EXISTS "Users can manage pipelines" ON pipelines;

-- Novas policies: usuarios veem pipelines onde sao membros OU admins
CREATE POLICY "Members can view their pipelines" ON pipelines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Qualquer autenticado pode criar pipeline (tornara-se owner via trigger)
CREATE POLICY "Authenticated users can create pipelines" ON pipelines
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Apenas owners e admins podem editar/deletar pipelines
CREATE POLICY "Owners can update pipelines" ON pipelines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid() AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Owners can delete pipelines" ON pipelines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid() AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ========================
-- ATUALIZAR RLS DE PIPELINE STAGES
-- ========================

DROP POLICY IF EXISTS "Users can view pipeline_stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Users can manage pipeline_stages" ON pipeline_stages;

CREATE POLICY "Members can view stages" ON pipeline_stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_stages.pipeline_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Owners can manage stages" ON pipeline_stages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_stages.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ========================
-- ATUALIZAR RLS DE DEALS
-- ========================

DROP POLICY IF EXISTS "Users can view deals" ON deals;
DROP POLICY IF EXISTS "Users can manage deals" ON deals;

-- Membros podem ver deals de suas pipelines
CREATE POLICY "Members can view deals" ON deals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Editors e owners podem gerenciar deals
CREATE POLICY "Editors can manage deals" ON deals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Editors can update deals" ON deals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Editors can delete deals" ON deals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
