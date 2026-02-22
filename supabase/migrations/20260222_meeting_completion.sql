-- Meeting Completion Notes
-- Adiciona campos para notas de conclusão de reunião
-- Permite que participantes vejam o resumo após a reunião ser concluída

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS completion_notes TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id);

-- Índice para busca rápida de reuniões concluídas
CREATE INDEX IF NOT EXISTS idx_meetings_completed_at
  ON meetings(completed_at)
  WHERE completed_at IS NOT NULL;

COMMENT ON COLUMN meetings.completion_notes IS 'Notas anexadas ao concluir a reunião, visíveis para todos os participantes';
COMMENT ON COLUMN meetings.completed_at IS 'Timestamp de quando a reunião foi marcada como concluída';
COMMENT ON COLUMN meetings.completed_by IS 'ID do usuário que marcou como concluída';
