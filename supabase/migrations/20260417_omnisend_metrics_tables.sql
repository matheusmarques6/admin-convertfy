-- Migration: Omnisend metrics tables (espelham Klaviyo)
-- Data: 2026-04-17
--
-- Adiciona:
--   1. Colunas omnisend_* em store_revenue_summary
--   2. Tabela omnisend_campaign_metrics
--   3. Tabela omnisend_flow_metrics (automacoes)
--   4. Coluna email_platform em client_stores (klaviyo|omnisend) — auto-detectada
--
-- Objetivo: permitir que os endpoints de dashboard agreguem dados das
-- duas plataformas (cada loja usa UMA plataforma), sem quebrar a
-- arquitetura atual. O cron sync-omnisend ja grava em store_revenue_summary;
-- agora tambem grava em omnisend_campaign_metrics/omnisend_flow_metrics
-- para que as visoes de health/insights/hygiene tenham dados granulares.

-- ── 1. Colunas omnisend_* em store_revenue_summary ───────────────────────

ALTER TABLE store_revenue_summary
  ADD COLUMN IF NOT EXISTS omnisend_total_revenue NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omnisend_campaign_revenue NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omnisend_flow_revenue NUMERIC(15,2) DEFAULT 0;

COMMENT ON COLUMN store_revenue_summary.omnisend_total_revenue IS
  'Receita total atribuida ao Omnisend no periodo (em moeda original da loja)';

-- ── 2. Tabela omnisend_campaign_metrics ──────────────────────────────────

CREATE TABLE IF NOT EXISTS omnisend_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),

  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_status TEXT,
  send_time TIMESTAMPTZ,
  subject TEXT,
  channel TEXT DEFAULT 'email',

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_label TEXT,

  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2),

  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2),
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2),
  click_to_open_rate DECIMAL(5,2),

  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2),
  conversion_value DECIMAL(12,2),
  revenue_per_recipient DECIMAL(10,2),
  average_order_value DECIMAL(10,2),

  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2),
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2),
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2),

  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(store_id, campaign_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_omnisend_camp_org_period
  ON omnisend_campaign_metrics(org_id, period_label);
CREATE INDEX IF NOT EXISTS idx_omnisend_camp_store
  ON omnisend_campaign_metrics(store_id, period_label);

ALTER TABLE omnisend_campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omnisend_campaigns_select_org" ON omnisend_campaign_metrics;
CREATE POLICY "omnisend_campaigns_select_org" ON omnisend_campaign_metrics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "omnisend_campaigns_write_service" ON omnisend_campaign_metrics;
CREATE POLICY "omnisend_campaigns_write_service" ON omnisend_campaign_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Tabela omnisend_flow_metrics ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS omnisend_flow_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),

  flow_id TEXT NOT NULL,
  flow_name TEXT,
  flow_status TEXT DEFAULT 'live',
  trigger_type TEXT,

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_label TEXT,

  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2),

  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2),
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2),
  click_to_open_rate DECIMAL(5,2),

  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2),
  conversion_value DECIMAL(12,2),
  revenue_per_recipient DECIMAL(10,2),
  average_order_value DECIMAL(10,2),

  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2),
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2),
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2),

  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(store_id, flow_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_omnisend_flow_org_period
  ON omnisend_flow_metrics(org_id, period_label);
CREATE INDEX IF NOT EXISTS idx_omnisend_flow_store
  ON omnisend_flow_metrics(store_id, period_label);

ALTER TABLE omnisend_flow_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omnisend_flows_select_org" ON omnisend_flow_metrics;
CREATE POLICY "omnisend_flows_select_org" ON omnisend_flow_metrics
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "omnisend_flows_write_service" ON omnisend_flow_metrics;
CREATE POLICY "omnisend_flows_write_service" ON omnisend_flow_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. Coluna email_platform em client_stores (derivada) ────────────────

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS email_platform TEXT
    CHECK (email_platform IN ('klaviyo', 'omnisend', 'none'));

COMMENT ON COLUMN client_stores.email_platform IS
  'Plataforma de email marketing usada: klaviyo | omnisend | none. Auto-detectada na criacao/atualizacao.';

-- Backfill inicial baseado nas credenciais existentes
UPDATE client_stores
SET email_platform = CASE
  WHEN omnisend_api_key IS NOT NULL AND omnisend_api_key != '' THEN 'omnisend'
  WHEN klaviyo_private_key IS NOT NULL AND klaviyo_private_key != '' THEN 'klaviyo'
  WHEN klaviyo_api_key IS NOT NULL AND klaviyo_api_key != '' THEN 'klaviyo'
  ELSE 'none'
END
WHERE email_platform IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_stores_email_platform
  ON client_stores(email_platform) WHERE email_platform != 'none';
