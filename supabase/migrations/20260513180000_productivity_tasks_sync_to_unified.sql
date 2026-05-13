-- Unificacao: productivity_tasks (projetos pessoais) virou source_type='project'
-- na tabela tasks. Em vez de drop, mantemos productivity_tasks (que o
-- board ja usa) e adicionamos trigger que SINCRONIZA cada change pra tasks.
-- Resultado: /admin/me, /admin/productivity widget e /admin/onboarding/[id]
-- VEEM as tarefas do board automaticamente. Board continua funcionando 100%.

-- Mapping helpers (status + priority)
CREATE OR REPLACE FUNCTION map_prod_status_to_task(s text) RETURNS task_status
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s
    WHEN 'done' THEN 'completed'::task_status
    WHEN 'pending' THEN 'pending'::task_status
    WHEN 'progress' THEN 'in_progress'::task_status
    WHEN 'review' THEN 'in_progress'::task_status
    ELSE 'pending'::task_status
  END;
$$;

CREATE OR REPLACE FUNCTION map_prod_priority_to_task(p int) RETURNS task_priority
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p
    WHEN 1 THEN 'urgent'::task_priority
    WHEN 2 THEN 'high'::task_priority
    WHEN 3 THEN 'medium'::task_priority
    WHEN 4 THEN 'low'::task_priority
    ELSE 'medium'::task_priority
  END;
$$;

-- Trigger sync (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION sync_productivity_task_to_tasks() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_due timestamptz;
  v_owner uuid;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.name = '__group_placeholder__' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM tasks WHERE source_type = 'project' AND source_id = OLD.id;
    RETURN OLD;
  END IF;

  v_due := CASE
    WHEN NEW.due_date IS NOT NULL THEN NEW.due_date::timestamptz + COALESCE(
      (NEW.scheduled_time)::interval, INTERVAL '23 hours'
    )
    ELSE NULL
  END;

  BEGIN
    v_owner := (NEW.assigned_to[1])::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_owner := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO tasks (
      org_id, title, description, status, priority, type,
      source_type, source_id, source_metadata,
      assignee_id, due_date, sla_hours,
      created_by, metadata
    ) VALUES (
      NEW.org_id,
      NEW.name,
      NEW.description,
      map_prod_status_to_task(NEW.status::text),
      map_prod_priority_to_task(NEW.priority),
      'general',
      'project',
      NEW.id,
      jsonb_build_object(
        'store_name', NEW.project,
        'client_name', NULL,
        'stage_name', NEW.group_name,
        'stage_color', NEW.group_color,
        'stage_slug', NEW.group_id,
        'group_id', NEW.group_id
      ),
      v_owner,
      v_due,
      NEW.estimated_minutes / 60,
      NEW.created_by,
      jsonb_build_object('synced_from', 'productivity_tasks')
    )
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE tasks SET
      title = NEW.name,
      description = NEW.description,
      status = map_prod_status_to_task(NEW.status::text),
      priority = map_prod_priority_to_task(NEW.priority),
      due_date = v_due,
      sla_hours = NEW.estimated_minutes / 60,
      source_metadata = jsonb_build_object(
        'store_name', NEW.project,
        'client_name', NULL,
        'stage_name', NEW.group_name,
        'stage_color', NEW.group_color,
        'stage_slug', NEW.group_id,
        'group_id', NEW.group_id
      ),
      assignee_id = v_owner,
      updated_at = NOW(),
      completed_at = CASE WHEN NEW.status = 'done' THEN NOW() ELSE NULL END
    WHERE source_type = 'project' AND source_id = NEW.id;

    IF NOT FOUND THEN
      INSERT INTO tasks (
        org_id, title, description, status, priority, type,
        source_type, source_id, source_metadata,
        assignee_id, due_date, sla_hours,
        created_by, metadata
      ) VALUES (
        NEW.org_id, NEW.name, NEW.description,
        map_prod_status_to_task(NEW.status::text),
        map_prod_priority_to_task(NEW.priority),
        'general', 'project', NEW.id,
        jsonb_build_object(
          'store_name', NEW.project,
          'stage_name', NEW.group_name,
          'stage_color', NEW.group_color,
          'stage_slug', NEW.group_id,
          'group_id', NEW.group_id
        ),
        v_owner, v_due, NEW.estimated_minutes / 60, NEW.created_by,
        jsonb_build_object('synced_from', 'productivity_tasks')
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_productivity_task ON public.productivity_tasks;
CREATE TRIGGER trg_sync_productivity_task
AFTER INSERT OR UPDATE OR DELETE ON public.productivity_tasks
FOR EACH ROW EXECUTE FUNCTION sync_productivity_task_to_tasks();

-- Backfill: replica todas as productivity_tasks existentes (nao-placeholders) pra tasks
INSERT INTO tasks (
  org_id, title, description, status, priority, type,
  source_type, source_id, source_metadata,
  due_date, sla_hours, created_by, metadata
)
SELECT
  pt.org_id,
  pt.name,
  pt.description,
  map_prod_status_to_task(pt.status::text),
  map_prod_priority_to_task(pt.priority),
  'general',
  'project',
  pt.id,
  jsonb_build_object(
    'store_name', pt.project,
    'stage_name', pt.group_name,
    'stage_color', pt.group_color,
    'stage_slug', pt.group_id,
    'group_id', pt.group_id
  ),
  CASE WHEN pt.due_date IS NOT NULL THEN pt.due_date::timestamptz + INTERVAL '23 hours' ELSE NULL END,
  pt.estimated_minutes / 60,
  pt.created_by,
  jsonb_build_object('synced_from', 'productivity_tasks')
FROM public.productivity_tasks pt
WHERE pt.name != '__group_placeholder__'
  AND NOT EXISTS (
    SELECT 1 FROM tasks t WHERE t.source_type = 'project' AND t.source_id = pt.id
  );

COMMENT ON TRIGGER trg_sync_productivity_task ON public.productivity_tasks IS
  'Unifica tasks de projeto pessoal com tasks de onboarding/CRM. Toda mudanca em productivity_tasks reflete em tasks com source_type=project.';
