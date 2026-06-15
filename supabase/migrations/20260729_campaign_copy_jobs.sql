-- ============================================================
-- Fila de disparo da copy de campanha (Master → n8n → per-store callback).
--
-- Gatilho: POST /api/admin/campaign-central/suggestions/[id]/generate-copy
-- enfileira UM job aqui, dispara webhook pro n8n com a master + lista de
-- lojas, e responde 202. O n8n gera copy por loja e chama o callback
-- /api/webhooks/n8n/campaign-copy uma vez por loja. Cada callback
-- incrementa completed_count; quando bate stores_count -> status='done'.
--
-- Watchdog (a cada 5min): jobs em pending/running parados > 10min são
-- promovidos pra fallback inline (status='fallback_inline'): o
-- generateCampaignCopy roda inline pras lojas pendentes.
--
-- Espelha convenções de email_dispatch_jobs (status enum, RLS, índices).
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_copy_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES campaign_suggestions(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('test','production')),
  store_ids UUID[] NOT NULL,
  stores_count INT NOT NULL,
  completed_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'dispatched'
    CHECK (status IN ('dispatched','running','done','failed','fallback_inline')),
  dispatch_response_status INT,
  dispatch_error TEXT,
  triggered_by UUID DEFAULT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_at TIMESTAMPTZ,
  fallback_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ccj_suggestion
  ON campaign_copy_jobs(suggestion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ccj_active
  ON campaign_copy_jobs(status, updated_at)
  WHERE status IN ('dispatched','running');

ALTER TABLE campaign_copy_jobs ENABLE ROW LEVEL SECURITY;

-- Membership por org via org_members — mesmo padrão de campaign_cycles,
-- campaign_suggestions, campaign_trends e campaign_ai_runs (epic
-- campaign-central, migration 20260716). Service-role bypassa esta
-- policy; ela protege apenas leituras com anon key (defesa em profundidade).
DROP POLICY IF EXISTS "campaign_copy_jobs_org" ON campaign_copy_jobs;
CREATE POLICY "campaign_copy_jobs_org" ON campaign_copy_jobs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members
               WHERE profile_id = auth.uid() AND is_active = true)
  );
