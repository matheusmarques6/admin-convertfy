-- ============================================================
-- Fila de disparo de copies (Montador+Blueprint → n8n).
--
-- Gatilho: o fluxo NATURAL do pipeline — o callback n8n pesquisa-completa
-- ENFILEIRA um job aqui (enqueueDispatchJob) quando a Pesquisa & Diagnóstico
-- termina. O Montador+Blueprint precisa rodar pra TODOS os emails ANTES de
-- disparar pro n8n, mas isso (Opus, 60-180s/email, 34 emails) não cabe no
-- maxDuration de um request (504). Um cron (every minute, maxDuration 300)
-- processa o Architect em lotes e, quando TODOS os emails estão prontos
-- (gerados ou esgotados → fallback global), dispara pro n8n UMA vez.
--
-- emails JSONB: [{flow_type, email_number, architect, attempts}] onde
--   architect ∈ ('pending','done','failed'). 'done' = reference gerada;
--   'failed' = esgotou tentativas → consumidor usa o template global.
-- Espelha as convenções de email_generation_queue_signals (status enum, RLS).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS email_dispatch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  flow_ids UUID[] DEFAULT NULL,                 -- NULL = todos os flows
  only_drafts BOOLEAN NOT NULL DEFAULT true,
  trigger_source TEXT NOT NULL DEFAULT 'manual_store_button',
  triggered_by UUID DEFAULT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','generating','dispatching','done','failed')),
  emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  architect_total INT NOT NULL DEFAULT 0,
  architect_done INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,              -- tentativas de dispatch final
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- heartbeat/lease do cron
  dispatched_at TIMESTAMPTZ
);

-- Index partial: o cron faz `WHERE status IN ('pending','generating') ORDER BY created_at`.
CREATE INDEX IF NOT EXISTS idx_edj_active
  ON email_dispatch_jobs(status, updated_at)
  WHERE status IN ('pending','generating','dispatching');

CREATE INDEX IF NOT EXISTS idx_edj_store
  ON email_dispatch_jobs(store_id, created_at DESC);

ALTER TABLE email_dispatch_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: padrão authenticated_full_access reusado do epic email workspace.
DROP POLICY IF EXISTS "authenticated_full_access" ON email_dispatch_jobs;
CREATE POLICY "authenticated_full_access"
  ON email_dispatch_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
