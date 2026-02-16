-- =============================================
-- PIPELINE FILE 01: SISTEMA DE TAREFAS UNIFICADO
-- =============================================
-- Creates: task_type, task_status, task_priority enums
-- Creates: tasks, task_comments, task_history, task_checklists tables
-- Creates: All indexes, triggers, RLS policies
-- Creates: record_task_history() function
-- =============================================

BEGIN;

-- Enum de tipos de tarefa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM (
      'onboarding',
      'campaign',
      'request',
      'general',
      'meeting',
      'deadline'
    );
  END IF;
END$$;

-- Enum de status de tarefa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM (
      'pending',
      'in_progress',
      'blocked',
      'review',
      'completed',
      'cancelled'
    );
  END IF;
END$$;

-- Enum de prioridade
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_priority') THEN
    CREATE TYPE task_priority AS ENUM (
      'low',
      'medium',
      'high',
      'urgent'
    );
  END IF;
END$$;

-- Tabela principal de tarefas
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificacao
  title TEXT NOT NULL,
  description TEXT,

  -- Tipo e status
  type task_type NOT NULL DEFAULT 'general',
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',

  -- Responsaveis
  assignee_id UUID REFERENCES org_members(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,

  -- Contexto (apenas um preenchido por vez)
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE,
  campaign_batch_id UUID REFERENCES campaign_batches(id) ON DELETE CASCADE,

  -- Datas
  due_date TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Ordenacao no board (Kanban)
  position INT DEFAULT 0,

  -- Metadados extras
  metadata JSONB DEFAULT '{}',

  -- Tags para organizacao
  tags TEXT[] DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_store ON tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(status, position);
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(assignee_id, status, position);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_tasks_updated_at ON tasks;
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- COMENTARIOS DE TAREFAS
-- =============================================
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  content TEXT NOT NULL,

  -- Para mencoes (@usuario)
  mentions UUID[] DEFAULT '{}',

  -- Anexos (URLs)
  attachments JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author ON task_comments(author_id);

DROP TRIGGER IF EXISTS set_task_comments_updated_at ON task_comments;
CREATE TRIGGER set_task_comments_updated_at
  BEFORE UPDATE ON task_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- HISTORICO DE MUDANCAS
-- =============================================
CREATE TABLE IF NOT EXISTS task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Tipo de mudanca
  action TEXT NOT NULL,

  -- Valores antigo e novo
  old_value JSONB,
  new_value JSONB,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_actor ON task_history(actor_id);
CREATE INDEX IF NOT EXISTS idx_task_history_created ON task_history(created_at DESC);

-- =============================================
-- CHECKLISTS DE TAREFAS
-- =============================================
CREATE TABLE IF NOT EXISTS task_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,

  title TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,

  position INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_checklists_task ON task_checklists(task_id);

-- =============================================
-- RLS POLICIES PARA TASKS
-- =============================================
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_checklists ENABLE ROW LEVEL SECURITY;

-- Tasks: Ver se e admin, owner, ou tem acesso ao cliente/loja
DROP POLICY IF EXISTS "View tasks" ON tasks;
CREATE POLICY "View tasks"
  ON tasks FOR SELECT TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR assignee_id = current_org_member_id()
    OR created_by = auth.uid()
    OR (client_id IS NOT NULL AND can_access_client(client_id))
    OR (store_id IS NOT NULL AND can_access_store(store_id))
  );

DROP POLICY IF EXISTS "Create tasks" ON tasks;
CREATE POLICY "Create tasks"
  ON tasks FOR INSERT TO authenticated
  WITH CHECK (
    is_admin()
    OR is_org_owner()
    OR has_feature('team_control')
    OR has_feature('request_control')
    OR has_feature('onboarding_control')
    OR has_feature('campaign_control')
  );

DROP POLICY IF EXISTS "Update tasks" ON tasks;
CREATE POLICY "Update tasks"
  ON tasks FOR UPDATE TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR assignee_id = current_org_member_id()
    OR created_by = auth.uid()
  )
  WITH CHECK (
    is_admin()
    OR is_org_owner()
    OR assignee_id = current_org_member_id()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Delete tasks" ON tasks;
CREATE POLICY "Delete tasks"
  ON tasks FOR DELETE TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR created_by = auth.uid()
  );

