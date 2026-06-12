-- ─────────────────────────────────────────────────────────────────────
-- Observabilidade total de IA — controle de custo por execução
--
-- Problema: telemetria de IA espalhada em 3 tabelas (email_generation_runs,
-- campaign_ai_runs, crm_ai_action_runs) e ~9 call-sites SEM telemetria
-- nenhuma (chats, briefing cascade, capture-brand, objections, insights,
-- ai.service legacy).
--
-- Solução:
--   1. ai_usage_events — tabela genérica pros call-sites órfãos
--      (instrumentados via recordAiUsage() do ai-usage.service.ts).
--   2. ai_usage_unified — VIEW que une as 4 fontes num formato canônico
--      (source, feature, model, status, tokens, cost_cents, duration).
--      É o que o dashboard /admin/ai-usage consome.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Tabela genérica de eventos de uso de IA ───────────────────────
CREATE TABLE IF NOT EXISTS ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature TEXT NOT NULL,             -- 'ai_chat', 'ritual_chat', 'briefing_generation', ...
  model TEXT,
  provider TEXT,                     -- 'anthropic' | 'openrouter' | 'openai'
  status TEXT NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error')),
  tokens_input INT NOT NULL DEFAULT 0,
  tokens_output INT NOT NULL DEFAULT 0,
  cost_cents NUMERIC(12,4) NOT NULL DEFAULT 0,
  duration_ms INT NOT NULL DEFAULT 0,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  org_id UUID,
  store_id UUID,
  context JSONB,                     -- ids extras: conversation_id, onboarding_id, etc
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_feature
  ON ai_usage_events(feature, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_created
  ON ai_usage_events(created_at DESC);

-- ── 2. View unificada (4 fontes → formato canônico) ──────────────────
-- Custos: email_generation_runs.cost_cents é NUMERIC(10,4);
-- campaign/crm são INT. Normaliza tudo pra NUMERIC.
-- Status: 'completed' → 'success'; demais mapeados.
CREATE OR REPLACE VIEW ai_usage_unified AS
SELECT
  e.id,
  'email_generation'::text AS source,
  e.agent AS feature,
  e.model,
  CASE WHEN e.status = 'success' THEN 'success'
       WHEN e.status = 'error' THEN 'error'
       ELSE e.status END AS status,
  COALESCE(e.tokens_input, 0) AS tokens_input,
  COALESCE(e.tokens_output, 0) AS tokens_output,
  COALESCE(e.cost_cents, 0)::numeric AS cost_cents,
  COALESCE(e.duration_ms, 0) AS duration_ms,
  e.store_id,
  NULL::uuid AS org_id,
  e.created_at
FROM email_generation_runs e

UNION ALL

SELECT
  c.id,
  'campaign_central'::text AS source,
  c.kind AS feature,
  c.model,
  CASE WHEN c.status = 'completed' THEN 'success'
       WHEN c.status IN ('failed', 'invalid_output') THEN 'error'
       ELSE c.status END AS status,
  COALESCE(c.tokens_input, 0),
  COALESCE(c.tokens_output, 0),
  COALESCE(c.cost_cents, 0)::numeric,
  COALESCE(c.duration_ms, 0),
  NULL::uuid AS store_id,
  c.org_id,
  c.created_at
FROM campaign_ai_runs c

UNION ALL

SELECT
  r.id,
  'crm'::text AS source,
  COALESCE(a.name, 'ai_action') AS feature,
  a.model,
  CASE WHEN r.status = 'completed' THEN 'success'
       WHEN r.status IN ('failed', 'invalid_output') THEN 'error'
       ELSE r.status END AS status,
  COALESCE(r.tokens_input, 0),
  COALESCE(r.tokens_output, 0),
  COALESCE(r.cost_cents, 0)::numeric,
  COALESCE(r.duration_ms, 0),
  NULL::uuid AS store_id,
  NULL::uuid AS org_id,
  r.created_at
FROM crm_ai_action_runs r
LEFT JOIN crm_ai_actions a ON a.id = r.ai_action_id

UNION ALL

SELECT
  u.id,
  'standalone'::text AS source,
  u.feature,
  u.model,
  u.status,
  u.tokens_input,
  u.tokens_output,
  u.cost_cents,
  u.duration_ms,
  u.store_id,
  u.org_id,
  u.created_at
FROM ai_usage_events u;

-- RLS: tabela só é acessada via service role (admin client) — padrão
-- das demais tabelas de telemetria do projeto.
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
