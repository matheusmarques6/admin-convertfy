-- =============================================
-- Tabela store_daily_metrics
-- =============================================
-- Série temporal DIÁRIA de métricas de email por loja. Habilita gráficos de
-- tendência reais (Performance do Email, sparklines de KPI, trend por loja)
-- que antes eram placeholders (arrays de zeros).
--
-- Duas fontes de preenchimento:
--   1. BACKFILL (histórico): campanhas de klaviyo/omnisend_campaign_metrics
--      bucketizadas por send_time::date — dado real já existente.
--   2. CRON diário: snapshot do dia anterior (campanhas enviadas + receita
--      corrente da loja).
--
-- Granularidade: 1 linha por (store_id, metric_date, source).

CREATE TABLE IF NOT EXISTS store_daily_metrics (
  store_id       UUID         NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  metric_date    DATE         NOT NULL,
  source         VARCHAR(10)  NOT NULL CHECK (source IN ('klaviyo', 'omnisend')),

  -- Isolamento multi-tenant — NOT NULL obrigatório
  org_id         UUID         NOT NULL REFERENCES organizations(id),

  -- Métricas de campanha agregadas nas campanhas enviadas neste dia
  recipients     BIGINT       NOT NULL DEFAULT 0,
  delivered      BIGINT       NOT NULL DEFAULT 0,
  opened         BIGINT       NOT NULL DEFAULT 0,
  clicked        BIGINT       NOT NULL DEFAULT 0,
  conversions    BIGINT       NOT NULL DEFAULT 0,
  conversion_value NUMERIC(15, 2) NOT NULL DEFAULT 0,
  bounced        BIGINT       NOT NULL DEFAULT 0,
  unsubscribed   BIGINT       NOT NULL DEFAULT 0,

  -- Snapshot da receita total da loja no dia (só o cron preenche; backfill
  -- deixa null pois não há atribuição diária histórica). Nullable de propósito.
  store_total_revenue NUMERIC(15, 2),

  currency       VARCHAR(3)   NOT NULL DEFAULT 'BRL',

  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT store_daily_metrics_non_negative CHECK (
    recipients >= 0 AND delivered >= 0 AND opened >= 0 AND clicked >= 0
    AND conversions >= 0 AND conversion_value >= 0 AND bounced >= 0 AND unsubscribed >= 0
  ),

  PRIMARY KEY (store_id, metric_date, source)
);

-- Índice para queries de série por org + intervalo de datas
CREATE INDEX IF NOT EXISTS idx_store_daily_metrics_org_date
  ON store_daily_metrics(org_id, metric_date);

-- Índice para série por loja
CREATE INDEX IF NOT EXISTS idx_store_daily_metrics_store_date
  ON store_daily_metrics(store_id, metric_date);

-- RLS — mesmo padrão de store_revenue_summary
ALTER TABLE store_daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_store_daily_metrics_select" ON store_daily_metrics
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_store(store_id)
  );

-- Escrita: service role (cron/backfill) opera via createAdminClient (bypassa RLS).
-- Sem policy de INSERT/UPDATE para authenticated — dados só entram via job.

COMMENT ON TABLE store_daily_metrics IS
  'Série temporal diária de métricas de email por loja (backfill via send_time + cron diário). Fonte dos gráficos de tendência do dashboard.';
