-- ═══════════════════════════════════════════════════════════════════
-- Pacote P0/P1/P2 do CRM comercial (ago/2026)
-- ═══════════════════════════════════════════════════════════════════
-- Idempotente. Aplica os deltas de schema de:
--   1. Observação por item de produto (descrever o que foi vendido)
--   2. Motivos de perda configuráveis pela org
--   3. Campos obrigatórios por etapa da pipeline
--   4. Distribuição automática (rodízio) e visibilidade por pipeline
--   5. Automação: nó "Aguardar" real (dias) com retomada por cron

-- ── 1. Observação por item de produto ───────────────────────────────
ALTER TABLE crm_deal_products ADD COLUMN IF NOT EXISTS note TEXT;

-- ── 2. Motivos de perda configuráveis ───────────────────────────────
-- Antes: lista fixa no código. Agora a org gerencia os seus; a lista
-- padrão continua como fallback quando a org nunca configurou.
CREATE TABLE IF NOT EXISTS crm_lost_reasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_lost_reasons_org_label
  ON crm_lost_reasons (org_id, lower(label));
CREATE INDEX IF NOT EXISTS idx_crm_lost_reasons_org
  ON crm_lost_reasons (org_id, is_active, position);

ALTER TABLE crm_lost_reasons ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "crm_lost_reasons_all" ON crm_lost_reasons
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. Campos obrigatórios por etapa ────────────────────────────────
-- Array de chaves validadas pela API ao ENTRAR na etapa:
--   'value' | 'expected_close_date' | 'client' | 'phone' | 'products'
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS required_fields JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ── 4. Rodízio e visibilidade por pipeline ──────────────────────────
-- assignment_mode='round_robin': negócio criado sem dono explícito cai
-- no membro ativo com menos negócios abertos (menos carregado).
-- visibility='owner_only': vendedor (não-admin) vê só os próprios
-- negócios no board dessa pipeline.
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS assignment_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (assignment_mode IN ('manual','round_robin'));
ALTER TABLE pipelines ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'all'
  CHECK (visibility IN ('all','owner_only'));

-- ── 5. Automação: wait real com retomada ────────────────────────────
-- O nó "Aguardar" passava batido acima de 30s (rodava em memória).
-- Agora: espera longa grava resume_at + nó + snapshot do contexto e o
-- run fica 'waiting'; o cron /api/cron/crm-automation-resume retoma do
-- nó seguinte. Cadência D+1/D+3/D+7 funciona de verdade.
ALTER TABLE crm_automation_runs ADD COLUMN IF NOT EXISTS resume_at TIMESTAMPTZ;
ALTER TABLE crm_automation_runs ADD COLUMN IF NOT EXISTS resume_node_id TEXT;
ALTER TABLE crm_automation_runs ADD COLUMN IF NOT EXISTS context_snapshot JSONB;

DO $$ BEGIN
  ALTER TABLE crm_automation_runs DROP CONSTRAINT IF EXISTS crm_automation_runs_status_check;
  ALTER TABLE crm_automation_runs ADD CONSTRAINT crm_automation_runs_status_check
    CHECK (status IN ('pending','running','waiting','completed','failed','skipped'));
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'crm_automation_runs status check nao atualizado: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_automation_runs_resume
  ON crm_automation_runs (resume_at)
  WHERE status = 'waiting';
