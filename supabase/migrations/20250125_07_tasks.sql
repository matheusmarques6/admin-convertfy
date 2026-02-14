-- =============================================
-- FASE 4: SISTEMA DE TAREFAS UNIFICADO
-- =============================================
-- Unifica: Onboarding, Campanhas, Solicitações, Calendário
-- Cada tarefa pode estar vinculada a um contexto específico

-- Enum de tipos de tarefa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
    CREATE TYPE task_type AS ENUM (
      'onboarding',     -- Tarefas de onboarding
      'campaign',       -- Tarefas de campanha
      'request',        -- Solicitações/Pedidos
      'general',        -- Tarefas gerais
      'meeting',        -- Reuniões
      'deadline'        -- Prazos/Entregas
    );
  END IF;
END$$;

-- Enum de status de tarefa
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
    CREATE TYPE task_status AS ENUM (
      'pending',        -- Aguardando
      'in_progress',    -- Em andamento
      'blocked',        -- Bloqueada
      'review',         -- Em revisão
      'completed',      -- Concluída
      'cancelled'       -- Cancelada
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

  -- Identificação
  title TEXT NOT NULL,
  description TEXT,

  -- Tipo e status
  type task_type NOT NULL DEFAULT 'general',
  status task_status NOT NULL DEFAULT 'pending',
  priority task_priority NOT NULL DEFAULT 'medium',

  -- Responsáveis
  assignee_id UUID REFERENCES org_members(id) ON DELETE SET NULL,  -- Quem vai executar
  created_by UUID REFERENCES profiles(id) NOT NULL,                 -- Quem criou

  -- Contexto (apenas um preenchido por vez)
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE,
  campaign_batch_id UUID REFERENCES campaign_batches(id) ON DELETE CASCADE,

  -- Datas
  due_date TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Ordenação no board (Kanban)
  position INT DEFAULT 0,

  -- Metadados extras (para dados específicos de cada tipo)
  metadata JSONB DEFAULT '{}',

  -- Tags para organização
  tags TEXT[] DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_client ON tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_tasks_store ON tasks(store_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_position ON tasks(status, position);

-- Índice composto para board view
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(assignee_id, status, position);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_tasks_updated_at ON tasks;
CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- COMENTÁRIOS DE TAREFAS
-- =============================================
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  content TEXT NOT NULL,

  -- Para menções (@usuario)
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
-- HISTÓRICO DE MUDANÇAS
-- =============================================
CREATE TABLE IF NOT EXISTS task_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Tipo de mudança
  action TEXT NOT NULL, -- 'created', 'updated', 'status_changed', 'assigned', 'commented'

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

-- Tasks: Ver se é admin, owner, ou tem acesso ao cliente/loja
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

CREATE POLICY "Delete tasks"
  ON tasks FOR DELETE TO authenticated
  USING (
    is_admin()
    OR is_org_owner()
    OR created_by = auth.uid()
  );

-- Task comments
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

CREATE POLICY "Insert task history"
  ON task_history FOR INSERT TO authenticated
  WITH CHECK (true); -- Sistema pode sempre inserir

-- Task checklists
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
CREATE POLICY "Service role full access tasks"
  ON tasks FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access task_comments"
  ON task_comments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access task_history"
  ON task_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access task_checklists"
  ON task_checklists FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================
-- FUNÇÃO PARA REGISTRAR HISTÓRICO
-- =============================================
CREATE OR REPLACE FUNCTION record_task_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_history (task_id, actor_id, action, new_value)
    VALUES (NEW.id, NEW.created_by, 'created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Registrar mudança de status
    IF OLD.status != NEW.status THEN
      INSERT INTO task_history (task_id, actor_id, action, old_value, new_value)
      VALUES (NEW.id, auth.uid(), 'status_changed',
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    END IF;

    -- Registrar mudança de responsável
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
-- COMENTÁRIOS
-- =============================================
COMMENT ON TABLE tasks IS 'Sistema unificado de tarefas: onboarding, campanhas, solicitações, etc.';
COMMENT ON COLUMN tasks.type IS 'Tipo da tarefa para categorização';
COMMENT ON COLUMN tasks.metadata IS 'Dados extras específicos do tipo de tarefa';
COMMENT ON COLUMN tasks.position IS 'Posição para ordenação no board Kanban';
COMMENT ON TABLE task_comments IS 'Comentários e discussão em tarefas';
COMMENT ON TABLE task_history IS 'Histórico de alterações automático';
COMMENT ON TABLE task_checklists IS 'Checklists/subtarefas dentro de uma tarefa';
