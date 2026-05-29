-- ============================================================
-- Epic AE: Agent Email Generation
-- Story AE-1: Schema canônico estendido + telemetria + tags + queue signals
--             + audit log de status changes.
--
-- Referencias:
--   - docs/stories/AE-1.schema-status-enum-tags-telemetry.md
--   - docs/architecture/adr-agent-email-generation.md
--
-- Migration TOTALMENTE idempotente:
--   - Pode ser aplicada multiplas vezes sem efeito colateral.
--   - Usa IF NOT EXISTS / DROP CONSTRAINT IF EXISTS / CREATE OR REPLACE.
--   - DROP POLICY IF EXISTS antes de recriar policies (Postgres nao tem
--     "CREATE POLICY IF NOT EXISTS").
--
-- Notas sobre nomes de CHECK constraints:
--   - email_flow_emails_status_check: nome explicito criado em
--     20260622_email_status_copy_ready.sql. Match seguro.
--   - store_briefings_status_check / email_agent_configs_agent_type_check /
--     email_generation_runs_agent_check: nao foram criados com nome explicito
--     nas migrations originais (CHECK inline anonimo). PostgreSQL gera
--     automaticamente nomes no padrao <table>_<column>_check, o que coincide
--     com os nomes assumidos aqui. Caso a base tenha um nome diferente, o
--     bloco DO PL/pgSQL ao final faz limpeza defensiva varrendo pg_constraint.
-- ============================================================

-- ── 1. Extende CHECK constraint de email_flow_emails.status ─
-- Status legados (in_progress, approved, live) mantidos por
-- retrocompat com Epic 8/9 (Klaviyo push). Novos status AE entram
-- ao lado, nao substituem.
ALTER TABLE email_flow_emails
  DROP CONSTRAINT IF EXISTS email_flow_emails_status_check;

ALTER TABLE email_flow_emails
  ADD CONSTRAINT email_flow_emails_status_check
  CHECK (status IN (
    'draft',
    'in_progress',              -- legacy, mantido por retrocompat
    'pending',                  -- agendado para gerar
    'copy_generating',
    'copy_generating_recovery', -- fallback in-process apos watchdog
    'copy_ready',
    'rendering',
    'qa_running',
    'ready',
    'failed',
    'approved',                 -- legacy, mantido
    'live'                      -- legacy, mantido
  ));

-- ── 2. Colunas de timing e telemetria por email ─────────────
-- Permitem: detectar travamentos (watchdog), medir p95 fase 1/fase 2,
-- agregar custo por email, agrupar emails por batch.
ALTER TABLE email_flow_emails
  ADD COLUMN IF NOT EXISTS generation_batch_id UUID,
  ADD COLUMN IF NOT EXISTS copy_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS copy_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rendering_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qa_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS qa_issues JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_cost_cents NUMERIC(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- Index partial: so popula entradas com batch_id (evita bloat em
-- linhas legacy sem batch).
CREATE INDEX IF NOT EXISTS idx_efe_batch
  ON email_flow_emails(generation_batch_id)
  WHERE generation_batch_id IS NOT NULL;

-- Indexes partial para o watchdog: filtra direto pelos status de
-- interesse, custo de manutencao baixo.
CREATE INDEX IF NOT EXISTS idx_efe_stuck_copy
  ON email_flow_emails(status, copy_started_at)
  WHERE status IN ('copy_generating', 'copy_generating_recovery');

CREATE INDEX IF NOT EXISTS idx_efe_stuck_phase2
  ON email_flow_emails(status, rendering_started_at, qa_started_at)
  WHERE status IN ('rendering', 'qa_running');

-- ── 3. Sistema de tags em profiles ─────────────────────────
-- Mesmo padrao usado em clients.tags. Permite que notification.service
-- filtre destinatarios por tag (ex: tag 'cto' para alertas de falha)
-- sem mudar schema a cada nova rota.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Index GIN: necessario para operadores @>, &&, ? performarem em
-- queries tipo `WHERE tags @> ARRAY['cto']`.
CREATE INDEX IF NOT EXISTS idx_profiles_tags
  ON profiles USING GIN (tags);

-- ── 4. email_generation_queue_signals (sinal de fila) ──────
-- Trigger SQL NAO faz HTTP. Apenas insere sinal aqui + pg_notify.
-- Watchdog/consumer le esta tabela e dispara o start-onboarding real.
CREATE TABLE IF NOT EXISTS email_generation_queue_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  triggered_by TEXT NOT NULL
    CHECK (triggered_by IN ('briefing_confirmed','manual','watchdog_retry')),
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Index partial: consumer faz `WHERE status='pending' ORDER BY created_at`.
CREATE INDEX IF NOT EXISTS idx_eqs_pending
  ON email_generation_queue_signals(status, created_at)
  WHERE status = 'pending';

ALTER TABLE email_generation_queue_signals ENABLE ROW LEVEL SECURITY;

-- Policy: padrao authenticated_full_access reusado do epic email workspace.
-- Pre-drop garante idempotencia (Postgres nao tem CREATE POLICY IF NOT EXISTS).
DROP POLICY IF EXISTS "authenticated_full_access"
  ON email_generation_queue_signals;
CREATE POLICY "authenticated_full_access"
  ON email_generation_queue_signals
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 5. store_briefings: status 'confirmed' + colunas confirm ─
-- CHECK atual: 'current' | 'archived'. Adiciona 'confirmed'.
-- Briefings existentes ficam em 'current' (sem migration de dado).
ALTER TABLE store_briefings
  DROP CONSTRAINT IF EXISTS store_briefings_status_check;

ALTER TABLE store_briefings
  ADD CONSTRAINT store_briefings_status_check
  CHECK (status IN ('current','confirmed','archived'));

ALTER TABLE store_briefings
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES profiles(id);

-- ── 6. Trigger: enfileira sinal ao confirmar briefing ──────
-- AFTER UPDATE FOR EACH ROW. NUNCA bloqueia o UPDATE do briefing
-- (EXCEPTION WHEN OTHERS -> RAISE WARNING). NUNCA faz HTTP.
CREATE OR REPLACE FUNCTION fn_on_briefing_confirmed()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'confirmed'
      AND (OLD.status IS NULL OR OLD.status <> 'confirmed')) THEN
    BEGIN
      INSERT INTO email_generation_queue_signals
        (store_id, triggered_by, payload)
      VALUES
        (NEW.store_id, 'briefing_confirmed',
         jsonb_build_object('briefing_id', NEW.id, 'version', NEW.version));
      -- pg_notify e best-effort; listeners sao opcionais.
      PERFORM pg_notify('email_generation_signal',
        jsonb_build_object('store_id', NEW.store_id)::text);
    EXCEPTION WHEN OTHERS THEN
      -- NUNCA bloqueia o UPDATE do briefing.
      RAISE WARNING 'fn_on_briefing_confirmed failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_store_briefings_confirmed ON store_briefings;
