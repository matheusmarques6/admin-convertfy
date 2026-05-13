-- ─────────────────────────────────────────────────────────────────────
-- Onboarding v2 — schema completo (PRD v2)
--
-- Substitui operational_pipelines (kanban Monday-style generico, vazio,
-- nao havia dados) pelo schema do PRD: pipeline + colunas (tabela
-- separada) + onboardings como entidade primeira-classe.
-- ─────────────────────────────────────────────────────────────────────

-- Drop antigo (0 rows, sem risco)
DROP TABLE IF EXISTS operational_pipelines CASCADE;
ALTER TABLE tasks DROP COLUMN IF EXISTS operational_pipeline_id;
ALTER TABLE tasks DROP COLUMN IF EXISTS operational_column_id;

-- Roles novos: adicionar ao enum org_role
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'ops';
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'estrategista';
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'cs';
ALTER TYPE org_role ADD VALUE IF NOT EXISTS 'financeiro';

-- Enums novos
DO $$ BEGIN
  CREATE TYPE operational_pipeline_type AS ENUM ('onboarding', 'acompanhamento', 'feedback', 'suporte');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_payment_status AS ENUM ('pending', 'paid', 'overdue', 'renewal_due');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_contract_status AS ENUM ('pending', 'sent', 'signed', 'expiring');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE onboarding_status AS ENUM ('in_progress', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE briefing_status AS ENUM ('not_started', 'form_partially_filled', 'generating', 'generated_pending_review', 'approved', 'needs_review');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE deliverable_field_type AS ENUM ('url', 'upload', 'select', 'numeric', 'textarea', 'date', 'checkbox', 'multi_checkbox');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE feedback_severity AS ENUM ('small', 'medium', 'rework_part', 'rework_all');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE version_status AS ENUM ('in_progress', 'approved', 'rejected_by_client');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pipelines operacionais (separadas de pipelines comerciais)
CREATE TABLE operational_pipelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type operational_pipeline_type NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

CREATE INDEX idx_op_pipelines_org ON operational_pipelines(org_id, is_active);

-- Colunas da pipeline com TEMPLATES inline
CREATE TABLE operational_pipeline_columns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pipeline_id UUID NOT NULL REFERENCES operational_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  position INTEGER NOT NULL,
  color TEXT DEFAULT '#6366f1',
  is_initial BOOLEAN DEFAULT FALSE,
  is_final BOOLEAN DEFAULT FALSE,
  checklist_template JSONB DEFAULT '[]'::jsonb,
  deliverables_template JSONB DEFAULT '[]'::jsonb,
  whatsapp_template TEXT,
  default_assignee_role org_role,
  sla_hours INTEGER DEFAULT 24,
  automation_rules JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pipeline_id, slug),
  UNIQUE(pipeline_id, position)
);

CREATE INDEX idx_op_columns_pipeline ON operational_pipeline_columns(pipeline_id, position);

