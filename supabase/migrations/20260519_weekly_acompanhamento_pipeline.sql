-- =============================================
-- Pipeline de Acompanhamento Semanal
-- =============================================
-- Pipeline operacional de Customer Success com 4 etapas + 5 estados de saúde.
-- Reset semanal (domingo 22h). IA flag de lojas que precisam atenção (sex 14h).
--
-- 4 etapas:
--   1. precisa_atencao     → IA sinalizou (CALL SEXTA)
--   2. em_otimizacao       → Ações aprovadas, time executando (TIME)
--   3. pronta_feedback     → Tasks ok + mensagem IA pronta (RYAN)
--   4. feedback_enviado    → Ryan deu feedback WhatsApp
--
-- 3 modos da semana:
--   AUTO     (dom 22h → sex 14h) — IA roda
--   REUNIAO  (sex 14h-16h) — Ritual diagnóstico
--   EXECUCAO (sáb 8h → qui) — Time executa

CREATE TABLE IF NOT EXISTS weekly_pipeline_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  -- Semana de referência (segunda-feira da semana corrente)
  week_start DATE NOT NULL,

  -- Etapa no pipeline (1-4)
  current_stage INTEGER NOT NULL DEFAULT 1 CHECK (current_stage BETWEEN 1 AND 4),

  -- Estado de saúde da loja
  health_state TEXT NOT NULL DEFAULT 'healthy' CHECK (health_state IN (
    'rampup', 'healthy', 'attention', 'risk', 'renewal'
  )),
  health_score INTEGER NOT NULL DEFAULT 70 CHECK (health_score BETWEEN 0 AND 100),

  -- Motivo da entrada (texto curto explicando porque a IA sinalizou)
  flag_reason TEXT,
  flagged_by TEXT DEFAULT 'system' CHECK (flagged_by IN ('system', 'manual')),
  flagged_at TIMESTAMPTZ DEFAULT NOW(),

  -- Etapa 2: ações aprovadas na call
  approved_actions JSONB DEFAULT '[]'::jsonb,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),

  -- Etapa 3: mensagem IA pronta pro WhatsApp
  ai_message TEXT,
  ai_message_generated_at TIMESTAMPTZ,

  -- Etapa 4: feedback enviado pelo Ryan
  feedback_sent_at TIMESTAMPTZ,
  feedback_sent_by UUID REFERENCES profiles(id),
  feedback_method TEXT CHECK (feedback_method IS NULL OR feedback_method IN ('whatsapp', 'email', 'call')),

  -- Status: ativa nessa semana ou foi resetada
  is_active BOOLEAN DEFAULT TRUE,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_pipeline_org_week
  ON weekly_pipeline_states(org_id, week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_pipeline_store
  ON weekly_pipeline_states(store_id);
CREATE INDEX IF NOT EXISTS idx_weekly_pipeline_stage
  ON weekly_pipeline_states(current_stage, is_active);

-- Unique: 1 estado ativo por loja por semana
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_pipeline_store_week
  ON weekly_pipeline_states(store_id, week_start)
  WHERE is_active = TRUE;

-- RLS
ALTER TABLE weekly_pipeline_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view weekly pipeline" ON weekly_pipeline_states;
CREATE POLICY "Org members view weekly pipeline" ON weekly_pipeline_states
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = weekly_pipeline_states.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "Org members manage weekly pipeline" ON weekly_pipeline_states;
CREATE POLICY "Org members manage weekly pipeline" ON weekly_pipeline_states
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = weekly_pipeline_states.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = weekly_pipeline_states.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = TRUE
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_weekly_pipeline_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_update_weekly_pipeline ON weekly_pipeline_states;
CREATE TRIGGER trg_update_weekly_pipeline
BEFORE UPDATE ON weekly_pipeline_states
FOR EACH ROW EXECUTE FUNCTION update_weekly_pipeline_updated_at();

-- Tabela de actions (1 store pode ter N actions na etapa 2)
CREATE TABLE IF NOT EXISTS weekly_pipeline_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_state_id UUID NOT NULL REFERENCES weekly_pipeline_states(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES profiles(id),
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),

  -- Vincula opcionalmente com task em productivity
  related_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_weekly_actions_pipeline ON weekly_pipeline_actions(pipeline_state_id);
CREATE INDEX IF NOT EXISTS idx_weekly_actions_status ON weekly_pipeline_actions(status);

ALTER TABLE weekly_pipeline_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view weekly actions" ON weekly_pipeline_actions;
CREATE POLICY "Org members view weekly actions" ON weekly_pipeline_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = weekly_pipeline_actions.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "Org members manage weekly actions" ON weekly_pipeline_actions;
CREATE POLICY "Org members manage weekly actions" ON weekly_pipeline_actions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = weekly_pipeline_actions.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = weekly_pipeline_actions.org_id
        AND om.profile_id = auth.uid()
        AND om.is_active = TRUE
    )
  );

COMMENT ON TABLE weekly_pipeline_states IS
  'Estado de cada loja no pipeline de Acompanhamento Semanal. Reset auto domingo 22h.';
COMMENT ON COLUMN weekly_pipeline_states.current_stage IS
  '1=precisa_atencao, 2=em_otimizacao, 3=pronta_feedback, 4=feedback_enviado';
COMMENT ON COLUMN weekly_pipeline_states.health_state IS
  'rampup (azul, primeiros 60d), healthy (verde, score 70+), attention (amarelo, 50-69), risk (vermelho, <50), renewal (roxo, contrato vence <30d)';
