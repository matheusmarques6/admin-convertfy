-- Fix: log_task_deliverable_change function referenced NEW.status and
-- NEW.label, columns that don't exist in task_deliverables. The intended
-- behavior is to log when a deliverable goes from empty to filled (or
-- back to empty). Rewrites the function to use real columns: value,
-- file_url, field_label.
--
-- Bug introduced by: 20260519_task_panel_enrichments.sql:174-193
-- Error observed: "record \"new\" has no field \"status\"" (code 42703)
-- on every PATCH /api/tasks/[id]/deliverables/[id].

CREATE OR REPLACE FUNCTION log_task_deliverable_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_filled BOOLEAN := COALESCE(OLD.value IS NOT NULL OR OLD.file_url IS NOT NULL, FALSE);
  new_filled BOOLEAN := COALESCE(NEW.value IS NOT NULL OR NEW.file_url IS NOT NULL, FALSE);
BEGIN
  IF old_filled IS DISTINCT FROM new_filled THEN
    INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
    VALUES (
      NEW.task_id,
      auth.uid(),
      CASE WHEN new_filled THEN 'deliverable_filled' ELSE 'deliverable_cleared' END,
      jsonb_build_object(
        'deliverable_id', NEW.id,
        'field_label', NEW.field_label,
        'was_filled', old_filled
      ),
      jsonb_build_object(
        'deliverable_id', NEW.id,
        'field_label', NEW.field_label,
        'is_filled', new_filled,
        'file_url', NEW.file_url,
        'file_name', NEW.file_name,
        'value', NEW.value
      )
    );
  END IF;
  RETURN NEW;
END;
$$;
