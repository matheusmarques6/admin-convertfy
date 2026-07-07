-- ============================================================
-- Fila de imports do Figma (rate limit Tier 1: /v1/images = 10 req/min).
--
-- Os imports das Telas 1 (corte modelo) e 2 (email por loja) deixam de
-- exportar do Figma inline no request: a rota ENFILEIRA um job aqui e o
-- cron `/api/cron/figma-import-queue` (every minute, maxDuration 300)
-- processa respeitando o orçamento interno de 8 exports/min (guarda
-- distribuída no client — ver figma/export-budget.ts). Os modais fazem
-- polling do job via GET /api/tasks/[id]/figma-import-jobs/[jobId].
--
-- kind: 'store_emails' (Tela 2) | 'cut_model' (Tela 1).
-- payload JSONB: store_emails {store_ids?: uuid[]} | cut_model {figma_url}.
-- result JSONB: store_emails = FigmaImportResult PARCIAL (results cresce a
--   cada loja settlada — heartbeat); cut_model = CutModelImportResult.
-- updated_at = heartbeat/lease do cron (claim otimista CAS, sem FOR UPDATE).
-- Espelha as convenções de email_dispatch_jobs. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS figma_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id UUID NOT NULL REFERENCES campaign_suggestions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('store_emails','cut_model')),
  org_id UUID,                                    -- store_emails: necessário no processamento
  triggered_by UUID DEFAULT NULL REFERENCES profiles(id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','failed')),
  result JSONB,
  progress_total INT NOT NULL DEFAULT 0,
  progress_done INT NOT NULL DEFAULT 0,
  attempts INT NOT NULL DEFAULT 0,                -- tentativas top-level (429/5xx)
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- heartbeat/lease do cron
  finished_at TIMESTAMPTZ
);

-- Index partial: o cron faz `WHERE status IN ('pending','processing') ORDER BY created_at`.
CREATE INDEX IF NOT EXISTS idx_fij_active
  ON figma_import_jobs(status, updated_at)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_fij_suggestion
  ON figma_import_jobs(suggestion_id, created_at DESC);

-- No máximo 1 job ATIVO por (suggestion, kind): fecha no banco a corrida de
-- dois cliques/abas criarem 2 jobs (o dedup app-level checa antes do insert;
-- este índice é o backstop atômico — violação 23505 vira 'already_queued').
CREATE UNIQUE INDEX IF NOT EXISTS uq_fij_one_active
  ON figma_import_jobs(suggestion_id, kind)
  WHERE status IN ('pending','processing');

ALTER TABLE figma_import_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: padrão authenticated_full_access (igual email_dispatch_jobs).
DROP POLICY IF EXISTS "authenticated_full_access" ON figma_import_jobs;
CREATE POLICY "authenticated_full_access"
  ON figma_import_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
