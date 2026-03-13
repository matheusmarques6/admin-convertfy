-- ============================================================
-- Migration: Onboarding-Board Sync
-- Date: 2026-03-14
-- Purpose: Bridge onboarding steps with team member boards.
--          When dependencies are met, steps become "ready" and
--          auto-create tasks. Task completion cascades back.
-- Spec: docs/specs/onboarding-board-sync-migration.md
-- ============================================================

-- ============================================================
-- SECTION 1: ENUM EXTENSIONS
-- ============================================================
-- Add 'waiting' and 'review' to onboarding_step_status.
-- ALTER TYPE ADD VALUE cannot run inside a transaction block,
-- but Supabase migrations run each file as a single transaction.
-- We use the DO block with pg_enum check for idempotency.
-- NOTE: enum ADD VALUE is irreversible in PostgreSQL.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'waiting'
      AND enumtypid = 'onboarding_step_status'::regtype
  ) THEN
    ALTER TYPE onboarding_step_status ADD VALUE 'waiting' BEFORE 'pending';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'review'
      AND enumtypid = 'onboarding_step_status'::regtype
  ) THEN
    ALTER TYPE onboarding_step_status ADD VALUE 'review' AFTER 'in_progress';
  END IF;
END $$;

-- ============================================================
-- SECTION 2: SCHEMA CHANGES — onboarding_template_steps
-- ============================================================
-- Add multi-dependency array column alongside existing scalar depends_on.
-- The old column is preserved for backward compatibility.

ALTER TABLE onboarding_template_steps
  ADD COLUMN IF NOT EXISTS depends_on_steps UUID[] DEFAULT '{}';

COMMENT ON COLUMN onboarding_template_steps.depends_on_steps
  IS 'Array of template step IDs this step depends on. Replaces scalar depends_on for multi-dependency support.';

-- Phase column for pipeline-stage tracking
ALTER TABLE onboarding_template_steps
  ADD COLUMN IF NOT EXISTS phase TEXT
    CHECK (phase IN ('pending_approval', 'generating_copies', 'design', 'implementation', 'completed'));

-- Backfill: copy existing scalar depends_on into the array column
UPDATE onboarding_template_steps
SET depends_on_steps = ARRAY[depends_on]
WHERE depends_on IS NOT NULL
  AND (depends_on_steps IS NULL OR depends_on_steps = '{}');

-- ============================================================
-- SECTION 3: SCHEMA CHANGES — client_onboarding_steps
-- ============================================================

-- 3a. Multi-dependency array (references other client_onboarding_steps IDs)
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS depends_on_step_ids UUID[] DEFAULT '{}';

COMMENT ON COLUMN client_onboarding_steps.depends_on_step_ids
  IS 'Array of sibling step IDs (same onboarding) that must be completed/skipped before this step becomes ready.';

-- 3b. Bi-directional link to tasks table
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

COMMENT ON COLUMN client_onboarding_steps.task_id
  IS 'Reference to the auto-created board task for this step. NULL until step becomes ready and task is created.';

-- 3c. org_id for multi-tenant consistency
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

COMMENT ON COLUMN client_onboarding_steps.org_id
  IS 'Organization ID, denormalized from parent client_onboardings for RLS and task creation.';

-- 3d. Phase column for pipeline-stage tracking
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS phase TEXT
    CHECK (phase IN ('pending_approval', 'generating_copies', 'design', 'implementation', 'completed'));

