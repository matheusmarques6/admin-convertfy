-- =============================================
-- Tabela de locks para cron jobs (idempotência)
-- =============================================
-- Evita execuções paralelas do mesmo cron job.
-- Stale locks (> 10 min) são ignorados automaticamente pelo cron.

CREATE TABLE IF NOT EXISTS cron_locks (
  lock_name VARCHAR(100) PRIMARY KEY,
  is_running BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cron_locks IS 'Locks de idempotência para cron jobs - evita execuções paralelas';

-- Seed: registro para o sync-reports
INSERT INTO cron_locks (lock_name, is_running)
VALUES ('sync_reports', false)
ON CONFLICT (lock_name) DO NOTHING;

-- RLS: apenas service_role pode acessar
ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_cron_locks_all" ON cron_locks
  FOR ALL USING (true) WITH CHECK (true);
