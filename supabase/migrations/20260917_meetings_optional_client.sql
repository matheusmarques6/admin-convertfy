-- ===========================================
-- Reunioes sem cliente vinculado (import bidirecional Google -> admin)
-- ===========================================
-- Eventos criados direto na agenda central da convertfy (Google) nao sabem
-- a qual cliente pertencem. Para importa-los, client_id passa a ser opcional;
-- a reuniao entra "sem cliente vinculado" e alguem vincula depois no admin.
--
-- source distingue a origem: 'admin' (criada no app) vs 'google' (importada).
-- ===========================================

-- 1. client_id opcional (mantem FK e ON DELETE CASCADE quando preenchido)
ALTER TABLE meetings ALTER COLUMN client_id DROP NOT NULL;

-- 2. Origem da reuniao
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'admin';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meetings_source_check'
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_source_check
      CHECK (source IN ('admin', 'google'));
  END IF;
END
$$;

COMMENT ON COLUMN meetings.source IS
  'admin = criada no app; google = importada da agenda central da convertfy (pode ter client_id nulo ate ser vinculada).';

-- Facilita listar reunioes importadas pendentes de vinculo
CREATE INDEX IF NOT EXISTS idx_meetings_source_unlinked
  ON meetings(org_id) WHERE source = 'google' AND client_id IS NULL;

NOTIFY pgrst, 'reload schema';
