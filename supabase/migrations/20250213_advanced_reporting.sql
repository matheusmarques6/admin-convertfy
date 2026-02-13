-- Migration: Advanced Reporting System
-- Adiciona tabelas para custos de produtos, atribuição de pedidos e métricas detalhadas de flows/campanhas

-- =====================================================
-- 1. TABELA DE CUSTOS DE PRODUTOS
-- =====================================================
CREATE TABLE IF NOT EXISTS product_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Identificação do produto Shopify
  product_id TEXT NOT NULL,
  variant_id TEXT,
  product_name TEXT,
  sku TEXT,

  -- Custos em múltiplas moedas
  cost_brl DECIMAL(10,2),
  cost_usd DECIMAL(10,2),
  cost_eur DECIMAL(10,2),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, product_id, COALESCE(variant_id, ''))
);

-- Índices para product_costs
CREATE INDEX IF NOT EXISTS idx_product_costs_store ON product_costs(store_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_product ON product_costs(product_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_sku ON product_costs(sku);

-- =====================================================
-- 2. TABELA DE CONFIGURAÇÕES DE CUSTO POR LOJA
-- =====================================================
CREATE TABLE IF NOT EXISTS store_cost_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Custo padrão se produto não tiver custo cadastrado
  default_cost_percentage DECIMAL(5,2) DEFAULT 35,

  -- Taxas de gateway de pagamento
  gateway_name TEXT NOT NULL,
  gateway_percentage DECIMAL(5,2) DEFAULT 0,
  gateway_fixed DECIMAL(10,2) DEFAULT 0,
  is_default_gateway BOOLEAN DEFAULT false,

  -- Custos operacionais
  operational_cost_per_order DECIMAL(10,2) DEFAULT 0,
  average_shipping_cost DECIMAL(10,2) DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, gateway_name)
);

-- Índices para store_cost_settings
CREATE INDEX IF NOT EXISTS idx_store_cost_settings_store ON store_cost_settings(store_id);

-- =====================================================
-- 3. TABELA DE ATRIBUIÇÃO DE PEDIDOS
-- =====================================================
CREATE TABLE IF NOT EXISTS order_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Identificação do pedido Shopify
  order_id TEXT NOT NULL,
  order_number TEXT,
  order_date TIMESTAMPTZ,
  order_total DECIMAL(12,2),
  customer_email TEXT,

  -- Fonte de atribuição principal
  attributed_source TEXT,                   -- 'klaviyo', 'facebook', 'google', 'tiktok', 'direct', 'organic'
  attributed_medium TEXT,                   -- 'email', 'cpc', 'social', 'sms', etc

  -- Atribuição Klaviyo específica
  klaviyo_flow_id TEXT,
  klaviyo_flow_name TEXT,
  klaviyo_campaign_id TEXT,
  klaviyo_campaign_name TEXT,
  klaviyo_message_id TEXT,

  -- UTM parameters extraídos
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  -- URLs de origem
  landing_site TEXT,
  referring_site TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, order_id)
);

-- Índices para order_attribution
CREATE INDEX IF NOT EXISTS idx_order_attribution_store ON order_attribution(store_id);
CREATE INDEX IF NOT EXISTS idx_order_attribution_source ON order_attribution(attributed_source);
CREATE INDEX IF NOT EXISTS idx_order_attribution_date ON order_attribution(order_date);
CREATE INDEX IF NOT EXISTS idx_order_attribution_flow ON order_attribution(klaviyo_flow_id);
CREATE INDEX IF NOT EXISTS idx_order_attribution_campaign ON order_attribution(klaviyo_campaign_id);
CREATE INDEX IF NOT EXISTS idx_order_attribution_customer ON order_attribution(customer_email);

-- =====================================================
-- 4. TABELA DE MÉTRICAS DE FLOWS (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS klaviyo_flow_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Identificação do flow
  flow_id TEXT NOT NULL,
  flow_name TEXT,
  flow_status TEXT,                         -- 'live', 'draft', 'manual'
  trigger_type TEXT,

  -- Período da métrica
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Métricas de envio
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2) DEFAULT 0,

  -- Métricas de engajamento
  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  click_to_open_rate DECIMAL(5,2) DEFAULT 0,

  -- Métricas de conversão
  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  conversion_value DECIMAL(12,2) DEFAULT 0,
  revenue_per_recipient DECIMAL(10,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,

  -- Métricas negativas
  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2) DEFAULT 0,

  -- SMS metrics (se aplicável)
  sms_delivered INTEGER DEFAULT 0,
  sms_clicked INTEGER DEFAULT 0,
  sms_conversion_value DECIMAL(12,2) DEFAULT 0,

  -- Metadata
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, flow_id, period_start, period_end)
);

