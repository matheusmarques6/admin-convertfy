-- ─────────────────────────────────────────────────────────────────────
-- Logs de Geração — view enxuta + índice de ordenação
--
-- Incidente 20/jul: GET /api/admin/email-generation-logs morreu com
-- statement timeout (57014). Causa dupla:
--   1. A view v_email_generation_logs expunha input_vars + parsed_output
--      (JSONB gigantes — runs de html carregam o reference_html inteiro
--      em input_vars, dezenas de KB por linha) e a rota fazia SELECT *
--      paginado em 1000 rows → detoast massivo por página.
--   2. A ordenação `created_at DESC` da janela não tinha índice puro
--      (só (agent, created_at) e o parcial de status).
--
-- Fix:
--   - View SEM os JSONB pesados (o único consumidor é a rota de lista;
--     o detalhe [id] lê email_generation_runs direto). is_qa_vision
--     continua computado NA VIEW (parsed_output é referenciado só para
--     extrair o boolean — o planner detoasta apenas quando a linha entra
--     no resultado, e o campo extraído é minúsculo).
--   - Índice btree puro em created_at DESC.
--
-- DROP + CREATE (não OR REPLACE): remover colunas de view exige drop.
-- Idempotente.
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_gen_runs_created_at
  ON email_generation_runs(created_at DESC);

DROP VIEW IF EXISTS v_email_generation_logs;

CREATE VIEW v_email_generation_logs AS
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
  r.store_id,
  s.store_name,
  r.email_id,
  e.name        AS email_name,
  e.number      AS email_position,
  r.flow_id,
  f.flow_type,
  (r.agent = 'qa' AND COALESCE((r.parsed_output->>'vision_ran')::boolean, false))
    AS is_qa_vision
FROM email_generation_runs r
LEFT JOIN client_stores      s ON s.id = r.store_id
LEFT JOIN email_flow_emails  e ON e.id = r.email_id
LEFT JOIN email_flows        f ON f.id = r.flow_id;

-- View só é lida via createAdminClient (service role).
