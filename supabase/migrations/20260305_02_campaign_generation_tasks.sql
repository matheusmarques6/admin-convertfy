-- ============================================================
-- Migration: Campaign Generation Tasks Pipeline
-- Story: 20.10 - Approval workflow + parallel task tracking
-- Date: 2026-03-05
--
-- Flow:
--   1. COO generates copies (Epic 20) -> status 'processing' -> 'done'
--   2. COO approves generation -> status 'approved'
--   3. Trigger creates 3 tasks: designer, techlead, sdr
--   4. Each role completes independently
--   5. When all complete -> trigger sets status 'completed' + notifies
-- ============================================================

-- ============================================================
-- STEP 1: Add 'sdr' and 'techlead' to org_role enum
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'sdr'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'org_role')
  ) THEN
    ALTER TYPE org_role ADD VALUE 'sdr' AFTER 'support';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'techlead'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'org_role')
  ) THEN
    ALTER TYPE org_role ADD VALUE 'techlead' AFTER 'developer';
  END IF;
END$$;

-- Also add to user_role enum if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'sdr'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      -- sdr already exists in user_role from initial_schema, skip
      NULL;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = 'techlead'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
      ALTER TYPE user_role ADD VALUE 'techlead';
    END IF;
  END IF;
END$$;

-- ============================================================
-- STEP 2: Expand campaign_generations status CHECK
-- ============================================================
-- Current: 'draft', 'processing', 'done'
-- New:     'draft', 'processing', 'done', 'approved', 'completed'

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
  JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
    AND att.attrelid = con.conrelid
  WHERE con.conrelid = 'campaign_generations'::regclass
    AND con.contype = 'c'
    AND att.attname = 'status'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE campaign_generations DROP CONSTRAINT %I',
      v_constraint_name
    );
  END IF;
END$$;

ALTER TABLE campaign_generations
  ADD CONSTRAINT campaign_generations_status_check
  CHECK (status IN ('draft', 'processing', 'done', 'approved', 'completed'));

-- ============================================================
-- STEP 3: Add approval columns to campaign_generations
-- ============================================================

ALTER TABLE campaign_generations
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES org_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ============================================================
-- STEP 4: CREATE TABLE campaign_generation_tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_generation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parent
  generation_id UUID NOT NULL
    REFERENCES campaign_generations(id) ON DELETE CASCADE,

  -- Org for RLS (denormalized from clients via campaign_generations)
  org_id UUID NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,

  -- Role: which team function handles this task
  role TEXT NOT NULL
    CHECK (role IN ('designer', 'techlead', 'sdr')),

  -- Assignment (NULL = unassigned, use org default)
  assignee_id UUID
    REFERENCES org_members(id) ON DELETE SET NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),

  -- Tracking
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID
    REFERENCES org_members(id) ON DELETE SET NULL,
  notes TEXT,

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One task per role per generation
  UNIQUE (generation_id, role)
);

COMMENT ON TABLE campaign_generation_tasks
  IS 'Parallel tasks created when COO approves a campaign generation. One per role (designer, techlead, sdr). All must complete for generation to move to completed.';

-- ============================================================
-- STEP 5: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cg_tasks_generation_id
  ON campaign_generation_tasks(generation_id);

CREATE INDEX IF NOT EXISTS idx_cg_tasks_org_id
  ON campaign_generation_tasks(org_id);

CREATE INDEX IF NOT EXISTS idx_cg_tasks_assignee_status
  ON campaign_generation_tasks(assignee_id, status)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_cg_tasks_generation_status
  ON campaign_generation_tasks(generation_id, status);

-- ============================================================
-- STEP 6: updated_at trigger
-- ============================================================

CREATE TRIGGER set_cg_tasks_updated_at
  BEFORE UPDATE ON campaign_generation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 7: TRIGGER — Auto-create tasks when generation approved
-- ============================================================

CREATE OR REPLACE FUNCTION fn_create_generation_tasks()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_role TEXT;
BEGIN
  -- Only fire when status changes TO 'approved'
  IF NEW.status = 'approved'
     AND (OLD.status IS DISTINCT FROM 'approved')
  THEN
    -- Resolve org_id from the client
    SELECT c.org_id INTO v_org_id
    FROM clients c
    WHERE c.id = NEW.client_id;

    IF v_org_id IS NULL THEN
      RAISE WARNING 'fn_create_generation_tasks: client % has no org_id', NEW.client_id;
      RETURN NEW;
    END IF;

    -- Create one task per role (idempotent via UNIQUE constraint)
    FOREACH v_role IN ARRAY ARRAY['designer', 'techlead', 'sdr']
    LOOP
      INSERT INTO campaign_generation_tasks (
        generation_id, org_id, role, status
      ) VALUES (
        NEW.id, v_org_id, v_role, 'pending'
      )
      ON CONFLICT (generation_id, role) DO NOTHING;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_create_generation_tasks()
  IS 'Auto-creates 3 parallel tasks (designer, techlead, sdr) when a campaign generation is approved.';