-- Índices para klaviyo_flow_metrics
CREATE INDEX IF NOT EXISTS idx_flow_metrics_store ON klaviyo_flow_metrics(store_id);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_flow ON klaviyo_flow_metrics(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_period ON klaviyo_flow_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_revenue ON klaviyo_flow_metrics(conversion_value DESC);

-- =====================================================
-- 5. TABELA DE MÉTRICAS DE CAMPANHAS (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS klaviyo_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Identificação da campanha
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_status TEXT,                     -- 'sent', 'scheduled', 'draft', 'cancelled'
  send_time TIMESTAMPTZ,
  subject TEXT,
  channel TEXT DEFAULT 'email',             -- 'email', 'sms'

  -- Período da métrica
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Métricas de envio (iguais aos flows)
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2) DEFAULT 0,

  -- Métricas de engajamento
  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  click_to_open_rate DECIMAL(5,2) DEFAULT 0,

  -- Métricas de conversão
  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  conversion_value DECIMAL(12,2) DEFAULT 0,
  revenue_per_recipient DECIMAL(10,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,

  -- Métricas negativas
  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2) DEFAULT 0,

  -- Metadata
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, campaign_id, period_start, period_end)
);

-- Índices para klaviyo_campaign_metrics
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_store ON klaviyo_campaign_metrics(store_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign ON klaviyo_campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_period ON klaviyo_campaign_metrics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_revenue ON klaviyo_campaign_metrics(conversion_value DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_send_time ON klaviyo_campaign_metrics(send_time DESC);

-- =====================================================
-- 6. TABELA DE TOP CUSTOMERS (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS store_top_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Identificação do cliente
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_id TEXT,                         -- Shopify customer_id

  -- Período da análise
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Métricas de compra
  total_orders INTEGER DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,
  first_order_date TIMESTAMPTZ,
  last_order_date TIMESTAMPTZ,

  -- Atribuição Klaviyo
  klaviyo_attributed_orders INTEGER DEFAULT 0,
  klaviyo_attributed_revenue DECIMAL(12,2) DEFAULT 0,
  klaviyo_percentage DECIMAL(5,2) DEFAULT 0,

  -- Lucro estimado (baseado na margem)
  estimated_profit DECIMAL(12,2) DEFAULT 0,
  average_profit_per_order DECIMAL(10,2) DEFAULT 0,

  -- Metadata
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, customer_email, period_start, period_end)
);

-- Índices para store_top_customers
CREATE INDEX IF NOT EXISTS idx_top_customers_store ON store_top_customers(store_id);
CREATE INDEX IF NOT EXISTS idx_top_customers_spent ON store_top_customers(total_spent DESC);
CREATE INDEX IF NOT EXISTS idx_top_customers_klaviyo ON store_top_customers(klaviyo_attributed_revenue DESC);
CREATE INDEX IF NOT EXISTS idx_top_customers_period ON store_top_customers(period_start, period_end);

-- =====================================================
-- 7. TABELA DE RESUMO DE ATRIBUIÇÃO (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS attribution_summary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Período
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Fonte de atribuição
  source TEXT NOT NULL,                     -- 'klaviyo', 'facebook', 'google', 'tiktok', 'direct', 'organic'
  medium TEXT,                              -- 'email', 'sms', 'cpc', 'social', etc

  -- Métricas
  total_orders INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,
  unique_customers INTEGER DEFAULT 0,

  -- Percentual do total
  percentage_of_orders DECIMAL(5,2) DEFAULT 0,
  percentage_of_revenue DECIMAL(5,2) DEFAULT 0,

  -- Metadata
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, source, COALESCE(medium, ''), period_start, period_end)
);

-- Índices para attribution_summary
CREATE INDEX IF NOT EXISTS idx_attribution_summary_store ON attribution_summary(store_id);
CREATE INDEX IF NOT EXISTS idx_attribution_summary_source ON attribution_summary(source);
CREATE INDEX IF NOT EXISTS idx_attribution_summary_revenue ON attribution_summary(total_revenue DESC);

-- =====================================================
-- 8. VIEWS ÚTEIS
-- =====================================================

-- View: Flows ordenados por revenue
CREATE OR REPLACE VIEW v_flows_by_revenue AS
SELECT
  fm.*,
  s.name as store_name,
  c.name as client_name
