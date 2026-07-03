-- Time tracking persistente por task (timer do drawer de produtividade).
-- Semantica server-side: time_spent_seconds acumula o total ja trabalhado;
-- timer_started_at nao-nulo significa timer RODANDO desde esse instante.
-- O servidor calcula e acumula no stop — sem heartbeat do cliente, o tempo
-- sobrevive a refresh/fechamento do drawer.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS time_spent_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timer_started_at timestamptz;

-- productivity_tasks existe em producao mas foi criada fora das migrations
-- (nao ha CREATE TABLE versionado) — IF EXISTS protege ambientes sem ela.
ALTER TABLE IF EXISTS productivity_tasks
  ADD COLUMN IF NOT EXISTS time_spent_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timer_started_at timestamptz;
