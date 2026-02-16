-- =====================================================
-- PIPELINE FILE 10: ADVANCED REPORTING SYSTEM
-- =====================================================
-- Creates: product_costs, store_cost_settings, order_attribution,
--          klaviyo_flow_metrics, klaviyo_campaign_metrics,
--          store_top_customers, attribution_summary tables
-- Creates: v_flows_by_revenue, v_campaigns_by_revenue,
--          v_top_customers_klaviyo, v_attribution_by_source views
-- Creates: All RLS policies, triggers, comments
-- CORRECTED: All references use client_stores (not stores)
-- =====================================================

BEGIN;

-- =====================================================
-- 1. TABELA DE CUSTOS DE PRODUTOS
-- =====================================================
CREATE TABLE IF NOT EXISTS product_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  product_id TEXT NOT NULL,
  variant_id TEXT,
  product_name TEXT,
  sku TEXT,

  cost_brl DECIMAL(10,2),
  cost_usd DECIMAL(10,2),
  cost_eur DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index com COALESCE (não pode ser inline UNIQUE constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_costs_unique
  ON product_costs(store_id, product_id, COALESCE(variant_id, ''));

CREATE INDEX IF NOT EXISTS idx_product_costs_store ON product_costs(store_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_product ON product_costs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_sku ON product_costs(sku);

-- =====================================================
-- 2. TABELA DE CONFIGURACOES DE CUSTO POR LOJA
-- =====================================================
CREATE TABLE IF NOT EXISTS store_cost_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  default_cost_percentage DECIMAL(5,2) DEFAULT 35,

  gateway_name TEXT NOT NULL,
  gateway_percentage DECIMAL(5,2) DEFAULT 0,
  gateway_fixed DECIMAL(10,2) DEFAULT 0,
  is_default_gateway BOOLEAN DEFAULT false,

  operational_cost_per_order DECIMAL(10,2) DEFAULT 0,
  average_shipping_cost DECIMAL(10,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, gateway_name)
);

CREATE INDEX IF NOT EXISTS idx_store_cost_settings_store ON store_cost_settings(store_id);

-- =====================================================
-- 3. TABELA DE ATRIBUICAO DE PEDIDOS
-- =====================================================
CREATE TABLE IF NOT EXISTS order_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  order_id TEXT NOT NULL,
  order_number TEXT,
  order_date TIMESTAMPTZ,
  order_total DECIMAL(12,2),
  customer_email TEXT,

  attributed_source TEXT,
  attributed_medium TEXT,

  klaviyo_flow_id TEXT,
  klaviyo_flow_name TEXT,
  klaviyo_campaign_id TEXT,
  klaviyo_campaign_name TEXT,
  klaviyo_message_id TEXT,

  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  landing_site TEXT,
  referring_site TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_order_attribution_store ON order_attribution(store_id);
CREATE INDEX IF NOT EXISTS idx_order_attribution_source ON order_attribution(attributed_source);
CREATE INDEX IF NOT EXISTS idx_order_attribution_date ON order_attribution(order_date);
CREATE INDEX IF NOT EXISTS idx_order_attribution_flow ON order_attribution(klaviyo_flow_id);
CREATE INDEX IF NOT EXISTS idx_order_attribution_campaign ON order_attribution(klaviyo_campaign_id);
CREATE INDEX IF NOT EXISTS idx_order_attribution_customer ON order_attribution(customer_email);

-- =====================================================
-- 4. TABELA DE METRICAS DE FLOWS (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS klaviyo_flow_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  flow_id TEXT NOT NULL,
  flow_name TEXT,
  flow_status TEXT,
  trigger_type TEXT,

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2) DEFAULT 0,

  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  click_to_open_rate DECIMAL(5,2) DEFAULT 0,

  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  conversion_value DECIMAL(12,2) DEFAULT 0,
  revenue_per_recipient DECIMAL(10,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,

  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2) DEFAULT 0,

  sms_delivered INTEGER DEFAULT 0,
  sms_clicked INTEGER DEFAULT 0,
  sms_conversion_value DECIMAL(12,2) DEFAULT 0,

  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, flow_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_flow_metrics_store ON klaviyo_flow_metrics(store_id);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_flow ON klaviyo_flow_metrics(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_period ON klaviyo_flow_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_revenue ON klaviyo_flow_metrics(conversion_value DESC);

-- =====================================================
-- 5. TABELA DE METRICAS DE CAMPANHAS (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS klaviyo_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_status TEXT,
  send_time TIMESTAMPTZ,
  subject TEXT,
  channel TEXT DEFAULT 'email',

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2) DEFAULT 0,

  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  click_to_open_rate DECIMAL(5,2) DEFAULT 0,

  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  conversion_value DECIMAL(12,2) DEFAULT 0,
  revenue_per_recipient DECIMAL(10,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,

  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2) DEFAULT 0,

  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, campaign_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_adv_store ON klaviyo_campaign_metrics(store_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_adv_campaign ON klaviyo_campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_adv_period ON klaviyo_campaign_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_adv_revenue ON klaviyo_campaign_metrics(conversion_value DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_adv_send_time ON klaviyo_campaign_metrics(send_time DESC);

-- =====================================================
-- 6. TABELA DE TOP CUSTOMERS (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS store_top_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_id TEXT,

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,
  first_order_date TIMESTAMPTZ,
  last_order_date TIMESTAMPTZ,

  klaviyo_attributed_orders INTEGER DEFAULT 0,
  klaviyo_attributed_revenue DECIMAL(12,2) DEFAULT 0,
  klaviyo_percentage DECIMAL(5,2) DEFAULT 0,

  estimated_profit DECIMAL(12,2) DEFAULT 0,
  average_profit_per_order DECIMAL(10,2) DEFAULT 0,

  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, customer_email, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_top_customers_store ON store_top_customers(store_id);
CREATE INDEX IF NOT EXISTS idx_top_customers_spent ON store_top_customers(total_spent DESC);
CREATE INDEX IF NOT EXISTS idx_top_customers_klaviyo ON store_top_customers(klaviyo_attributed_revenue DESC);
CREATE INDEX IF NOT EXISTS idx_top_customers_period ON store_top_customers(period_start, period_end);

-- =====================================================
-- 7. TABELA DE RESUMO DE ATRIBUICAO (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS attribution_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  source TEXT NOT NULL,
  medium TEXT,

  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,
  unique_customers INTEGER DEFAULT 0,

  percentage_of_orders DECIMAL(5,2) DEFAULT 0,
  percentage_of_revenue DECIMAL(5,2) DEFAULT 0,

  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index com COALESCE (não pode ser inline UNIQUE constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_attribution_summary_unique
  ON attribution_summary(store_id, source, COALESCE(medium, ''), period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_attribution_summary_store ON attribution_summary(store_id);
CREATE INDEX IF NOT EXISTS idx_attribution_summary_source ON attribution_summary(source);
CREATE INDEX IF NOT EXISTS idx_attribution_summary_revenue ON attribution_summary(total_revenue DESC);

-- =====================================================
-- 8. VIEWS UTEIS (using client_stores, not stores)
-- =====================================================

-- View: Flows ordenados por revenue
CREATE OR REPLACE VIEW v_flows_by_revenue AS
SELECT
  fm.*,
  s.store_name,
  c.name as client_name
FROM klaviyo_flow_metrics fm
JOIN client_stores s ON fm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY fm.conversion_value DESC;

-- View: Campanhas ordenadas por revenue
CREATE OR REPLACE VIEW v_campaigns_by_revenue AS
SELECT
  cm.*,
  s.store_name,
  c.name as client_name
FROM klaviyo_campaign_metrics cm
JOIN client_stores s ON cm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY cm.conversion_value DESC;

-- View: Top customers com atribuicao Klaviyo
CREATE OR REPLACE VIEW v_top_customers_klaviyo AS
SELECT
  tc.*,
  s.store_name,
  c.name as client_name
FROM store_top_customers tc
JOIN client_stores s ON tc.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
WHERE tc.klaviyo_attributed_revenue > 0
ORDER BY tc.klaviyo_attributed_revenue DESC;

-- View: Resumo de atribuicao por fonte
CREATE OR REPLACE VIEW v_attribution_by_source AS
SELECT
  a.*,
  s.store_name,
  c.name as client_name
FROM attribution_summary a
JOIN client_stores s ON a.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY a.total_revenue DESC;

-- =====================================================
-- 9. RLS POLICIES (using client_stores, not stores)
-- =====================================================

ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_cost_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_flow_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_top_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribution_summary ENABLE ROW LEVEL SECURITY;

-- Policies para product_costs
DROP POLICY IF EXISTS "product_costs_select" ON product_costs;
CREATE POLICY "product_costs_select" ON product_costs
  FOR SELECT USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "product_costs_insert" ON product_costs;
CREATE POLICY "product_costs_insert" ON product_costs
  FOR INSERT WITH CHECK (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "product_costs_update" ON product_costs;
CREATE POLICY "product_costs_update" ON product_costs
  FOR UPDATE USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "product_costs_delete" ON product_costs;
CREATE POLICY "product_costs_delete" ON product_costs
  FOR DELETE USING (
    can_access_store(store_id)
  );

-- Policies para store_cost_settings
DROP POLICY IF EXISTS "store_cost_settings_select" ON store_cost_settings;
CREATE POLICY "store_cost_settings_select" ON store_cost_settings
  FOR SELECT USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "store_cost_settings_all" ON store_cost_settings;
CREATE POLICY "store_cost_settings_all" ON store_cost_settings
  FOR ALL USING (
    can_access_store(store_id)
  );

-- Policies para order_attribution
DROP POLICY IF EXISTS "order_attribution_select" ON order_attribution;
CREATE POLICY "order_attribution_select" ON order_attribution
  FOR SELECT USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "order_attribution_all" ON order_attribution;
CREATE POLICY "order_attribution_all" ON order_attribution
  FOR ALL USING (
    can_access_store(store_id)
  );

-- Policies para klaviyo_flow_metrics
DROP POLICY IF EXISTS "flow_metrics_select" ON klaviyo_flow_metrics;
CREATE POLICY "flow_metrics_select" ON klaviyo_flow_metrics
  FOR SELECT USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "flow_metrics_all" ON klaviyo_flow_metrics;
CREATE POLICY "flow_metrics_all" ON klaviyo_flow_metrics
  FOR ALL USING (
    can_access_store(store_id)
  );

-- Policies para klaviyo_campaign_metrics
DROP POLICY IF EXISTS "campaign_metrics_select" ON klaviyo_campaign_metrics;
CREATE POLICY "campaign_metrics_select" ON klaviyo_campaign_metrics
  FOR SELECT USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "campaign_metrics_all" ON klaviyo_campaign_metrics;
CREATE POLICY "campaign_metrics_all" ON klaviyo_campaign_metrics
  FOR ALL USING (
    can_access_store(store_id)
  );

-- Policies para store_top_customers
DROP POLICY IF EXISTS "top_customers_select" ON store_top_customers;
CREATE POLICY "top_customers_select" ON store_top_customers
  FOR SELECT USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "top_customers_all" ON store_top_customers;
CREATE POLICY "top_customers_all" ON store_top_customers
  FOR ALL USING (
    can_access_store(store_id)
  );

-- Policies para attribution_summary
DROP POLICY IF EXISTS "attribution_summary_select" ON attribution_summary;
CREATE POLICY "attribution_summary_select" ON attribution_summary
  FOR SELECT USING (
    can_access_store(store_id)
  );

DROP POLICY IF EXISTS "attribution_summary_all" ON attribution_summary;
CREATE POLICY "attribution_summary_all" ON attribution_summary
  FOR ALL USING (
    can_access_store(store_id)
  );

-- Service role full access for all advanced reporting tables
DROP POLICY IF EXISTS "Service role product_costs" ON product_costs;
CREATE POLICY "Service role product_costs" ON product_costs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role store_cost_settings" ON store_cost_settings;
CREATE POLICY "Service role store_cost_settings" ON store_cost_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role order_attribution" ON order_attribution;
CREATE POLICY "Service role order_attribution" ON order_attribution FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role klaviyo_flow_metrics" ON klaviyo_flow_metrics;
CREATE POLICY "Service role klaviyo_flow_metrics" ON klaviyo_flow_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role klaviyo_campaign_metrics" ON klaviyo_campaign_metrics;
CREATE POLICY "Service role klaviyo_campaign_metrics" ON klaviyo_campaign_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role store_top_customers" ON store_top_customers;
CREATE POLICY "Service role store_top_customers" ON store_top_customers FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role attribution_summary" ON attribution_summary;
CREATE POLICY "Service role attribution_summary" ON attribution_summary FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================
-- 10. TRIGGERS PARA UPDATED_AT
-- =====================================================

DROP TRIGGER IF EXISTS update_product_costs_updated_at ON product_costs;
CREATE TRIGGER update_product_costs_updated_at
  BEFORE UPDATE ON product_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_store_cost_settings_updated_at ON store_cost_settings;
CREATE TRIGGER update_store_cost_settings_updated_at
  BEFORE UPDATE ON store_cost_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 11. COMMENTS
-- =====================================================

COMMENT ON TABLE product_costs IS 'Custos de produtos para calculo de margem de lucro';
COMMENT ON TABLE store_cost_settings IS 'Configuracoes de custos operacionais e taxas de gateway por loja';
COMMENT ON TABLE order_attribution IS 'Atribuicao de pedidos a fontes de marketing (Klaviyo, Facebook, etc)';
COMMENT ON TABLE klaviyo_flow_metrics IS 'Cache de metricas de performance de flows do Klaviyo';
COMMENT ON TABLE klaviyo_campaign_metrics IS 'Cache de metricas de performance de campanhas do Klaviyo';
COMMENT ON TABLE store_top_customers IS 'Cache de analise de top customers com atribuicao';
COMMENT ON TABLE attribution_summary IS 'Resumo de atribuicao de revenue por fonte de marketing';

COMMIT;

-- =====================================================
-- 10_advanced_reporting.sql DONE
-- =====================================================