-- 3e. is_required flag (optional steps don't block progress percentage)
ALTER TABLE client_onboarding_steps
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;

-- ============================================================
-- SECTION 4: EXTEND tasks.source_type CHECK CONSTRAINT
-- ============================================================
-- Drop old CHECK and create new one that includes 'auto_onboarding_step'.
-- The column has a DEFAULT of 'manual' so this is safe.

-- Find and drop the existing CHECK constraint on source_type
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT con.conname INTO v_constraint_name
  FROM pg_constraint con
    JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
      AND att.attrelid = con.conrelid
  WHERE con.conrelid = 'public.tasks'::regclass
    AND att.attname = 'source_type'
    AND con.contype = 'c'
  LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

-- Add new CHECK with the additional value
ALTER TABLE tasks
  ADD CONSTRAINT tasks_source_type_check
  CHECK (source_type IN (
    'manual',
    'auto_onboarding',
    'auto_onboarding_step',
    'auto_meeting',
    'auto_campaign',
    'auto_feedback',
    'auto_report',
    'auto_contract'
  ));

-- ============================================================
-- SECTION 5: INDEXES
-- ============================================================

-- Step → Task lookup
CREATE INDEX IF NOT EXISTS idx_cos_task_id
  ON client_onboarding_steps(task_id)
  WHERE task_id IS NOT NULL;

-- Multi-tenant queries on steps
CREATE INDEX IF NOT EXISTS idx_cos_org_id
  ON client_onboarding_steps(org_id);

-- Reverse dependency lookup: "which steps depend on step X?"
CREATE INDEX IF NOT EXISTS idx_cos_depends_on_step_ids
  ON client_onboarding_steps USING GIN(depends_on_step_ids);

-- Fast lookup of step-level auto tasks
CREATE INDEX IF NOT EXISTS idx_tasks_source_onboarding_step
  ON tasks(source_id)
  WHERE source_type = 'auto_onboarding_step';

-- Waiting steps per onboarding (for cascade query)
CREATE INDEX IF NOT EXISTS idx_cos_waiting_steps
  ON client_onboarding_steps(onboarding_id)
  WHERE status = 'waiting';

-- Composite index for phase-based DAG queries
CREATE INDEX IF NOT EXISTS idx_cos_onboarding_status_phase
  ON client_onboarding_steps(onboarding_id, status, phase);

-- ============================================================
-- SECTION 6: FUNCTIONS — Dependency Resolution
-- ============================================================

-- 6a. Check if all dependencies of a step are met
-- VOLATILE (not STABLE) because this is called from triggers that mutate
-- sibling rows in the same transaction — must see in-transaction changes.
CREATE OR REPLACE FUNCTION check_step_dependencies_met(p_step_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_dep_ids UUID[];
  v_unmet_count INT;
BEGIN
  -- Get the dependency array for this step
  SELECT depends_on_step_ids INTO v_dep_ids
  FROM client_onboarding_steps
  WHERE id = p_step_id;

  -- No dependencies = always met
  IF v_dep_ids IS NULL OR array_length(v_dep_ids, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Count dependencies that are NOT completed or skipped
  SELECT COUNT(*) INTO v_unmet_count
  FROM client_onboarding_steps
  WHERE id = ANY(v_dep_ids)
    AND status NOT IN ('completed', 'skipped');

  RETURN v_unmet_count = 0;
END;
$$;

COMMENT ON FUNCTION check_step_dependencies_met(UUID)
  IS 'Returns TRUE if all steps in depends_on_step_ids are completed or skipped.';

-- 6b. Find steps that become ready after a step is completed
-- VOLATILE for same reason as check_step_dependencies_met
CREATE OR REPLACE FUNCTION get_newly_ready_steps(p_onboarding_id UUID, p_completed_step_id UUID)
RETURNS TABLE(step_id UUID, assigned_to UUID, step_name TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cos.id AS step_id,
    cos.assigned_to,
    cos.name AS step_name
  FROM client_onboarding_steps cos
  WHERE cos.onboarding_id = p_onboarding_id
    AND cos.status = 'waiting'
    -- This step depends on the just-completed step
    AND p_completed_step_id = ANY(cos.depends_on_step_ids)
    -- AND all its dependencies are now met
    AND check_step_dependencies_met(cos.id);
END;
$$;

COMMENT ON FUNCTION get_newly_ready_steps(UUID, UUID)
  IS 'Finds waiting steps whose dependencies are now fully met after a specific step completed.';

-- ============================================================
-- SECTION 7: TRIGGERS — Cascade Logic
-- ============================================================

-- 7a. Task completion → Step completion
-- When a board task with source_type='auto_onboarding_step' is completed,
-- mark the linked onboarding step as completed.
CREATE OR REPLACE FUNCTION sync_task_completion_to_step()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act on auto_onboarding_step tasks that just became completed
  IF NEW.source_type = 'auto_onboarding_step'
    AND NEW.status = 'completed'
    AND (OLD.status IS DISTINCT FROM 'completed')
    AND NEW.source_id IS NOT NULL
  THEN
    UPDATE client_onboarding_steps
    SET
      status = 'completed',
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.source_id
      AND status NOT IN ('completed', 'skipped');
  END IF;

  -- Also handle task cancellation → unblock the step
  IF NEW.source_type = 'auto_onboarding_step'
    AND NEW.status = 'cancelled'
    AND (OLD.status IS DISTINCT FROM 'cancelled')
    AND NEW.source_id IS NOT NULL
  THEN
    UPDATE client_onboarding_steps
    SET
      task_id = NULL,
      updated_at = NOW()
    WHERE id = NEW.source_id
      AND task_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_task_completion_to_step()
  IS 'SECURITY DEFINER: Syncs task completion/cancellation back to the linked onboarding step.';

DROP TRIGGER IF EXISTS sync_task_to_step_trigger ON tasks;
CREATE TRIGGER sync_task_to_step_trigger
  AFTER UPDATE OF status ON tasks
  FOR EACH ROW
  WHEN (NEW.source_type = 'auto_onboarding_step')
  EXECUTE FUNCTION sync_task_completion_to_step();

-- 7b. Step completion → Cascade to dependent steps
-- When a step becomes completed or skipped, find waiting dependents
-- and mark them as 'pending' (ready) if all their deps are met.
-- Uses 'a_' prefix to fire BEFORE the progress trigger (alphabetical order).
CREATE OR REPLACE FUNCTION cascade_step_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ready_step RECORD;
  v_payload JSONB;
  v_ready_steps JSONB := '[]'::JSONB;
BEGIN
  -- Only cascade when transitioning TO completed/skipped
  IF NEW.status NOT IN ('completed', 'skipped') THEN
    RETURN NEW;
  END IF;
  IF OLD.status IN ('completed', 'skipped') THEN
    RETURN NEW;
  END IF;

  -- Find all waiting steps that are now unblocked
  FOR v_ready_step IN
    SELECT step_id, assigned_to, step_name
    FROM get_newly_ready_steps(NEW.onboarding_id, NEW.id)
  LOOP
    -- Mark as pending (ready to start)
    UPDATE client_onboarding_steps
    SET status = 'pending', updated_at = NOW()
    WHERE id = v_ready_step.step_id
      AND status = 'waiting';

    -- Accumulate for notification
    v_ready_steps := v_ready_steps || jsonb_build_object(
      'step_id', v_ready_step.step_id,
      'assigned_to', v_ready_step.assigned_to,
      'step_name', v_ready_step.step_name
    );
  END LOOP;

  -- Notify application layer about newly ready steps
  IF jsonb_array_length(v_ready_steps) > 0 THEN
    v_payload := jsonb_build_object(
      'onboarding_id', NEW.onboarding_id,
      'completed_step_id', NEW.id,
      'ready_steps', v_ready_steps,
      'org_id', NEW.org_id
    );

    -- pg_notify payload limit is 8000 bytes; truncate if needed
    IF length(v_payload::TEXT) <= 8000 THEN
      PERFORM pg_notify('onboarding_step_ready', v_payload::TEXT);
    ELSE
      -- Fallback: send just the onboarding_id so app can query for details
      PERFORM pg_notify('onboarding_step_ready', jsonb_build_object(
        'onboarding_id', NEW.onboarding_id,
        'truncated', TRUE
      )::TEXT);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION cascade_step_completion()
  IS 'SECURITY DEFINER: When a step completes, marks dependent waiting steps as pending (ready) and notifies the app layer.';

-- Drop old trigger name and create with 'a_' prefix for ordering
DROP TRIGGER IF EXISTS cascade_step_completion_trigger ON client_onboarding_steps;
DROP TRIGGER IF EXISTS a_cascade_step_completion ON client_onboarding_steps;
CREATE TRIGGER a_cascade_step_completion
  AFTER UPDATE OF status ON client_onboarding_steps
  FOR EACH ROW
  WHEN (NEW.status IN ('completed', 'skipped') AND OLD.status NOT IN ('completed', 'skipped'))
  EXECUTE FUNCTION cascade_step_completion();

-- 7c. Rename existing progress trigger with 'b_' prefix for ordering
-- The existing trigger fires on ANY status change; we keep that behavior.
DROP TRIGGER IF EXISTS onboarding_step_progress_trigger ON client_onboarding_steps;
CREATE TRIGGER b_onboarding_step_progress_trigger
  AFTER UPDATE OF status ON client_onboarding_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_onboarding_progress();

-- ============================================================
-- SECTION 8: UPDATE EXISTING PROGRESS FUNCTION
-- ============================================================
-- Modify to recognize 'waiting' as a non-completed status.
-- The existing function already handles this correctly because it only
-- counts 'completed' and 'skipped' as done. No change needed to the
-- function body, but we re-create it to add the 'waiting' documentation.

CREATE OR REPLACE FUNCTION calculate_onboarding_progress(p_onboarding_id UUID)
RETURNS INT AS $$
DECLARE
  v_total INT;
  v_completed INT;
BEGIN
  -- Denominator: only count required steps (is_required = true or NULL for backward compat)
  -- Numerator: all completed/skipped steps (including optional ones that were completed)
  SELECT
    COUNT(*) FILTER (WHERE is_required IS DISTINCT FROM false),
    COUNT(*) FILTER (WHERE status IN ('completed', 'skipped'))
  INTO v_total, v_completed
  FROM client_onboarding_steps
  WHERE onboarding_id = p_onboarding_id;

  IF v_total = 0 THEN
    RETURN 0;
  END IF;

  -- Cap at 100 since optional completed steps could push over
  RETURN LEAST(ROUND((v_completed::DECIMAL / v_total) * 100), 100);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_onboarding_progress(UUID)
  IS 'Calculates onboarding progress. Denominator = required steps only (is_required != false). Numerator = all completed/skipped steps (including optional). Capped at 100%.';

-- ============================================================
-- SECTION 9: HELPER — Initialize step statuses on onboarding creation
-- ============================================================
-- When steps are created for a new onboarding, this function sets
-- the correct initial status: 'pending' for steps with no deps,
-- 'waiting' for steps with unmet deps.

CREATE OR REPLACE FUNCTION initialize_onboarding_step_statuses(p_onboarding_id UUID)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INT := 0;
  v_step RECORD;
BEGIN
  FOR v_step IN
    SELECT id, depends_on_step_ids
    FROM client_onboarding_steps
    WHERE onboarding_id = p_onboarding_id
  LOOP
    IF v_step.depends_on_step_ids IS NOT NULL
       AND array_length(v_step.depends_on_step_ids, 1) > 0
       AND NOT check_step_dependencies_met(v_step.id)
    THEN
      UPDATE client_onboarding_steps
      SET status = 'waiting', updated_at = NOW()
      WHERE id = v_step.id AND status = 'pending';
      v_updated := v_updated + 1;
    END IF;
    -- Steps with no deps or met deps stay as 'pending' (ready)
  END LOOP;

  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION initialize_onboarding_step_statuses(UUID)
  IS 'Sets correct initial statuses for onboarding steps: waiting (deps unmet) or pending (ready). Call after creating steps.';

-- ============================================================
-- SECTION 10: BACKFILL EXISTING DATA
-- ============================================================

-- 10a. Backfill org_id on client_onboarding_steps from parent
UPDATE client_onboarding_steps cos
SET org_id = co.org_id
FROM client_onboardings co
WHERE cos.onboarding_id = co.id
  AND cos.org_id IS NULL
  AND co.org_id IS NOT NULL;

-- 10b. Backfill depends_on_step_ids from template dependencies
-- For each step, find the sibling step that was created from the
-- template step referenced by the template's depends_on/depends_on_steps.
DO $$
DECLARE
  v_step RECORD;
  v_dep_step_ids UUID[];
  v_dep_template_ids UUID[];
BEGIN
  FOR v_step IN
    SELECT cos.id AS step_id,
           cos.onboarding_id,
           cos.template_step_id,
           ts.depends_on AS template_depends_on,
           ts.depends_on_steps AS template_depends_on_steps
    FROM client_onboarding_steps cos
      JOIN onboarding_template_steps ts ON ts.id = cos.template_step_id
    WHERE (cos.depends_on_step_ids IS NULL OR cos.depends_on_step_ids = '{}')
      AND cos.template_step_id IS NOT NULL
  LOOP
    -- Gather all template dependency IDs
    v_dep_template_ids := COALESCE(v_step.template_depends_on_steps, '{}');

    -- Also include scalar depends_on if not already in array
    IF v_step.template_depends_on IS NOT NULL
       AND NOT (v_step.template_depends_on = ANY(v_dep_template_ids))
    THEN
      v_dep_template_ids := v_dep_template_ids || v_step.template_depends_on;
    END IF;

    -- Skip if no template deps
    IF array_length(v_dep_template_ids, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- Resolve template step IDs → client step IDs (same onboarding)
    SELECT ARRAY_AGG(cos2.id) INTO v_dep_step_ids
    FROM client_onboarding_steps cos2
    WHERE cos2.onboarding_id = v_step.onboarding_id
      AND cos2.template_step_id = ANY(v_dep_template_ids);

    -- Update if we found matching sibling steps
    IF v_dep_step_ids IS NOT NULL AND array_length(v_dep_step_ids, 1) > 0 THEN
      UPDATE client_onboarding_steps
      SET depends_on_step_ids = v_dep_step_ids
      WHERE id = v_step.step_id;
    END IF;
  END LOOP;
END $$;

-- 10c. Backfill phase from template steps
UPDATE client_onboarding_steps cos
SET phase = ots.phase
FROM onboarding_template_steps ots
WHERE cos.template_step_id = ots.id
  AND cos.phase IS NULL
  AND ots.phase IS NOT NULL;

-- 10d. Backfill is_required from template steps
UPDATE client_onboarding_steps cos
SET is_required = ots.is_required
FROM onboarding_template_steps ots
WHERE cos.template_step_id = ots.id
  AND ots.is_required IS NOT NULL;

-- 10e. Set 'waiting' status for steps with unmet dependencies
-- Only update steps that are currently 'pending' and have deps not yet met.
UPDATE client_onboarding_steps cos
SET status = 'waiting', updated_at = NOW()
WHERE cos.status = 'pending'
  AND cos.depends_on_step_ids IS NOT NULL
  AND array_length(cos.depends_on_step_ids, 1) > 0
  AND NOT check_step_dependencies_met(cos.id);

-- ============================================================
-- SECTION 11: COMMENTS
-- ============================================================

COMMENT ON TRIGGER sync_task_to_step_trigger ON tasks
  IS 'Syncs board task completion back to the linked onboarding step.';

COMMENT ON TRIGGER a_cascade_step_completion ON client_onboarding_steps
  IS 'Cascades step completion to dependent waiting steps. Fires before progress recalculation (alphabetical order).';

COMMENT ON TRIGGER b_onboarding_step_progress_trigger ON client_onboarding_steps
  IS 'Recalculates onboarding progress percentage after step status changes.';


-- ============================================================
-- ROLLBACK SCRIPT (save separately or use as DOWN migration)
-- ============================================================
-- To rollback, execute the following in order:
--
-- -- 1. Drop new triggers
-- DROP TRIGGER IF EXISTS sync_task_to_step_trigger ON tasks;
-- DROP TRIGGER IF EXISTS a_cascade_step_completion ON client_onboarding_steps;
-- DROP TRIGGER IF EXISTS b_onboarding_step_progress_trigger ON client_onboarding_steps;
--
-- -- 2. Restore original progress trigger name
-- CREATE TRIGGER onboarding_step_progress_trigger
--   AFTER UPDATE OF status ON client_onboarding_steps
--   FOR EACH ROW
--   EXECUTE FUNCTION update_onboarding_progress();
--
-- -- 3. Drop new functions
-- DROP FUNCTION IF EXISTS sync_task_completion_to_step();
-- DROP FUNCTION IF EXISTS cascade_step_completion();
-- DROP FUNCTION IF EXISTS check_step_dependencies_met(UUID);
-- DROP FUNCTION IF EXISTS get_newly_ready_steps(UUID, UUID);
-- DROP FUNCTION IF EXISTS initialize_onboarding_step_statuses(UUID);
--
-- -- 4. Revert steps from 'waiting' back to 'pending'
-- UPDATE client_onboarding_steps SET status = 'pending' WHERE status = 'waiting';
--
-- -- 5. Drop new columns from client_onboarding_steps
-- ALTER TABLE client_onboarding_steps DROP COLUMN IF EXISTS depends_on_step_ids;
-- ALTER TABLE client_onboarding_steps DROP COLUMN IF EXISTS task_id;
-- ALTER TABLE client_onboarding_steps DROP COLUMN IF EXISTS org_id;
-- ALTER TABLE client_onboarding_steps DROP COLUMN IF EXISTS phase;
-- ALTER TABLE client_onboarding_steps DROP COLUMN IF EXISTS is_required;
--
-- -- 6. Drop new columns from onboarding_template_steps
-- ALTER TABLE onboarding_template_steps DROP COLUMN IF EXISTS depends_on_steps;
-- ALTER TABLE onboarding_template_steps DROP COLUMN IF EXISTS phase;
--
-- -- 7. Restore old CHECK constraint on tasks.source_type
-- ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_type_check;
-- ALTER TABLE tasks ADD CONSTRAINT tasks_source_type_check
--   CHECK (source_type IN ('manual','auto_onboarding','auto_meeting','auto_campaign','auto_feedback','auto_report','auto_contract'));
--
-- -- 8. Drop new indexes
-- DROP INDEX IF EXISTS idx_cos_task_id;
-- DROP INDEX IF EXISTS idx_cos_org_id;
-- DROP INDEX IF EXISTS idx_cos_depends_on_step_ids;
-- DROP INDEX IF EXISTS idx_tasks_source_onboarding_step;
-- DROP INDEX IF EXISTS idx_cos_waiting_steps;
-- DROP INDEX IF EXISTS idx_cos_onboarding_status_phase;
--
-- -- NOTE: enum values 'waiting' and 'review' CANNOT be removed from
-- -- onboarding_step_status. They will persist harmlessly.
