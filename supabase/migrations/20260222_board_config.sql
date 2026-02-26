-- Migration: Board Config per Agent
-- EPIC 7: Equipe — Config por Agente + EPIC 4: Board Inteligente
-- Permite configurar quais processos alimentam o board de cada agente

-- 1. Criar tabela board_config
CREATE TABLE IF NOT EXISTS board_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id UUID UNIQUE NOT NULL REFERENCES org_members(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Fontes de evento que alimentam o board
  show_onboarding_tasks BOOLEAN NOT NULL DEFAULT false,
  show_meeting_tasks BOOLEAN NOT NULL DEFAULT true,
  show_campaign_tasks BOOLEAN NOT NULL DEFAULT false,
  show_feedback_tasks BOOLEAN NOT NULL DEFAULT false,
  show_report_tasks BOOLEAN NOT NULL DEFAULT false,
  show_contract_tasks BOOLEAN NOT NULL DEFAULT false,
  show_manual_tasks BOOLEAN NOT NULL DEFAULT true,
  -- Calendário
  calendar_view_mode TEXT NOT NULL DEFAULT 'monthly'
    CHECK (calendar_view_mode IN ('daily', 'weekly', 'monthly')),
  show_personal_events BOOLEAN NOT NULL DEFAULT true,
  -- Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Adicionar source_type e source_id na tabela tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
  CHECK (source_type IN ('manual', 'auto_onboarding', 'auto_meeting', 'auto_campaign', 'auto_feedback', 'auto_report', 'auto_contract'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_id UUID;

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_board_config_org_member ON board_config(org_member_id);
CREATE INDEX IF NOT EXISTS idx_board_config_org ON board_config(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source_type, source_id);

-- 4. RLS
ALTER TABLE board_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_config_select_own_org" ON board_config
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "board_config_insert_own_org" ON board_config
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "board_config_update_own_org" ON board_config
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "board_config_delete_own_org" ON board_config
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true
    )
  );

-- 5. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_board_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER board_config_updated_at
  BEFORE UPDATE ON board_config
  FOR EACH ROW
  EXECUTE FUNCTION update_board_config_updated_at();
