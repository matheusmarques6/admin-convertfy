-- ─────────────────────────────────────────────────────────────────────
-- Página "Logs de Geração de Emails" — Pipeline AE (Epic AE)
--
-- Foco: dashboard operacional do COO. Difere de ai_usage_unified
-- (genérico) por ser específico do pipeline de geração de emails
-- com 7 agentes.
--
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────

-- 1. Indexes pra acelerar filtros do dashboard ─────────────────────
CREATE INDEX IF NOT EXISTS idx_gen_runs_agent_created
  ON email_generation_runs(agent, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gen_runs_status_open
  ON email_generation_runs(status, created_at DESC)
  WHERE status IN ('error', 'running');

-- 2. View v_email_generation_logs ──────────────────────────────────
-- Faz os 3 JOINs (store, email, flow) num lugar só. Endpoint lê daqui.
-- raw_output NÃO entra na view: cada row pode ter 20k+ chars, então
-- a lista nunca o carrega. Endpoint de detalhe lê direto da tabela.
CREATE OR REPLACE VIEW v_email_generation_logs AS
SELECT
  r.id,
  r.created_at,
  r.batch_id,
  r.agent,
  r.model,
  r.status,
  r.tokens_input,
  r.tokens_output,
  r.cost_cents,
  r.duration_ms,
  r.retry_count,
  r.error_message,
  r.input_vars,
  r.parsed_output,
  r.store_id,
  s.store_name,
  r.email_id,
  e.name        AS email_name,
  e.number      AS email_position,
  r.flow_id,
  f.flow_type,
  -- QA Vision derivado: marca runs de agent='qa' que executaram
  -- vision check (subetapa). qa.chain.ts grava parsed_output.vision_ran
  -- a partir desta migration. Rows antigas ficam false.
  (r.agent = 'qa' AND COALESCE((r.parsed_output->>'vision_ran')::boolean, false))
    AS is_qa_vision
FROM email_generation_runs r
LEFT JOIN client_stores      s ON s.id = r.store_id
LEFT JOIN email_flow_emails  e ON e.id = r.email_id
LEFT JOIN email_flows        f ON f.id = r.flow_id;

-- View só é lida via createAdminClient (service role).
