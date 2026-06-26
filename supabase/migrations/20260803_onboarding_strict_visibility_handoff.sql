-- Strict onboarding stage visibility, canonical roles and realtime.
-- Additive migration: existing tasks, metadata, deliverables and history remain.

CREATE OR REPLACE FUNCTION canonical_onboarding_role(p_role TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(p_role, ''))
    WHEN 'admin' THEN 'admin'
    WHEN 'owner' THEN 'admin'
    WHEN 'dev' THEN 'dev'
    WHEN 'coo' THEN 'coo'
    WHEN 'suporte' THEN 'suporte'
    WHEN 'support' THEN 'suporte'
    WHEN 'cs' THEN 'suporte'
    WHEN 'estrategista' THEN 'suporte'
    WHEN 'designer' THEN 'designer'
    WHEN 'implementacao' THEN 'implementacao'
    WHEN 'ops' THEN 'implementacao'
    WHEN 'developer' THEN 'implementacao'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION onboarding_stage_role(p_slug TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_slug
    WHEN 'entrada' THEN 'suporte'
    WHEN 'cliente_formulario' THEN 'suporte'
    WHEN 'preview_aprovacao' THEN 'suporte'
    WHEN 'preview_producao' THEN 'designer'
    WHEN 'emails_finais' THEN 'designer'
    WHEN 'cliente_ativo' THEN 'designer'
    WHEN 'implementacao' THEN 'implementacao'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION current_user_has_onboarding_role(p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM org_members om
    LEFT JOIN org_member_roles omr ON omr.org_member_id = om.id
    WHERE om.profile_id = auth.uid()
      AND om.is_active = TRUE
      AND (
        canonical_onboarding_role(omr.role::TEXT) = p_role
        OR (
          omr.id IS NULL
          AND canonical_onboarding_role(om.role::TEXT) = p_role
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION current_user_onboarding_bypass()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    current_user_has_onboarding_role('admin')
    OR current_user_has_onboarding_role('dev')
    OR current_user_has_onboarding_role('coo')
$$;

CREATE OR REPLACE FUNCTION can_access_onboarding_stage(p_onboarding_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM onboardings o
    JOIN operational_pipeline_columns c ON c.id = o.current_column_id
    JOIN org_members om
      ON om.org_id = o.org_id
     AND om.profile_id = auth.uid()
     AND om.is_active = TRUE
    WHERE o.id = p_onboarding_id
      AND o.status = 'in_progress'
      AND (
        current_user_onboarding_bypass()
        OR current_user_has_onboarding_role(onboarding_stage_role(c.slug))
      )
  )
$$;

CREATE OR REPLACE FUNCTION can_access_onboarding_task(p_task_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tasks t
    JOIN onboardings o ON o.id = t.onboarding_id
    WHERE t.id = p_task_id
      AND t.operational_column_id = o.current_column_id
      AND coalesce(t.version, 1) = coalesce(o.current_version, 1)
      AND can_access_onboarding_stage(o.id)
  )
$$;

-- Preserve legacy role rows and add their canonical equivalents.
INSERT INTO org_member_roles (org_member_id, role, granted_by, granted_at)
SELECT
  omr.org_member_id,
  canonical_onboarding_role(omr.role::TEXT)::org_role,
  omr.granted_by,
  omr.granted_at
FROM org_member_roles omr
WHERE canonical_onboarding_role(omr.role::TEXT) IS NOT NULL
  AND canonical_onboarding_role(omr.role::TEXT) <> omr.role::TEXT
ON CONFLICT (org_member_id, role) DO NOTHING;

CREATE OR REPLACE FUNCTION normalize_onboarding_column_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := onboarding_stage_role(NEW.slug);
  IF v_role IS NOT NULL THEN
    NEW.default_assignee_role := v_role::org_role;
  ELSIF canonical_onboarding_role(NEW.default_assignee_role::TEXT) IS NOT NULL THEN
    NEW.default_assignee_role :=
      canonical_onboarding_role(NEW.default_assignee_role::TEXT)::org_role;
  END IF;

  NEW.checklist_template := replace(
    replace(
      replace(NEW.checklist_template::TEXT, '"cs"', '"suporte"'),
      '"estrategista"', '"suporte"'
    ),
    '"ops"', '"implementacao"'
  )::jsonb;
  NEW.automation_rules := replace(
    replace(
      replace(NEW.automation_rules::TEXT, '"cs"', '"suporte"'),
      '"estrategista"', '"suporte"'
    ),
    '"ops"', '"implementacao"'
  )::jsonb;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_onboarding_column_roles
  ON operational_pipeline_columns;
CREATE TRIGGER trg_normalize_onboarding_column_roles
BEFORE INSERT OR UPDATE OF slug, default_assignee_role, checklist_template, automation_rules
ON operational_pipeline_columns
FOR EACH ROW
EXECUTE FUNCTION normalize_onboarding_column_roles();

UPDATE operational_pipeline_columns
SET
  default_assignee_role = onboarding_stage_role(slug)::org_role,
  checklist_template = replace(
    replace(
      replace(checklist_template::TEXT, '"cs"', '"suporte"'),
      '"estrategista"', '"suporte"'
    ),
    '"ops"', '"implementacao"'
  )::jsonb,
  automation_rules = replace(
    replace(
      replace(automation_rules::TEXT, '"cs"', '"suporte"'),
      '"estrategista"', '"suporte"'
    ),
    '"ops"', '"implementacao"'
  )::jsonb
WHERE onboarding_stage_role(slug) IS NOT NULL;

UPDATE tasks t
SET assignee_role = onboarding_stage_role(c.slug)::org_role
FROM operational_pipeline_columns c
WHERE t.operational_column_id = c.id
  AND t.onboarding_id IS NOT NULL
  AND onboarding_stage_role(c.slug) IS NOT NULL
  AND t.assignee_role IS DISTINCT FROM onboarding_stage_role(c.slug)::org_role;

UPDATE tasks
SET assignee_role =
  canonical_onboarding_role(assignee_role::TEXT)::org_role
WHERE onboarding_id IS NOT NULL
  AND canonical_onboarding_role(assignee_role::TEXT) IS NOT NULL
  AND assignee_role::TEXT IS DISTINCT FROM
    canonical_onboarding_role(assignee_role::TEXT);

UPDATE notifications
SET metadata = replace(
  replace(
    replace(metadata::TEXT, '"cs"', '"suporte"'),
    '"estrategista"', '"suporte"'
  ),
  '"ops"', '"implementacao"'
)::jsonb
WHERE metadata::TEXT ~ '"(cs|estrategista|ops)"';

-- Strict stage visibility. assignee_id is intentionally not consulted.
DROP POLICY IF EXISTS "onboardings_select" ON onboardings;
CREATE POLICY "onboardings_select"
ON onboardings FOR SELECT TO authenticated
USING (can_access_onboarding_stage(id));

DROP POLICY IF EXISTS "onboardings_manage" ON onboardings;
CREATE POLICY "onboardings_manage"
ON onboardings FOR ALL TO authenticated
USING (current_user_onboarding_bypass())
WITH CHECK (current_user_onboarding_bypass());

DROP POLICY IF EXISTS "View tasks" ON tasks;
CREATE POLICY "View tasks"
ON tasks FOR SELECT TO authenticated
USING (
  (
    onboarding_id IS NOT NULL
    AND can_access_onboarding_task(id)
  )
  OR (
    onboarding_id IS NULL
    AND org_id IN (
      SELECT org_id
      FROM org_members
      WHERE profile_id = auth.uid() AND is_active = TRUE
    )
    AND (
      current_user_onboarding_bypass()
      OR assignee_role IS NULL
      OR current_user_has_onboarding_role(
        canonical_onboarding_role(assignee_role::TEXT)
      )
    )
  )
);

DROP POLICY IF EXISTS "Create tasks" ON tasks;
CREATE POLICY "Create tasks"
ON tasks FOR INSERT TO authenticated
WITH CHECK (current_user_onboarding_bypass());

DROP POLICY IF EXISTS "Update tasks" ON tasks;
CREATE POLICY "Update tasks"
ON tasks FOR UPDATE TO authenticated
USING (
  current_user_onboarding_bypass()
  OR (onboarding_id IS NOT NULL AND can_access_onboarding_task(id))
)
WITH CHECK (
  current_user_onboarding_bypass()
  OR (onboarding_id IS NOT NULL AND can_access_onboarding_task(id))
);

DROP POLICY IF EXISTS "Delete tasks" ON tasks;
CREATE POLICY "Delete tasks"
ON tasks FOR DELETE TO authenticated
USING (current_user_onboarding_bypass());

CREATE OR REPLACE FUNCTION guard_onboarding_task_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_user_onboarding_bypass() THEN
    RETURN NEW;
  END IF;
  IF OLD.onboarding_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF
    NEW.title IS DISTINCT FROM OLD.title
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id
    OR NEW.assignee_role IS DISTINCT FROM OLD.assignee_role
    OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.onboarding_id IS DISTINCT FROM OLD.onboarding_id
    OR NEW.operational_column_id IS DISTINCT FROM OLD.operational_column_id
    OR NEW.version IS DISTINCT FROM OLD.version
    OR NEW.metadata IS DISTINCT FROM OLD.metadata
  THEN
    RAISE EXCEPTION 'Only onboarding bypass roles can administer tasks'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_onboarding_task_privileged_fields ON tasks;
CREATE TRIGGER trg_guard_onboarding_task_privileged_fields
BEFORE UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION guard_onboarding_task_privileged_fields();

DROP POLICY IF EXISTS "deliverables_all" ON task_deliverables;
CREATE POLICY "deliverables_select"
ON task_deliverables FOR SELECT TO authenticated
USING (can_access_onboarding_task(task_id));
CREATE POLICY "deliverables_update"
ON task_deliverables FOR UPDATE TO authenticated
USING (can_access_onboarding_task(task_id))
WITH CHECK (can_access_onboarding_task(task_id));
CREATE POLICY "deliverables_insert"
ON task_deliverables FOR INSERT TO authenticated
WITH CHECK (current_user_onboarding_bypass());
CREATE POLICY "deliverables_delete"
ON task_deliverables FOR DELETE TO authenticated
USING (current_user_onboarding_bypass());

DROP POLICY IF EXISTS "View task comments" ON task_comments;
CREATE POLICY "View task comments"
ON task_comments FOR SELECT TO authenticated
USING (can_access_onboarding_task(task_id));

DROP POLICY IF EXISTS "Manage task comments" ON task_comments;
CREATE POLICY "Manage task comments"
ON task_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND can_access_onboarding_task(task_id)
);

DROP POLICY IF EXISTS "View task history" ON task_history;
CREATE POLICY "View task history"
ON task_history FOR SELECT TO authenticated
USING (can_access_onboarding_task(task_id));

DROP POLICY IF EXISTS "View task checklists" ON task_checklists;
CREATE POLICY "View task checklists"
ON task_checklists FOR SELECT TO authenticated
USING (can_access_onboarding_task(task_id));

DROP POLICY IF EXISTS "Manage task checklists" ON task_checklists;
CREATE POLICY "Manage task checklists"
ON task_checklists FOR UPDATE TO authenticated
USING (can_access_onboarding_task(task_id))
WITH CHECK (can_access_onboarding_task(task_id));

-- Realtime additions are guarded because ADD TABLE is not idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'onboardings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE onboardings;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_deliverables'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE task_deliverables;
  END IF;
END
$$;
