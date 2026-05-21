-- ============================================================
-- Backfill: Gestao de Carteira (state-board CS)
-- ============================================================
-- Pipeline "Gestao de Carteira" tem 6 stages:
--   1. Saudavel       (auto, score >= 80)
--   2. Atencao        (auto, score 60-79)
--   3. Risco          (auto, score < 60 sem plano ativo)
--   4. Em recuperacao (manual, CSM iniciou plano)
--   5. Churn iminente (manual, cliente avisou cancelamento)
--   6. Churn          (manual/auto quando is_active=false)
--
-- Estados 1-3 sao computados pelo cron crm-health-compute apos atualizar
-- client_stores.health_score. Estados 4-6 sao manuais (CSM decide).
--
-- Este backfill cria 1 deal por loja ativa, no stage automatico
-- correspondente ao health_score atual. Lojas inativas vao pra Churn.
-- Idempotente: skip lojas que ja tem deal nesse pipeline.

DO $$
DECLARE
  v_pipeline_id UUID;
  v_stage_saudavel UUID;
  v_stage_atencao UUID;
  v_stage_risco UUID;
  v_stage_churn UUID;
BEGIN

SELECT id INTO v_pipeline_id FROM pipelines
WHERE name = 'Gestao de Carteira' AND scope = 'cs' LIMIT 1;

IF v_pipeline_id IS NULL THEN
  RAISE NOTICE 'Pipeline "Gestao de Carteira" nao existe — rode primeiro o seed 20260507';
  RETURN;
END IF;

SELECT id INTO v_stage_saudavel FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND "order" = 1;
SELECT id INTO v_stage_atencao  FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND "order" = 2;
SELECT id INTO v_stage_risco    FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND "order" = 3;
SELECT id INTO v_stage_churn    FROM pipeline_stages WHERE pipeline_id = v_pipeline_id AND "order" = 6;

-- 1 deal por loja, no stage automatico (score)
INSERT INTO deals (
  pipeline_id, stage_id, title, status, source, position,
  store_id, client_id, owner_id, currency, value, custom_fields
)
SELECT
  v_pipeline_id,
  CASE
    WHEN cs.is_active = false THEN v_stage_churn
    WHEN COALESCE(cs.health_score, 50) >= 80 THEN v_stage_saudavel
    WHEN COALESCE(cs.health_score, 50) >= 60 THEN v_stage_atencao
    ELSE v_stage_risco
  END,
  cs.store_name,
  (CASE WHEN cs.is_active = false THEN 'lost' ELSE 'open' END)::deal_status,
  'carteira_sync',
  ROW_NUMBER() OVER (
    PARTITION BY
      CASE
        WHEN cs.is_active = false THEN 'churn'
        WHEN COALESCE(cs.health_score, 50) >= 80 THEN 'saudavel'
        WHEN COALESCE(cs.health_score, 50) >= 60 THEN 'atencao'
        ELSE 'risco'
      END
    ORDER BY cs.mrr_cents DESC NULLS LAST, cs.store_name
  ) * 10,
  cs.id,
  cs.client_id,
  c.owner_id,
  'BRL',
  COALESCE(cs.mrr_cents, 0) / 100.0,
  jsonb_build_object(
    'health_score', cs.health_score,
    'auto_managed', true,
    'last_sync', NOW()
  )
FROM client_stores cs
LEFT JOIN clients c ON c.id = cs.client_id
WHERE NOT EXISTS (
  SELECT 1 FROM deals d
  WHERE d.pipeline_id = v_pipeline_id
    AND d.store_id = cs.id
);

RAISE NOTICE 'Gestao de Carteira: backfill completo (pipeline_id=%)', v_pipeline_id;

END $$;
