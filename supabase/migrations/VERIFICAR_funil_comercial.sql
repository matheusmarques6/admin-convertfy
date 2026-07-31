-- ═══════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — o funil comercial está aplicado neste banco?
--
-- Só LÊ o catálogo do Postgres, não altera nada. Rode no SQL Editor
-- do Supabase: se alguma linha vier "FALTA", aplique
-- APLICAR_funil_comercial.sql.
-- ═══════════════════════════════════════════════════════════════

SELECT
  item,
  CASE WHEN existe THEN 'OK' ELSE 'FALTA' END AS situacao,
  migration
FROM (
  VALUES
    ('pipeline_stages.funnel_step (mapeamento das etapas)',
     EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'pipeline_stages' AND column_name = 'funnel_step'),
     '20261052'),

    ('deals.cash_collected (override manual do recebido)',
     EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'deals' AND column_name = 'cash_collected'),
     '20261052'),

    ('crm_ad_spend (investimento manual)',
     EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'crm_ad_spend'),
     '20261052'),

    ('crm_ad_spend.source (manual vs sincronizado)',
     EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'crm_ad_spend' AND column_name = 'source'),
     '20261053'),

    ('crm_ad_accounts (conexão Meta Ads)',
     EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'crm_ad_accounts'),
     '20261053'),

    ('crm_ad_insights (gasto e criativos por dia)',
     EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_name = 'crm_ad_insights'),
     '20261053'),

    ('unified_invoices (cash collect: Asaas + manual)',
     EXISTS (SELECT 1 FROM information_schema.views
             WHERE table_name = 'unified_invoices'),
     'pré-existente'),

    ('onboardings.source_deal_id (ponte venda → onboarding)',
     EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'onboardings' AND column_name = 'source_deal_id'),
     'pré-existente')
) AS t(item, existe, migration);

-- ── Quantas etapas já estão mapeadas no funil ────────────────────
-- Roda só se a coluna existir; sem mapeamento, o funil conta zero nas
-- etapas do meio (MQL, Agendamento, Reunião).
DO $$
DECLARE
  v_total INT;
  v_mapeadas INT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'pipeline_stages' AND column_name = 'funnel_step') THEN
    EXECUTE 'SELECT count(*), count(funnel_step) FROM pipeline_stages ps
             JOIN pipelines p ON p.id = ps.pipeline_id
             WHERE p.scope = ''sales'' AND p.is_archived = false'
      INTO v_total, v_mapeadas;
    RAISE NOTICE 'Etapas de pipelines de vendas: % no total, % mapeadas no funil', v_total, v_mapeadas;
  ELSE
    RAISE NOTICE 'Coluna funnel_step ainda nao existe — aplique a migration 20261052.';
  END IF;
END $$;
