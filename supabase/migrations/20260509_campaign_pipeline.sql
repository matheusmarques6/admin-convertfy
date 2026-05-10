-- ─────────────────────────────────────────────────────────────────────
-- Campaign Pipeline (fabrica de campanhas)
--
-- Pipeline Kanban pra acompanhar ideias -> deploy. Stages:
-- idea, briefing, copy_creation, design, review, ready_to_deploy,
-- deploying, deployed.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campaign_pipeline_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'idea',
  campaign_type TEXT,
  subject_line TEXT,
  preview_text TEXT,
  copy_data JSONB DEFAULT '{}'::jsonb,
  design_data JSONB DEFAULT '{}'::jsonb,
  -- target_stores: [{ store_id, store_name, status: 'pending'|'deployed'|'failed', error?: string }]
  target_stores JSONB DEFAULT '[]'::jsonb,
  -- deploy_config: { segment_id, segment_label, send_date, send_time, utm_source, utm_medium, utm_campaign }
  deploy_config JSONB DEFAULT '{}'::jsonb,
  assigned_to UUID REFERENCES org_members(id),
  priority TEXT DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  -- omnisend_campaign_ids: { store_id: omnisend_campaign_id }
  omnisend_campaign_ids JSONB DEFAULT '{}'::jsonb,
  generation_id UUID,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_org ON campaign_pipeline_items(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_campaign_pipeline_assigned ON campaign_pipeline_items(assigned_to);

ALTER TABLE campaign_pipeline_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_pipeline_select" ON campaign_pipeline_items;
CREATE POLICY "campaign_pipeline_select" ON campaign_pipeline_items
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

DROP POLICY IF EXISTS "campaign_pipeline_manage" ON campaign_pipeline_items;
CREATE POLICY "campaign_pipeline_manage" ON campaign_pipeline_items
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

CREATE OR REPLACE FUNCTION campaign_pipeline_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_pipeline_updated ON campaign_pipeline_items;
CREATE TRIGGER trg_campaign_pipeline_updated
  BEFORE UPDATE ON campaign_pipeline_items
  FOR EACH ROW EXECUTE FUNCTION campaign_pipeline_set_updated_at();
