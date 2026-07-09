-- ============================================================
-- Live view de execuções de agentes (/admin/agents/runs).
--
-- 1) `updated_at` em email_generation_runs: o SSE
--    (/api/sse/admin/agents/runs) faz polling por
--    `updated_at > lastSeen` — captura tanto INSERTs (run criado
--    já em 'running' pela instrumentação start/finish) quanto
--    UPDATEs (transição running → success/error/skipped).
--    Sem essa coluna só INSERTs seriam observáveis e a UI nunca
--    veria o run concluir.
--
-- 2) Índices: polling ordenado por updated_at + partial index de
--    runs em execução (a seção "rodando agora" consulta
--    status='running' a cada snapshot).
--
-- Idempotente.
-- ============================================================

ALTER TABLE email_generation_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE email_generation_runs
  SET updated_at = created_at
  WHERE updated_at IS NULL;

ALTER TABLE email_generation_runs
  ALTER COLUMN updated_at SET DEFAULT NOW();

ALTER TABLE email_generation_runs
  ALTER COLUMN updated_at SET NOT NULL;

-- Trigger touch: qualquer UPDATE (ex.: finishGenerationRun) renova
-- updated_at sem depender do caller lembrar de setar.
CREATE OR REPLACE FUNCTION fn_touch_email_generation_runs()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_egr_touch_updated_at ON email_generation_runs;
CREATE TRIGGER trg_egr_touch_updated_at
  BEFORE UPDATE ON email_generation_runs
  FOR EACH ROW
  EXECUTE FUNCTION fn_touch_email_generation_runs();

CREATE INDEX IF NOT EXISTS idx_gen_runs_updated
  ON email_generation_runs(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_gen_runs_running
  ON email_generation_runs(created_at DESC)
  WHERE status = 'running';
