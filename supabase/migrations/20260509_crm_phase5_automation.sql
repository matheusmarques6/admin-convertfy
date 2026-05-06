-- ════════════════════════════════════════════════════════════════════
-- CRM Convertfy — Fase 5: Engine de automacao DAG + AI Actions
--
-- Estrategia: estender `automations` existente com campos para DAG
-- versionado e idempotencia. Manter `actions JSONB` (legado linear)
-- mas adicionar `dag JSONB` (estrutura nova).
--
-- DAG = { nodes: [{id, type, config}], edges: [{from, to, condition?}] }
--
-- AI Actions: nodes com type='ai_action' carregam prompt versionado +
-- schema de output (JSON Schema ou Zod-compatible) + model + max_tokens.
-- ════════════════════════════════════════════════════════════════════

-- ── Estende automations ────────────────────────────────────────────
ALTER TABLE automations ADD COLUMN IF NOT EXISTS scope TEXT
  CHECK (scope IS NULL OR scope IN ('sales', 'cs', 'internal', 'general'));

ALTER TABLE automations ADD COLUMN IF NOT EXISTS org_id UUID
  REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE automations ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS dag JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_automations_org_active
  ON automations(org_id, is_active) WHERE is_active = TRUE;

-- ── crm_automation_runs (execucoes individuais) ────────────────────
-- automation_logs ja existe mas e linear. Esta tabela tem estrutura
-- detalhada por DAG run.
CREATE TABLE IF NOT EXISTS crm_automation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  -- Entidades de contexto
  trigger_type TEXT NOT NULL,
  trigger_data JSONB DEFAULT '{}'::jsonb,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES crm_threads(id) ON DELETE SET NULL,
  store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,

  -- Idempotencia: evita re-disparar pra mesmo trigger no mesmo target
  idempotency_key TEXT,

  -- Estado
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- Trace dos nodes executados (em ordem)
  node_results JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (automation_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_org_status
  ON crm_automation_runs(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_automation
  ON crm_automation_runs(automation_id, created_at DESC);

-- ── crm_ai_actions (versionamento de AI Actions) ───────────────────
CREATE TABLE IF NOT EXISTS crm_ai_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,

  name TEXT NOT NULL,
  description TEXT,

  -- Versionamento
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Configuracao
  model TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  max_tokens INTEGER NOT NULL DEFAULT 1024,
  temperature NUMERIC(3, 2) NOT NULL DEFAULT 0.7,

  -- Prompts (template com placeholders {{var}})
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,

  -- JSON Schema do output esperado (pra validacao)
  output_schema JSONB DEFAULT '{}'::jsonb,

  -- Casos de uso: 'lead_qualification', 'reply_suggestion', 'deal_summary' etc.
  use_case TEXT NOT NULL,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_actions_org_use_case
  ON crm_ai_actions(org_id, use_case, is_active);

-- ── crm_ai_action_runs (audit + observabilidade) ───────────────────
CREATE TABLE IF NOT EXISTS crm_ai_action_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ai_action_id UUID REFERENCES crm_ai_actions(id) ON DELETE CASCADE NOT NULL,
  automation_run_id UUID REFERENCES crm_automation_runs(id) ON DELETE SET NULL,

  input_vars JSONB NOT NULL DEFAULT '{}'::jsonb,
  rendered_prompt TEXT,
  raw_output TEXT,
  parsed_output JSONB,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'invalid_output')),
  error_message TEXT,

  -- Telemetria
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_cents INTEGER,
  duration_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_ai_action_runs_action
  ON crm_ai_action_runs(ai_action_id, created_at DESC);

-- ── Trigger: updated_at ────────────────────────────────────────────
CREATE TRIGGER crm_set_updated_at_ai_actions BEFORE UPDATE ON crm_ai_actions
FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

-- ── RLS permissive (multi-tenant via org_id no servidor) ───────────
ALTER TABLE crm_automation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_actions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ai_action_runs  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_automation_runs_authenticated" ON crm_automation_runs
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_ai_actions_authenticated" ON crm_ai_actions
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_ai_action_runs_authenticated" ON crm_ai_action_runs
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
