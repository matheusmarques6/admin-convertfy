-- =============================================
-- COPY PIPELINE - Story 3.5
-- =============================================
-- 1. Table for tracking copy flow: approval → generation → design → implementation
-- 2. RLS policies with feature-based access
-- 3. Auto-task trigger on status changes

-- =============================================
-- 1. TABLE: copy_pipeline
-- =============================================

CREATE TABLE IF NOT EXISTS copy_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_id UUID REFERENCES client_stores(id) ON DELETE SET NULL,

  -- Pipeline status
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN (
      'pending_approval',
      'approved',
      'generating',
      'pending_design',
      'in_design',
      'pending_implementation',
      'implementing',
      'completed'
    )),

  -- Links
  briefing_id UUID REFERENCES client_briefings(id) ON DELETE SET NULL,
  onboarding_id UUID REFERENCES client_onboardings(id) ON DELETE SET NULL,
  generated_copys JSONB,
  design_assets JSONB,

  -- Tracking
  approved_by UUID REFERENCES org_members(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  design_assigned_to UUID REFERENCES org_members(id) ON DELETE SET NULL,
  design_started_at TIMESTAMPTZ,
  design_completed_at TIMESTAMPTZ,
  impl_assigned_to UUID REFERENCES org_members(id) ON DELETE SET NULL,
  impl_started_at TIMESTAMPTZ,
  impl_completed_at TIMESTAMPTZ,

  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_copy_pipeline_org_id ON copy_pipeline(org_id);
CREATE INDEX IF NOT EXISTS idx_copy_pipeline_status ON copy_pipeline(status);
CREATE INDEX IF NOT EXISTS idx_copy_pipeline_client_id ON copy_pipeline(client_id);
CREATE INDEX IF NOT EXISTS idx_copy_pipeline_store_id ON copy_pipeline(store_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_copy_pipeline_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_copy_pipeline_updated_at ON copy_pipeline;
CREATE TRIGGER trg_copy_pipeline_updated_at
  BEFORE UPDATE ON copy_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION update_copy_pipeline_updated_at();

-- =============================================
-- 2. RLS POLICIES
-- =============================================

ALTER TABLE copy_pipeline ENABLE ROW LEVEL SECURITY;

-- Admin/service bypass
CREATE POLICY "copy_pipeline_admin_all"
  ON copy_pipeline FOR ALL
  TO authenticated
  USING (is_admin());

-- SELECT: org members with campaign_copy or campaign_control can view
CREATE POLICY "copy_pipeline_select"
  ON copy_pipeline FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = copy_pipeline.org_id
        AND om.is_active = true
        AND (
          om.role IN ('owner', 'manager')
          OR EXISTS (
            SELECT 1 FROM org_member_features omf
            WHERE omf.org_member_id = om.id
              AND omf.feature_key IN ('campaign_copy', 'campaign_control', 'campaign_view')
              AND omf.enabled = true
          )
        )
    )
  );

-- INSERT: only owner/manager or system (via admin client)
CREATE POLICY "copy_pipeline_insert"
  ON copy_pipeline FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = copy_pipeline.org_id
        AND om.is_active = true
        AND om.role IN ('owner', 'manager')
    )
  );

-- UPDATE: based on role + target status
CREATE POLICY "copy_pipeline_update"
  ON copy_pipeline FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = copy_pipeline.org_id
        AND om.is_active = true
        AND (
          om.role IN ('owner', 'manager')
          OR EXISTS (
            SELECT 1 FROM org_member_features omf
            WHERE omf.org_member_id = om.id
              AND omf.feature_key IN ('campaign_copy', 'campaign_control')
              AND omf.enabled = true
          )
        )
    )
  );

-- =============================================
-- 3. AUTO-TASK TRIGGER on status changes
-- =============================================
-- Creates board tasks when pipeline moves to pending_design or pending_implementation

CREATE OR REPLACE FUNCTION copy_pipeline_auto_tasks()
RETURNS TRIGGER AS $$
DECLARE
  v_client_name TEXT;
  v_store_name TEXT;
  v_assignee_id UUID;
  v_max_pos INT;
BEGIN
  -- Only fire on status changes
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Get names for task title
  SELECT c.name INTO v_client_name FROM clients c WHERE c.id = NEW.client_id;
  SELECT cs.store_name INTO v_store_name FROM client_stores cs WHERE cs.id = NEW.store_id;

  -- pending_design: create task for design assignee
  IF NEW.status = 'pending_design' AND NEW.design_assigned_to IS NOT NULL THEN
    v_assignee_id := NEW.design_assigned_to;

    SELECT COALESCE(MAX(position), 0) + 1 INTO v_max_pos
    FROM tasks WHERE org_id = NEW.org_id AND status = 'pending';

    INSERT INTO tasks (title, description, type, priority, status, source_type, source_id,
      org_id, assignee_id, client_id, store_id, position, metadata, tags, created_by)
    VALUES (
      'Copy Design: ' || COALESCE(v_store_name, v_client_name),
      'Copys geradas para ' || COALESCE(v_store_name, v_client_name) || '. Criar peças visuais.',
      'campaign', 'high', 'pending', 'auto_campaign', NEW.id,
      NEW.org_id, v_assignee_id, NEW.client_id, NEW.store_id,
      v_max_pos, '{}', ARRAY[]::TEXT[], v_assignee_id
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- pending_implementation: create task for impl assignee
  IF NEW.status = 'pending_implementation' AND NEW.impl_assigned_to IS NOT NULL THEN
    v_assignee_id := NEW.impl_assigned_to;

    SELECT COALESCE(MAX(position), 0) + 1 INTO v_max_pos
    FROM tasks WHERE org_id = NEW.org_id AND status = 'pending';

    INSERT INTO tasks (title, description, type, priority, status, source_type, source_id,
      org_id, assignee_id, client_id, store_id, position, metadata, tags, created_by)
    VALUES (
      'Implementar: ' || COALESCE(v_store_name, v_client_name),
      'Design concluído para ' || COALESCE(v_store_name, v_client_name) || '. Publicar nas lojas.',
      'campaign', 'high', 'pending', 'auto_campaign', NEW.id,
      NEW.org_id, v_assignee_id, NEW.client_id, NEW.store_id,
      v_max_pos, '{}', ARRAY[]::TEXT[], v_assignee_id
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_copy_pipeline_auto_tasks ON copy_pipeline;
CREATE TRIGGER trg_copy_pipeline_auto_tasks
  AFTER UPDATE ON copy_pipeline
  FOR EACH ROW
  EXECUTE FUNCTION copy_pipeline_auto_tasks();

COMMENT ON TABLE copy_pipeline IS 'Tracks copy flow: approval → generation → design → implementation. Story 3.5.';
COMMENT ON FUNCTION copy_pipeline_auto_tasks() IS 'Auto-creates board tasks when copy pipeline moves to pending_design or pending_implementation. Story 3.5.6.';