FROM klaviyo_flow_metrics fm
JOIN stores s ON fm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY fm.conversion_value DESC;

-- View: Campanhas ordenadas por revenue
CREATE OR REPLACE VIEW v_campaigns_by_revenue AS
SELECT
  cm.*,
  s.name as store_name,
  c.name as client_name
FROM klaviyo_campaign_metrics cm
JOIN stores s ON cm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY cm.conversion_value DESC;

-- View: Top customers com atribuição Klaviyo
CREATE OR REPLACE VIEW v_top_customers_klaviyo AS
SELECT
  tc.*,
  s.name as store_name,
  c.name as client_name
FROM store_top_customers tc
JOIN stores s ON tc.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
WHERE tc.klaviyo_attributed_revenue > 0
ORDER BY tc.klaviyo_attributed_revenue DESC;

-- View: Resumo de atribuição por fonte
CREATE OR REPLACE VIEW v_attribution_by_source AS
SELECT
  a.*,
  s.name as store_name,
  c.name as client_name
FROM attribution_summary a
JOIN stores s ON a.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY a.total_revenue DESC;

-- =====================================================
-- 9. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_cost_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_flow_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_top_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE attribution_summary ENABLE ROW LEVEL SECURITY;

-- Policies para product_costs
CREATE POLICY "product_costs_select" ON product_costs
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "product_costs_insert" ON product_costs
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "product_costs_update" ON product_costs
  FOR UPDATE USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "product_costs_delete" ON product_costs
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- Policies para store_cost_settings (mesmo padrão)
CREATE POLICY "store_cost_settings_select" ON store_cost_settings
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "store_cost_settings_all" ON store_cost_settings
  FOR ALL USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- Policies para order_attribution
CREATE POLICY "order_attribution_select" ON order_attribution
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "order_attribution_all" ON order_attribution
  FOR ALL USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- Policies para klaviyo_flow_metrics
CREATE POLICY "flow_metrics_select" ON klaviyo_flow_metrics
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "flow_metrics_all" ON klaviyo_flow_metrics
  FOR ALL USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- Policies para klaviyo_campaign_metrics
CREATE POLICY "campaign_metrics_select" ON klaviyo_campaign_metrics
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "campaign_metrics_all" ON klaviyo_campaign_metrics
  FOR ALL USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- Policies para store_top_customers
CREATE POLICY "top_customers_select" ON store_top_customers
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "top_customers_all" ON store_top_customers
  FOR ALL USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- Policies para attribution_summary
CREATE POLICY "attribution_summary_select" ON attribution_summary
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "attribution_summary_all" ON attribution_summary
  FOR ALL USING (
    store_id IN (
      SELECT id FROM stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- =====================================================
-- 10. TRIGGERS PARA UPDATED_AT
-- =====================================================

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_product_costs_updated_at
  BEFORE UPDATE ON product_costs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_store_cost_settings_updated_at
  BEFORE UPDATE ON store_cost_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 11. DADOS INICIAIS DE GATEWAYS COMUNS
-- =====================================================

-- Comentado: executar manualmente após criar lojas
-- INSERT INTO store_cost_settings (store_id, gateway_name, gateway_percentage, gateway_fixed, is_default_gateway)
-- VALUES
--   ('STORE_ID', 'Shopify Payments', 3.49, 0.00, true),
--   ('STORE_ID', 'PayPal', 4.99, 0.60, false),
--   ('STORE_ID', 'PagSeguro', 3.99, 0.40, false),
--   ('STORE_ID', 'Mercado Pago', 4.99, 0.00, false);

COMMENT ON TABLE product_costs IS 'Custos de produtos para cálculo de margem de lucro';
COMMENT ON TABLE store_cost_settings IS 'Configurações de custos operacionais e taxas de gateway por loja';
COMMENT ON TABLE order_attribution IS 'Atribuição de pedidos a fontes de marketing (Klaviyo, Facebook, etc)';
COMMENT ON TABLE klaviyo_flow_metrics IS 'Cache de métricas de performance de flows do Klaviyo';
COMMENT ON TABLE klaviyo_campaign_metrics IS 'Cache de métricas de performance de campanhas do Klaviyo';
COMMENT ON TABLE store_top_customers IS 'Cache de análise de top customers com atribuição';
COMMENT ON TABLE attribution_summary IS 'Resumo de atribuição de revenue por fonte de marketing';
