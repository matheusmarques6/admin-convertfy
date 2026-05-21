-- Migration: converte onboardings LEGADOS (modelo "1 task por coluna +
-- N checklists internos") pro novo modelo "1 task por checklist item".
--
-- Para cada task antiga de onboarding que ainda tem task_checklists:
--   1. A task original e renomeada pro PRIMEIRO item do checklist
--      (vira a "anchor da coluna", mantem deliverables + comments + history)
--   2. Para cada checklist item adicional, INSERT 1 nova task irma na
--      mesma coluna/versao (mesmo assignee_role, due_date, sla_hours, etc)
--   3. Status migrado: is_completed=true → status='completed'
--   4. task_checklists migrados sao DELETADOS (UI nova nao usa mais)
--
-- Idempotente: tasks sem checklists nao sao tocadas. Rodar 2x nao duplica.
-- Preserva: task_comments, task_history, source_metadata, deliverables
-- (todos continuam ligados a task anchor).

DO $$
DECLARE
  legacy RECORD;
  ck RECORD;
  is_first BOOLEAN;
BEGIN
  FOR legacy IN (
    SELECT
      t.id, t.onboarding_id, t.operational_column_id, t.version, t.org_id,
      t.assignee_role, t.due_date, t.sla_hours, t.created_by,
      t.metadata, t.source_metadata, t.priority, t.description
    FROM tasks t
    WHERE t.source_type = 'onboarding'
      AND t.onboarding_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM task_checklists tc WHERE tc.task_id = t.id)
  ) LOOP
    is_first := TRUE;

    FOR ck IN (
      SELECT id, title, position, is_completed, completed_at, completed_by
      FROM task_checklists
      WHERE task_id = legacy.id
      ORDER BY position ASC, id ASC
    ) LOOP
      IF is_first THEN
        -- Atualiza a task ORIGINAL pra ser o primeiro item (anchor).
        -- Mantem o id estavel → preserva comments/history/deliverables.
        UPDATE tasks
        SET
          title = ck.title,
          status = CASE
            WHEN ck.is_completed THEN 'completed'
            ELSE tasks.status
          END,
          completed_at = COALESCE(tasks.completed_at, ck.completed_at),
          metadata = COALESCE(tasks.metadata, '{}'::jsonb) || jsonb_build_object(
            'is_column_anchor', true,
            'migrated_from_checklist', true,
            'item_position', ck.position
          )
        WHERE id = legacy.id;
        is_first := FALSE;
      ELSE
        -- Cria nova task irma pros demais itens. Herda contexto da legada.
        INSERT INTO tasks (
          org_id, title, description, status, priority, type,
          source_type, source_id, source_metadata,
          onboarding_id, operational_column_id,
          assignee_role, version, due_date, sla_hours,
          created_by, completed_at, metadata
        ) VALUES (
          legacy.org_id,
          ck.title,
          legacy.description,
          CASE WHEN ck.is_completed THEN 'completed' ELSE 'pending' END,
          legacy.priority,
          'onboarding',
          'onboarding',
          legacy.onboarding_id,
          legacy.source_metadata,
          legacy.onboarding_id,
          legacy.operational_column_id,
          legacy.assignee_role,
          legacy.version,
          legacy.due_date,
          legacy.sla_hours,
          legacy.created_by,
          ck.completed_at,
          COALESCE(legacy.metadata, '{}'::jsonb) || jsonb_build_object(
            'is_column_anchor', false,
            'migrated_from_checklist', true,
            'item_position', ck.position
          )
        );
      END IF;
    END LOOP;

    -- Remove checklists migrados (UI nova nao usa mais; evita "0/N
    -- checklists" fantasma na task anchor).
    DELETE FROM task_checklists WHERE task_id = legacy.id;
  END LOOP;

  RAISE NOTICE 'Migracao de onboardings legados concluida.';
END $$;
