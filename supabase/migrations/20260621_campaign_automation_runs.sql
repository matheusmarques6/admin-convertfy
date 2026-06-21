-- ============================================================
-- Log de automações por transição de coluna do board (Fase 3).
--
-- Gatilho: POST /api/admin/campaign-central/board/[id]/move →
-- moveBoardCard() persiste a transição e, fire-and-forget, chama
-- executeColumnTransition() (central-automation.service.ts). Para cada
-- handler do REGISTRY que casa com a coluna de destino, grava UMA linha
-- aqui e dispara o efeito.
--
-- FASE 3 = STUB: os handlers (clickup/slack/omnisend/ga) só montam um
-- request_payload realista e gravam status='stub' (NÃO fazem HTTP). Na
-- Fase 4 o corpo vira HTTP real (status 'success'/'failed') SEM mudar
-- esta tabela nem a assinatura do handler.
--
-- Mapa coluna→integração: aprovada=clickup, design=slack,
-- agendada=omnisend, enviada=ga.
--
-- Espelha convenções de campaign_copy_jobs (RLS por org via org_members,
-- índices, IF NOT EXISTS). Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  suggestion_id UUID REFERENCES campaign_suggestions(id) ON DELETE SET NULL,
  pipeline_item_id UUID REFERENCES campaign_pipeline_items(id) ON DELETE SET NULL,
  from_column TEXT,
  to_column TEXT NOT NULL,
  integration TEXT NOT NULL
    CHECK (integration IN ('clickup','slack','omnisend','ga','internal')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed','skipped','stub')),
  request_payload JSONB,
  response_status INT,
  response_body TEXT,
  external_ref TEXT,
  error_message TEXT,
  triggered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico por campanha (aba Automações lista por sugestão, mais recente
-- primeiro).
CREATE INDEX IF NOT EXISTS idx_car_suggestion
  ON campaign_automation_runs(suggestion_id, created_at DESC);

-- Watchdog (Fase 4): varre runs travadas em 'pending' pra re-tentar.
CREATE INDEX IF NOT EXISTS idx_car_pending
  ON campaign_automation_runs(status, created_at)
  WHERE status = 'pending';

ALTER TABLE campaign_automation_runs ENABLE ROW LEVEL SECURITY;

-- Membership por org via org_members — mesmo padrão de campaign_copy_jobs,
-- campaign_suggestions, campaign_trends e campaign_ai_runs (epic
-- campaign-central). Service-role bypassa esta policy; ela protege apenas
-- leituras com anon key (defesa em profundidade).
DROP POLICY IF EXISTS "campaign_automation_runs_org" ON campaign_automation_runs;
CREATE POLICY "campaign_automation_runs_org" ON campaign_automation_runs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members
               WHERE profile_id = auth.uid() AND is_active = true)
  );