-- Task comments
DROP POLICY IF EXISTS "View task comments" ON task_comments;
CREATE POLICY "View task comments"
  ON task_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
      AND (
        is_admin()
        OR is_org_owner()
        OR t.assignee_id = current_org_member_id()
        OR t.created_by = auth.uid()
        OR (t.client_id IS NOT NULL AND can_access_client(t.client_id))
        OR (t.store_id IS NOT NULL AND can_access_store(t.store_id))
      )
    )
  );

DROP POLICY IF EXISTS "Manage task comments" ON task_comments;
CREATE POLICY "Manage task comments"
  ON task_comments FOR ALL TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR author_id = auth.uid()
  )
  WITH CHECK (
    is_admin()
    OR is_org_owner()
    OR author_id = auth.uid()
  );

-- Task history
DROP POLICY IF EXISTS "View task history" ON task_history;
CREATE POLICY "View task history"
  ON task_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
      AND (
        is_admin()
        OR is_org_owner()
        OR t.assignee_id = current_org_member_id()
        OR t.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Insert task history" ON task_history;
CREATE POLICY "Insert task history"
  ON task_history FOR INSERT TO authenticated
  WITH CHECK (true);

-- Task checklists
DROP POLICY IF EXISTS "View task checklists" ON task_checklists;
CREATE POLICY "View task checklists"
  ON task_checklists FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
      AND (
        is_admin()
        OR is_org_owner()
        OR t.assignee_id = current_org_member_id()
        OR t.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Manage task checklists" ON task_checklists;
CREATE POLICY "Manage task checklists"
  ON task_checklists FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
      AND (
        is_admin()
        OR is_org_owner()
        OR t.assignee_id = current_org_member_id()
        OR t.created_by = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tasks t
      WHERE t.id = task_id
      AND (
        is_admin()
        OR is_org_owner()
        OR t.assignee_id = current_org_member_id()
        OR t.created_by = auth.uid()
      )
    )
  );

-- Service role access
DROP POLICY IF EXISTS "Service role full access tasks" ON tasks;
CREATE POLICY "Service role full access tasks"
  ON tasks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access task_comments" ON task_comments;
CREATE POLICY "Service role full access task_comments"
  ON task_comments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access task_history" ON task_history;
CREATE POLICY "Service role full access task_history"
  ON task_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access task_checklists" ON task_checklists;
CREATE POLICY "Service role full access task_checklists"
  ON task_checklists FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- FUNCAO PARA REGISTRAR HISTORICO
-- =============================================
CREATE OR REPLACE FUNCTION record_task_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_history (task_id, actor_id, action, new_value)
    VALUES (NEW.id, NEW.created_by, 'created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Registrar mudanca de status
    IF OLD.status != NEW.status THEN
      INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
      VALUES (NEW.id, auth.uid(), 'status_changed',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    END IF;

    -- Registrar mudanca de responsavel
    IF OLD.assignee_id IS DISTINCT FROM NEW.assignee_id THEN
      INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
      VALUES (NEW.id, auth.uid(), 'assigned',
        jsonb_build_object('assignee_id', OLD.assignee_id),
        jsonb_build_object('assignee_id', NEW.assignee_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS task_history_trigger ON tasks;
CREATE TRIGGER task_history_trigger
  AFTER INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION record_task_history();

-- =============================================
-- COMENTARIOS
-- =============================================
COMMENT ON TABLE tasks IS 'Sistema unificado de tarefas: onboarding, campanhas, solicitacoes, etc.';
COMMENT ON COLUMN tasks.type IS 'Tipo da tarefa para categorizacao';
COMMENT ON COLUMN tasks.metadata IS 'Dados extras especificos do tipo de tarefa';
COMMENT ON COLUMN tasks.position IS 'Posicao para ordenacao no board Kanban';
COMMENT ON TABLE task_comments IS 'Comentarios e discussao em tarefas';
COMMENT ON TABLE task_history IS 'Historico de alteracoes automatico';
COMMENT ON TABLE task_checklists IS 'Checklists/subtarefas dentro de uma tarefa';

COMMIT;

-- =============================================
-- 01_tasks_system.sql DONE
-- =============================================
