-- ─────────────────────────────────────────────────────────────────────
-- AI Prompt Templates
--
-- Templates de prompt versionados. Variaveis no formato {{nome}} sao
-- substituidas em runtime ao gerar o prompt final pra Claude.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  template TEXT NOT NULL,
  variables JSONB DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_templates_org ON ai_prompt_templates(org_id, category);

ALTER TABLE ai_prompt_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_templates_select" ON ai_prompt_templates;
CREATE POLICY "ai_templates_select" ON ai_prompt_templates
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "ai_templates_manage" ON ai_prompt_templates;
CREATE POLICY "ai_templates_manage" ON ai_prompt_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM org_members
      WHERE org_members.profile_id = auth.uid()
      AND org_members.org_id = ai_prompt_templates.org_id
      AND org_members.role IN ('owner','manager','coo','coordinator')
      AND org_members.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION ai_templates_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_templates_updated ON ai_prompt_templates;
CREATE TRIGGER trg_ai_templates_updated
  BEFORE UPDATE ON ai_prompt_templates
  FOR EACH ROW EXECUTE FUNCTION ai_templates_set_updated_at();