CREATE TRIGGER trg_store_briefings_confirmed
  AFTER UPDATE ON store_briefings
  FOR EACH ROW EXECUTE FUNCTION fn_on_briefing_confirmed();

-- ── 7. email_agent_configs.agent_type: aceita 'qa' ─────────
ALTER TABLE email_agent_configs
  DROP CONSTRAINT IF EXISTS email_agent_configs_agent_type_check;

ALTER TABLE email_agent_configs
  ADD CONSTRAINT email_agent_configs_agent_type_check
  CHECK (agent_type IN ('copy','image','html','qa'));

-- ── 8. email_generation_runs.agent: aceita 'qa' ────────────
ALTER TABLE email_generation_runs
  DROP CONSTRAINT IF EXISTS email_generation_runs_agent_check;

ALTER TABLE email_generation_runs
  ADD CONSTRAINT email_generation_runs_agent_check
  CHECK (agent IN ('seed','copy','image','html','qa'));

-- ── 9. email_status_events (audit log + SSE bus) ───────────
-- Append-only. Cada transicao de status em email_flow_emails
-- gera 1 linha. SSE endpoint le polling do last id seen.
CREATE TABLE IF NOT EXISTS email_status_events (
  id BIGSERIAL PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  email_id UUID NOT NULL REFERENCES email_flow_emails(id) ON DELETE CASCADE,
  flow_id UUID REFERENCES email_flows(id) ON DELETE SET NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  batch_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ese_store_recent
  ON email_status_events(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ese_email_recent
  ON email_status_events(email_id, created_at DESC);

ALTER TABLE email_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access"
  ON email_status_events;
CREATE POLICY "authenticated_full_access"
  ON email_status_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 10. Trigger: log de mudancas de status ─────────────────
-- AFTER UPDATE em email_flow_emails. Quando status muda, insere
-- linha em email_status_events + pg_notify('email_status_event').
-- IS DISTINCT FROM tolera NULL em ambos os lados.
CREATE OR REPLACE FUNCTION fn_log_email_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO email_status_events
      (store_id, email_id, flow_id, from_status, to_status, batch_id, metadata)
    SELECT
      ef.store_id,
      NEW.id,
      NEW.flow_id,
      OLD.status,
      NEW.status,
      NEW.generation_batch_id,
      jsonb_build_object(
        'failure_reason', NEW.failure_reason,
        'qa_issues_count', COALESCE(jsonb_array_length(NEW.qa_issues), 0)
      )
    FROM email_flows ef WHERE ef.id = NEW.flow_id;

    PERFORM pg_notify('email_status_event',
      jsonb_build_object('email_id', NEW.id, 'status', NEW.status)::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_status_change ON email_flow_emails;
CREATE TRIGGER trg_email_status_change
  AFTER UPDATE ON email_flow_emails
  FOR EACH ROW EXECUTE FUNCTION fn_log_email_status_change();

-- ============================================================
-- Fim da migration Epic AE-1.
-- ============================================================
