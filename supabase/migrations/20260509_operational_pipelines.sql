-- ─────────────────────────────────────────────────────────────────────
-- Operational Pipelines (Monday-style)
--
-- Pipelines configuraveis (Onboarding Ops, Acompanhamento, Feedback,
-- Suporte) com colunas + automacoes em JSONB. Tasks sao vinculadas
-- por operational_pipeline_id + operational_column_id (id da coluna
-- no JSONB).
--
-- Aplicado em prod via Supabase MCP em 2026-05-09.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS operational_pipelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'layout-kanban',
  color TEXT DEFAULT '#534AB7',
  -- columns: [{ id: uuid, name: string, color: string, position: int, wip_limit: int|null }]
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- automations: [{ id: uuid, name: string, trigger: string, action: string, config: object, is_active: boolean }]
  automations JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, slug)
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS operational_pipeline_id UUID REFERENCES operational_pipelines(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS operational_column_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_operational ON tasks(operational_pipeline_id, operational_column_id) WHERE operational_pipeline_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_operational_pipelines_org ON operational_pipelines(org_id);

ALTER TABLE operational_pipelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operational_pipelines_select" ON operational_pipelines;
CREATE POLICY "operational_pipelines_select" ON operational_pipelines
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "operational_pipelines_manage" ON operational_pipelines;
CREATE POLICY "operational_pipelines_manage" ON operational_pipelines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.profile_id = auth.uid()
      AND org_members.org_id = operational_pipelines.org_id
      AND org_members.role IN ('owner','manager','coo','coordinator')
      AND org_members.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION op_pipelines_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_op_pipelines_updated ON operational_pipelines;
CREATE TRIGGER trg_op_pipelines_updated
  BEFORE UPDATE ON operational_pipelines
  FOR EACH ROW EXECUTE FUNCTION op_pipelines_set_updated_at();