CREATE TRIGGER trg_create_generation_tasks
  AFTER UPDATE ON campaign_generations
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_generation_tasks();

-- ============================================================
-- STEP 8: TRIGGER — Auto-complete generation when all tasks done
-- ============================================================

CREATE OR REPLACE FUNCTION fn_check_generation_completion()
RETURNS TRIGGER AS $$
DECLARE
  v_total INT;
  v_done  INT;
BEGIN
  -- Only check when a task moves to completed/skipped
  IF NEW.status NOT IN ('completed', 'skipped') THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('completed', 'skipped'))
  INTO v_total, v_done
  FROM campaign_generation_tasks
  WHERE generation_id = NEW.generation_id;

  -- All done? Mark generation as completed (only from approved)
  IF v_total > 0 AND v_total = v_done THEN
    UPDATE campaign_generations
    SET status = 'completed'
    WHERE id = NEW.generation_id
      AND status = 'approved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION fn_check_generation_completion()
  IS 'Checks if all tasks for a generation are completed/skipped. If so, advances generation to completed.';

CREATE TRIGGER trg_check_generation_completion
  AFTER UPDATE OF status ON campaign_generation_tasks
  FOR EACH ROW
  EXECUTE FUNCTION fn_check_generation_completion();

-- ============================================================
-- STEP 9: RLS — campaign_generation_tasks
-- ============================================================

ALTER TABLE campaign_generation_tasks ENABLE ROW LEVEL SECURITY;

-- Admin bypass
CREATE POLICY "cg_tasks_admin_all"
  ON campaign_generation_tasks FOR ALL
  TO authenticated
  USING (is_admin());

-- Org members can see tasks in their org
CREATE POLICY "cg_tasks_org_select"
  ON campaign_generation_tasks FOR SELECT
  TO authenticated
  USING (org_id = current_org_id());

-- Owner/manager can insert tasks (manual creation or approval)
CREATE POLICY "cg_tasks_owner_insert"
  ON campaign_generation_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = campaign_generation_tasks.org_id
        AND om.is_active = true
        AND om.role IN ('owner', 'manager', 'coo')
    )
  );

-- Assignee can update own task; owner/manager/coo can update any
CREATE POLICY "cg_tasks_update"
  ON campaign_generation_tasks FOR UPDATE
  TO authenticated
  USING (
    assignee_id = current_org_member_id()
    OR EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = campaign_generation_tasks.org_id
        AND om.is_active = true
        AND om.role IN ('owner', 'manager', 'coo')
    )
  );

-- ============================================================
-- STEP 10: RLS — Add org member policies to campaign_generations
-- (currently only portal users have SELECT)
-- ============================================================

-- Org members can SELECT generations for their org's clients
CREATE POLICY "org_member_select_generations"
  ON campaign_generations FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT c.id FROM clients c
      WHERE c.org_id = current_org_id()
    )
  );

-- Owner/Manager/COO can UPDATE generations (to approve)
CREATE POLICY "org_member_update_generations"
  ON campaign_generations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      JOIN clients c ON c.org_id = om.org_id
      WHERE om.profile_id = auth.uid()
        AND om.is_active = true
        AND om.role IN ('owner', 'manager', 'coo')
        AND c.id = campaign_generations.client_id
    )
  );

-- ============================================================
-- STEP 11: Update board_config trigger for sdr/techlead roles
-- ============================================================

CREATE OR REPLACE FUNCTION apply_board_config_preset()
RETURNS TRIGGER AS $$
BEGIN
  -- Owner/Manager/COO: see all task sources
  IF NEW.role IN ('owner', 'manager', 'coo') THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, true,
      true, true, true,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Designer/Developer/TechLead: core task sources
  ELSIF NEW.role IN ('designer', 'developer', 'techlead') THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, true,
      false, false, false,
      true, 'weekly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- SDR: campaign focused
  ELSIF NEW.role = 'sdr' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      false, true, true,
      false, false, false,
      true, 'weekly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Coordinator: broad access
  ELSIF NEW.role = 'coordinator' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, false,
      true, true, true,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Support: broad access
  ELSIF NEW.role = 'support' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      true, true, false,
      true, true, true,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Copywriter: campaign focused
  ELSIF NEW.role = 'copywriter' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      false, false, true,
      false, false, false,
      true, 'weekly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Analyst: reports focused
  ELSIF NEW.role = 'analyst' THEN
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      false, true, false,
      false, true, false,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;

  -- Default: minimal
  ELSE
    INSERT INTO board_config (org_member_id, org_id,
      show_onboarding_tasks, show_meeting_tasks, show_campaign_tasks,
      show_feedback_tasks, show_report_tasks, show_contract_tasks,
      show_manual_tasks, calendar_view_mode, show_personal_events)
    VALUES (NEW.id, NEW.org_id,
      false, true, false,
      false, false, false,
      true, 'monthly', true)
    ON CONFLICT (org_member_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION apply_board_config_preset()
  IS 'Auto-creates board_config with role-based presets. Updated to include sdr and techlead roles.';