-- Onboarding (card do Kanban)
CREATE TABLE onboardings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES operational_pipelines(id),
  current_column_id UUID REFERENCES operational_pipeline_columns(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  store_id UUID NOT NULL REFERENCES client_stores(id),
  source_deal_id UUID REFERENCES deals(id),
  status onboarding_status DEFAULT 'in_progress',
  current_version INTEGER DEFAULT 1,
  payment_status onboarding_payment_status DEFAULT 'pending',
  contract_status onboarding_contract_status DEFAULT 'pending',
  form_token TEXT UNIQUE NOT NULL,
  form_responses JSONB,
  form_submitted_at TIMESTAMPTZ,
  briefing_status briefing_status DEFAULT 'not_started',
  briefing JSONB,
  briefing_generated_at TIMESTAMPTZ,
  briefing_confirmed_at TIMESTAMPTZ,
  briefing_confirmed_by_client BOOLEAN DEFAULT FALSE,
  tutorial_token TEXT UNIQUE,
  entered_at TIMESTAMPTZ DEFAULT NOW(),
  last_column_change_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_onboardings_org ON onboardings(org_id, status);
CREATE INDEX idx_onboardings_pipeline ON onboardings(pipeline_id);
CREATE INDEX idx_onboardings_column ON onboardings(current_column_id);
CREATE INDEX idx_onboardings_client ON onboardings(client_id);
CREATE INDEX idx_onboardings_store ON onboardings(store_id);
CREATE INDEX idx_onboardings_source_deal ON onboardings(source_deal_id) WHERE source_deal_id IS NOT NULL;
CREATE INDEX idx_onboardings_form_token ON onboardings(form_token);
CREATE INDEX idx_onboardings_tutorial_token ON onboardings(tutorial_token) WHERE tutorial_token IS NOT NULL;
CREATE UNIQUE INDEX idx_onboardings_unique_active ON onboardings(client_id, store_id) WHERE status = 'in_progress';

-- Estender tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS onboarding_id UUID REFERENCES onboardings(id) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS operational_column_id UUID REFERENCES operational_pipeline_columns(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_role org_role;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_tasks_onboarding ON tasks(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_tasks_op_column ON tasks(operational_column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_role ON tasks(assignee_role);

-- Entregaveis estruturados
CREATE TABLE task_deliverables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  field_slug TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type deliverable_field_type NOT NULL,
  required BOOLEAN DEFAULT TRUE,
  value TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size_bytes INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  filled_at TIMESTAMPTZ,
  filled_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, field_slug)
);

CREATE INDEX idx_deliverables_task ON task_deliverables(task_id);

-- Versionamento (entre etapas 3 e 4)
CREATE TABLE onboarding_versions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  onboarding_id UUID NOT NULL REFERENCES onboardings(id) ON DELETE CASCADE,
  column_id UUID REFERENCES operational_pipeline_columns(id),
  version_number INTEGER NOT NULL,
  status version_status DEFAULT 'in_progress',
  client_feedback TEXT,
  feedback_severity feedback_severity,
  deliverables_snapshot JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(onboarding_id, version_number)
);

CREATE INDEX idx_versions_onboarding ON onboarding_versions(onboarding_id, version_number);

-- Audit overrides
CREATE TABLE task_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  onboarding_id UUID REFERENCES onboardings(id),
  column_id UUID REFERENCES operational_pipeline_columns(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  justification TEXT NOT NULL CHECK (length(justification) >= 30),
  items_skipped JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_overrides_user ON task_overrides(user_id);
CREATE INDEX idx_overrides_onboarding ON task_overrides(onboarding_id);
CREATE INDEX idx_overrides_created ON task_overrides(created_at DESC);

-- RLS
ALTER TABLE operational_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_pipeline_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "op_pipes_select" ON operational_pipelines;
CREATE POLICY "op_pipes_select" ON operational_pipelines FOR SELECT USING (
  org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
);
DROP POLICY IF EXISTS "op_pipes_manage" ON operational_pipelines;
CREATE POLICY "op_pipes_manage" ON operational_pipelines FOR ALL USING (
  EXISTS (SELECT 1 FROM org_members om WHERE om.profile_id=auth.uid() AND om.org_id=operational_pipelines.org_id AND om.role IN ('owner','manager','coo','coordinator') AND om.is_active=true)
);

DROP POLICY IF EXISTS "op_cols_select" ON operational_pipeline_columns;
CREATE POLICY "op_cols_select" ON operational_pipeline_columns FOR SELECT USING (
  pipeline_id IN (SELECT id FROM operational_pipelines WHERE org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true))
);
DROP POLICY IF EXISTS "op_cols_manage" ON operational_pipeline_columns;
CREATE POLICY "op_cols_manage" ON operational_pipeline_columns FOR ALL USING (
  EXISTS (SELECT 1 FROM operational_pipelines p JOIN org_members om ON om.org_id=p.org_id WHERE p.id=operational_pipeline_columns.pipeline_id AND om.profile_id=auth.uid() AND om.role IN ('owner','manager','coo','coordinator') AND om.is_active=true)
);

DROP POLICY IF EXISTS "onboardings_select" ON onboardings;
CREATE POLICY "onboardings_select" ON onboardings FOR SELECT USING (
  org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true)
);
DROP POLICY IF EXISTS "onboardings_manage" ON onboardings;
CREATE POLICY "onboardings_manage" ON onboardings FOR ALL USING (
  org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true)
);

DROP POLICY IF EXISTS "deliverables_all" ON task_deliverables;
CREATE POLICY "deliverables_all" ON task_deliverables FOR ALL USING (
  task_id IN (SELECT id FROM tasks WHERE org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true))
);

DROP POLICY IF EXISTS "versions_select" ON onboarding_versions;
CREATE POLICY "versions_select" ON onboarding_versions FOR SELECT USING (
  onboarding_id IN (SELECT id FROM onboardings WHERE org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true))
);
DROP POLICY IF EXISTS "versions_insert" ON onboarding_versions;
CREATE POLICY "versions_insert" ON onboarding_versions FOR INSERT WITH CHECK (
  onboarding_id IN (SELECT id FROM onboardings WHERE org_id IN (SELECT org_id FROM org_members WHERE profile_id=auth.uid() AND is_active=true))
);

DROP POLICY IF EXISTS "overrides_select" ON task_overrides;
CREATE POLICY "overrides_select" ON task_overrides FOR SELECT USING (
  user_id = auth.uid() OR EXISTS (SELECT 1 FROM org_members WHERE profile_id=auth.uid() AND role IN ('owner','manager') AND is_active=true)
);
DROP POLICY IF EXISTS "overrides_insert" ON task_overrides;
CREATE POLICY "overrides_insert" ON task_overrides FOR INSERT WITH CHECK (user_id = auth.uid());

-- Updated_at triggers
CREATE OR REPLACE FUNCTION onboarding_set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_op_pipes_updated ON operational_pipelines;
CREATE TRIGGER trg_op_pipes_updated BEFORE UPDATE ON operational_pipelines FOR EACH ROW EXECUTE FUNCTION onboarding_set_updated_at();
DROP TRIGGER IF EXISTS trg_op_cols_updated ON operational_pipeline_columns;
CREATE TRIGGER trg_op_cols_updated BEFORE UPDATE ON operational_pipeline_columns FOR EACH ROW EXECUTE FUNCTION onboarding_set_updated_at();
DROP TRIGGER IF EXISTS trg_onb_updated ON onboardings;
CREATE TRIGGER trg_onb_updated BEFORE UPDATE ON onboardings FOR EACH ROW EXECUTE FUNCTION onboarding_set_updated_at();
DROP TRIGGER IF EXISTS trg_deliv_updated ON task_deliverables;
CREATE TRIGGER trg_deliv_updated BEFORE UPDATE ON task_deliverables FOR EACH ROW EXECUTE FUNCTION onboarding_set_updated_at();
