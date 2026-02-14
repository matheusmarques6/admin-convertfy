-- =====================================================
-- MIGRATION: Klaviyo Metrics Sync System
-- Sistema de sincronização de métricas do Klaviyo
-- Suporta 100+ lojas com sync em background
-- =====================================================

-- 1. Tabela de campanhas sincronizadas do Klaviyo
CREATE TABLE IF NOT EXISTS klaviyo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  -- Identificadores Klaviyo
  klaviyo_campaign_id VARCHAR(100) NOT NULL,
  klaviyo_message_id VARCHAR(100),

  -- Informações da campanha
  name VARCHAR(500) NOT NULL,
  subject VARCHAR(500),
  channel VARCHAR(50) NOT NULL DEFAULT 'email', -- email, sms
  status VARCHAR(50), -- draft, scheduled, sent, cancelled

  -- Datas
  send_time TIMESTAMPTZ,
  created_at_klaviyo TIMESTAMPTZ,
  updated_at_klaviyo TIMESTAMPTZ,

  -- Tags e categorias (para facilitar busca)
  tags TEXT[], -- ex: ['black_friday', 'promocao', '2024']
  campaign_type VARCHAR(100), -- newsletter, promotional, transactional

  -- Metadados
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraint para evitar duplicatas
  UNIQUE(store_id, klaviyo_campaign_id)
);

-- 2. Tabela de métricas atuais das campanhas
CREATE TABLE IF NOT EXISTS campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES klaviyo_campaigns(id) ON DELETE CASCADE,

  -- Métricas de envio
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2) DEFAULT 0,

  -- Métricas de engajamento
  opened INTEGER DEFAULT 0,
  opened_unique INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,

  clicked INTEGER DEFAULT 0,
  clicked_unique INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  click_to_open_rate DECIMAL(5,2) DEFAULT 0,

  -- Métricas de conversão
  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  revenue DECIMAL(15,2) DEFAULT 0,
  revenue_per_recipient DECIMAL(10,2) DEFAULT 0,
  average_order_value DECIMAL(10,2) DEFAULT 0,

  -- Métricas negativas
  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2) DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2) DEFAULT 0,
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2) DEFAULT 0,

  -- Métricas SMS específicas
  sms_delivered INTEGER DEFAULT 0,
  sms_clicked INTEGER DEFAULT 0,
  sms_conversions INTEGER DEFAULT 0,
  sms_revenue DECIMAL(15,2) DEFAULT 0,
  sms_cost DECIMAL(10,2) DEFAULT 0,

  -- Timestamps
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Uma métrica por campanha
  UNIQUE(campaign_id)
);

-- 3. Tabela de histórico de métricas (snapshots para análise de tendência)
CREATE TABLE IF NOT EXISTS campaign_metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES klaviyo_campaigns(id) ON DELETE CASCADE,

  -- Snapshot das métricas no momento
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2) DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  revenue DECIMAL(15,2) DEFAULT 0,
  bounced INTEGER DEFAULT 0,
  unsubscribed INTEGER DEFAULT 0,

  -- Período do snapshot
  snapshot_date DATE NOT NULL,
  snapshot_hour INTEGER, -- 0-23, para snapshots mais granulares

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Um snapshot por campanha por hora
  UNIQUE(campaign_id, snapshot_date, snapshot_hour)
);

-- 4. Tabela de alertas de campanhas
DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM (
    'performance_drop',      -- Queda de performance
    'performance_spike',     -- Aumento significativo
    'high_bounce_rate',      -- Taxa de bounce alta
    'high_unsubscribe_rate', -- Taxa de unsub alta
    'low_open_rate',         -- Taxa de abertura baixa
    'revenue_milestone',     -- Marco de receita atingido
    'anomaly_detected'       -- Anomalia detectada
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS campaign_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES klaviyo_campaigns(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  -- Tipo e severidade
  alert_type alert_type NOT NULL,
  severity alert_severity NOT NULL DEFAULT 'info',

  -- Detalhes do alerta
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,

  -- Valores para contexto
  metric_name VARCHAR(100),
  previous_value DECIMAL(15,2),
  current_value DECIMAL(15,2),
  change_percentage DECIMAL(5,2),
  threshold_value DECIMAL(15,2),

  -- Status do alerta
  is_read BOOLEAN DEFAULT FALSE,
  is_dismissed BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES profiles(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint para evitar alertas duplicados do mesmo tipo para mesma campanha/métrica
  UNIQUE(campaign_id, alert_type, metric_name)
);

-- 5. Tabela de configurações de sync por loja
CREATE TABLE IF NOT EXISTS klaviyo_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  -- Configurações de sync
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_interval_hours INTEGER DEFAULT 6, -- Intervalo entre syncs
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50), -- success, error, partial
  last_sync_error TEXT,
  last_sync_campaigns_count INTEGER DEFAULT 0,

  -- Configurações de alertas
  alerts_enabled BOOLEAN DEFAULT TRUE,
  alert_open_rate_threshold DECIMAL(5,2) DEFAULT 10, -- Alerta se < 10%
  alert_bounce_rate_threshold DECIMAL(5,2) DEFAULT 5, -- Alerta se > 5%
  alert_unsubscribe_rate_threshold DECIMAL(5,2) DEFAULT 1, -- Alerta se > 1%
  alert_performance_drop_threshold DECIMAL(5,2) DEFAULT 20, -- Alerta se queda > 20%

  -- Filtros de sync
  sync_campaigns_since DATE, -- Só sincroniza campanhas após esta data
  sync_only_sent BOOLEAN DEFAULT TRUE, -- Só sincroniza campanhas enviadas

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id)
);

-- 6. Tabela de jobs de sync (para tracking)
CREATE TABLE IF NOT EXISTS klaviyo_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tipo de job
  job_type VARCHAR(50) NOT NULL, -- full_sync, store_sync, campaign_sync

  -- Escopo
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE, -- NULL = todas as lojas
  campaign_id UUID REFERENCES klaviyo_campaigns(id) ON DELETE CASCADE,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, running, completed, failed

  -- Progresso
  total_stores INTEGER DEFAULT 0,
  processed_stores INTEGER DEFAULT 0,
  total_campaigns INTEGER DEFAULT 0,
  processed_campaigns INTEGER DEFAULT 0,

  -- Resultados
  campaigns_created INTEGER DEFAULT 0,
  campaigns_updated INTEGER DEFAULT 0,
  metrics_synced INTEGER DEFAULT 0,
  alerts_generated INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,

  -- Logs
  error_log JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Quem iniciou
  triggered_by UUID REFERENCES profiles(id),
  trigger_type VARCHAR(50) DEFAULT 'manual' -- manual, cron, webhook
);

-- =====================================================
-- ÍNDICES PARA PERFORMANCE
-- =====================================================

-- Índices para klaviyo_campaigns
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_store ON klaviyo_campaigns(store_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_name ON klaviyo_campaigns(name);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_name_search ON klaviyo_campaigns USING gin(to_tsvector('portuguese', name));
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_send_time ON klaviyo_campaigns(send_time DESC);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_status ON klaviyo_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_channel ON klaviyo_campaigns(channel);
CREATE INDEX IF NOT EXISTS idx_klaviyo_campaigns_klaviyo_id ON klaviyo_campaigns(klaviyo_campaign_id);

-- Índices para campaign_metrics
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_campaign ON campaign_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_revenue ON campaign_metrics(revenue DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_open_rate ON campaign_metrics(open_rate DESC);

-- Índices para campaign_metrics_history
CREATE INDEX IF NOT EXISTS idx_metrics_history_campaign ON campaign_metrics_history(campaign_id);
CREATE INDEX IF NOT EXISTS idx_metrics_history_date ON campaign_metrics_history(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_history_campaign_date ON campaign_metrics_history(campaign_id, snapshot_date DESC);

-- Índices para campaign_alerts
CREATE INDEX IF NOT EXISTS idx_campaign_alerts_store ON campaign_alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_campaign_alerts_campaign ON campaign_alerts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_alerts_unread ON campaign_alerts(store_id, is_read) WHERE NOT is_read;
CREATE INDEX IF NOT EXISTS idx_campaign_alerts_created ON campaign_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_alerts_severity ON campaign_alerts(severity);

-- Índices para sync jobs
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON klaviyo_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_store ON klaviyo_sync_jobs(store_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created ON klaviyo_sync_jobs(created_at DESC);

-- =====================================================
-- FUNÇÕES AUXILIARES
-- =====================================================

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_klaviyo_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at
DROP TRIGGER IF EXISTS trigger_klaviyo_campaigns_updated ON klaviyo_campaigns;
CREATE TRIGGER trigger_klaviyo_campaigns_updated
  BEFORE UPDATE ON klaviyo_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_klaviyo_updated_at();

DROP TRIGGER IF EXISTS trigger_campaign_metrics_updated ON campaign_metrics;
CREATE TRIGGER trigger_campaign_metrics_updated
  BEFORE UPDATE ON campaign_metrics
  FOR EACH ROW EXECUTE FUNCTION update_klaviyo_updated_at();

DROP TRIGGER IF EXISTS trigger_sync_config_updated ON klaviyo_sync_config;
CREATE TRIGGER trigger_sync_config_updated
  BEFORE UPDATE ON klaviyo_sync_config
  FOR EACH ROW EXECUTE FUNCTION update_klaviyo_updated_at();

-- Função para gerar alerta automaticamente quando métricas mudam significativamente
-- SECURITY DEFINER permite que a função bypass RLS para inserir alertas
CREATE OR REPLACE FUNCTION check_campaign_metrics_alerts()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config klaviyo_sync_config%ROWTYPE;
  v_campaign klaviyo_campaigns%ROWTYPE;
  v_change_pct DECIMAL(5,2);
BEGIN
  -- Buscar configuração da loja
  SELECT kc.* INTO v_campaign FROM klaviyo_campaigns kc WHERE kc.id = NEW.campaign_id;
  SELECT sc.* INTO v_config FROM klaviyo_sync_config sc WHERE sc.store_id = v_campaign.store_id;

  -- Se alertas desabilitados, sai
  IF NOT COALESCE(v_config.alerts_enabled, TRUE) THEN
    RETURN NEW;
  END IF;

  -- Verifica taxa de bounce alta
  IF NEW.bounce_rate > COALESCE(v_config.alert_bounce_rate_threshold, 5) THEN
    INSERT INTO campaign_alerts (
      campaign_id, store_id, alert_type, severity, title, message,
      metric_name, current_value, threshold_value
    ) VALUES (
      NEW.campaign_id, v_campaign.store_id, 'high_bounce_rate', 'warning',
      'Taxa de Bounce Alta',
      format('A campanha "%s" tem taxa de bounce de %.1f%%, acima do limite de %.1f%%',
             v_campaign.name, NEW.bounce_rate, COALESCE(v_config.alert_bounce_rate_threshold, 5)),
      'bounce_rate', NEW.bounce_rate, COALESCE(v_config.alert_bounce_rate_threshold, 5)
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Verifica taxa de unsub alta
  IF NEW.unsubscribe_rate > COALESCE(v_config.alert_unsubscribe_rate_threshold, 1) THEN
    INSERT INTO campaign_alerts (
      campaign_id, store_id, alert_type, severity, title, message,
      metric_name, current_value, threshold_value
    ) VALUES (
      NEW.campaign_id, v_campaign.store_id, 'high_unsubscribe_rate', 'warning',
      'Taxa de Descadastro Alta',
      format('A campanha "%s" tem taxa de descadastro de %.2f%%, acima do limite de %.2f%%',
             v_campaign.name, NEW.unsubscribe_rate, COALESCE(v_config.alert_unsubscribe_rate_threshold, 1)),
      'unsubscribe_rate', NEW.unsubscribe_rate, COALESCE(v_config.alert_unsubscribe_rate_threshold, 1)
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Verifica taxa de abertura baixa (só se teve envios significativos)
  IF NEW.recipients > 100 AND NEW.open_rate < COALESCE(v_config.alert_open_rate_threshold, 10) THEN
    INSERT INTO campaign_alerts (
      campaign_id, store_id, alert_type, severity, title, message,
      metric_name, current_value, threshold_value
    ) VALUES (
      NEW.campaign_id, v_campaign.store_id, 'low_open_rate', 'info',
      'Taxa de Abertura Baixa',
      format('A campanha "%s" tem taxa de abertura de %.1f%%, abaixo do esperado de %.1f%%',
             v_campaign.name, NEW.open_rate, COALESCE(v_config.alert_open_rate_threshold, 10)),
      'open_rate', NEW.open_rate, COALESCE(v_config.alert_open_rate_threshold, 10)
    ) ON CONFLICT DO NOTHING;
  END IF;

  -- Verifica queda de performance comparando com métricas anteriores
  IF OLD IS NOT NULL AND OLD.open_rate > 0 THEN
    v_change_pct := ((NEW.open_rate - OLD.open_rate) / OLD.open_rate) * 100;

    IF v_change_pct < -COALESCE(v_config.alert_performance_drop_threshold, 20) THEN
      INSERT INTO campaign_alerts (
        campaign_id, store_id, alert_type, severity, title, message,
        metric_name, previous_value, current_value, change_percentage
      ) VALUES (
        NEW.campaign_id, v_campaign.store_id, 'performance_drop', 'critical',
        'Queda de Performance',
        format('A campanha "%s" teve queda de %.1f%% na taxa de abertura',
               v_campaign.name, ABS(v_change_pct)),
        'open_rate', OLD.open_rate, NEW.open_rate, v_change_pct
      ) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Marco de receita (a cada R$ 10.000)
  IF NEW.revenue >= 10000 AND (OLD IS NULL OR OLD.revenue < 10000) THEN
    INSERT INTO campaign_alerts (
      campaign_id, store_id, alert_type, severity, title, message,
      metric_name, current_value
    ) VALUES (
      NEW.campaign_id, v_campaign.store_id, 'revenue_milestone', 'info',
      'Marco de Receita Atingido',
      format('A campanha "%s" atingiu R$ %.2f em receita!', v_campaign.name, NEW.revenue),
      'revenue', NEW.revenue
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para verificar alertas
DROP TRIGGER IF EXISTS trigger_check_metrics_alerts ON campaign_metrics;
CREATE TRIGGER trigger_check_metrics_alerts
  AFTER INSERT OR UPDATE ON campaign_metrics
  FOR EACH ROW EXECUTE FUNCTION check_campaign_metrics_alerts();

-- Função para criar snapshot automático de métricas
-- SECURITY DEFINER permite que a função bypass RLS para inserir histórico
CREATE OR REPLACE FUNCTION create_metrics_snapshot()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO campaign_metrics_history (
    campaign_id, snapshot_date, snapshot_hour,
    recipients, delivered, opened, open_rate,
    clicked, click_rate, conversions, conversion_rate,
    revenue, bounced, unsubscribed
  ) VALUES (
    NEW.campaign_id, CURRENT_DATE, EXTRACT(HOUR FROM NOW())::INTEGER,
    NEW.recipients, NEW.delivered, NEW.opened, NEW.open_rate,
    NEW.clicked, NEW.click_rate, NEW.conversions, NEW.conversion_rate,
    NEW.revenue, NEW.bounced, NEW.unsubscribed
  ) ON CONFLICT (campaign_id, snapshot_date, snapshot_hour)
  DO UPDATE SET
    recipients = EXCLUDED.recipients,
    delivered = EXCLUDED.delivered,
    opened = EXCLUDED.opened,
    open_rate = EXCLUDED.open_rate,
    clicked = EXCLUDED.clicked,
    click_rate = EXCLUDED.click_rate,
    conversions = EXCLUDED.conversions,
    conversion_rate = EXCLUDED.conversion_rate,
    revenue = EXCLUDED.revenue,
    bounced = EXCLUDED.bounced,
    unsubscribed = EXCLUDED.unsubscribed;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para criar snapshots
DROP TRIGGER IF EXISTS trigger_create_metrics_snapshot ON campaign_metrics;
CREATE TRIGGER trigger_create_metrics_snapshot
  AFTER INSERT OR UPDATE ON campaign_metrics
  FOR EACH ROW EXECUTE FUNCTION create_metrics_snapshot();

-- =====================================================
-- VIEWS PARA CONSULTAS COMUNS
-- =====================================================

-- View de campanhas com métricas (para listagem)
CREATE OR REPLACE VIEW v_campaigns_with_metrics AS
SELECT
  kc.id,
  kc.store_id,
  kc.klaviyo_campaign_id,
  kc.name,
  kc.subject,
  kc.channel,
  kc.status,
  kc.send_time,
  kc.tags,
  kc.campaign_type,
  kc.synced_at,
  cs.store_name,
  c.name as client_name,
  cm.recipients,
  cm.delivered,
  cm.delivery_rate,
  cm.opened,
  cm.open_rate,
  cm.clicked,
  cm.click_rate,
  cm.conversions,
  cm.conversion_rate,
  cm.revenue,
  cm.revenue_per_recipient,
  cm.bounced,
  cm.bounce_rate,
  cm.unsubscribed,
  cm.unsubscribe_rate
FROM klaviyo_campaigns kc
LEFT JOIN campaign_metrics cm ON cm.campaign_id = kc.id
LEFT JOIN client_stores cs ON cs.id = kc.store_id
LEFT JOIN clients c ON c.id = cs.client_id;

-- View de rankings por receita
CREATE OR REPLACE VIEW v_campaign_rankings_revenue AS
SELECT
  kc.id,
  kc.name,
  kc.send_time,
  kc.channel,
  cs.store_name,
  c.name as client_name,
  cm.revenue,
  cm.conversions,
  cm.recipients,
  cm.open_rate,
  cm.click_rate,
  cm.conversion_rate,
  RANK() OVER (ORDER BY cm.revenue DESC) as revenue_rank,
  RANK() OVER (PARTITION BY kc.store_id ORDER BY cm.revenue DESC) as store_revenue_rank
FROM klaviyo_campaigns kc
JOIN campaign_metrics cm ON cm.campaign_id = kc.id
LEFT JOIN client_stores cs ON cs.id = kc.store_id
LEFT JOIN clients c ON c.id = cs.client_id
WHERE LOWER(kc.status) = 'sent' AND cm.revenue > 0;

-- View de alertas não lidos
CREATE OR REPLACE VIEW v_unread_alerts AS
SELECT
  ca.*,
  kc.name as campaign_name,
  cs.store_name,
  c.name as client_name
FROM campaign_alerts ca
JOIN klaviyo_campaigns kc ON kc.id = ca.campaign_id
LEFT JOIN client_stores cs ON cs.id = ca.store_id
LEFT JOIN clients c ON c.id = cs.client_id
WHERE NOT ca.is_read AND NOT ca.is_dismissed
ORDER BY
  CASE ca.severity
    WHEN 'critical' THEN 1
    WHEN 'warning' THEN 2
    ELSE 3
  END,
  ca.created_at DESC;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE klaviyo_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_metrics_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_sync_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE klaviyo_sync_jobs ENABLE ROW LEVEL SECURITY;

-- Policies para klaviyo_campaigns
DROP POLICY IF EXISTS "klaviyo_campaigns_select" ON klaviyo_campaigns;
CREATE POLICY "klaviyo_campaigns_select" ON klaviyo_campaigns
  FOR SELECT USING (
    -- Admin vê tudo
    is_admin(auth.uid())
    OR
    -- Usuário tem acesso à loja
    has_store_access(auth.uid(), store_id)
  );

DROP POLICY IF EXISTS "klaviyo_campaigns_insert" ON klaviyo_campaigns;
CREATE POLICY "klaviyo_campaigns_insert" ON klaviyo_campaigns
  FOR INSERT WITH CHECK (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

DROP POLICY IF EXISTS "klaviyo_campaigns_update" ON klaviyo_campaigns;
CREATE POLICY "klaviyo_campaigns_update" ON klaviyo_campaigns
  FOR UPDATE USING (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

DROP POLICY IF EXISTS "klaviyo_campaigns_delete" ON klaviyo_campaigns;
CREATE POLICY "klaviyo_campaigns_delete" ON klaviyo_campaigns
  FOR DELETE USING (is_admin(auth.uid()));

-- Policies para campaign_metrics (herda acesso da campanha)
DROP POLICY IF EXISTS "campaign_metrics_select" ON campaign_metrics;
CREATE POLICY "campaign_metrics_select" ON campaign_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_id
      AND (is_admin(auth.uid()) OR has_store_access(auth.uid(), kc.store_id))
    )
  );

DROP POLICY IF EXISTS "campaign_metrics_all" ON campaign_metrics;
CREATE POLICY "campaign_metrics_all" ON campaign_metrics
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_id
      AND (is_admin(auth.uid()) OR has_store_access(auth.uid(), kc.store_id))
    )
  );

-- Policies para campaign_metrics_history
DROP POLICY IF EXISTS "campaign_metrics_history_select" ON campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_select" ON campaign_metrics_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_id
      AND (is_admin(auth.uid()) OR has_store_access(auth.uid(), kc.store_id))
    )
  );

DROP POLICY IF EXISTS "campaign_metrics_history_all" ON campaign_metrics_history;
CREATE POLICY "campaign_metrics_history_all" ON campaign_metrics_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM klaviyo_campaigns kc
      WHERE kc.id = campaign_id
      AND (is_admin(auth.uid()) OR has_store_access(auth.uid(), kc.store_id))
    )
  );

-- Policies para campaign_alerts
DROP POLICY IF EXISTS "campaign_alerts_select" ON campaign_alerts;
CREATE POLICY "campaign_alerts_select" ON campaign_alerts
  FOR SELECT USING (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

DROP POLICY IF EXISTS "campaign_alerts_insert" ON campaign_alerts;
CREATE POLICY "campaign_alerts_insert" ON campaign_alerts
  FOR INSERT WITH CHECK (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

DROP POLICY IF EXISTS "campaign_alerts_update" ON campaign_alerts;
CREATE POLICY "campaign_alerts_update" ON campaign_alerts
  FOR UPDATE USING (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

DROP POLICY IF EXISTS "campaign_alerts_delete" ON campaign_alerts;
CREATE POLICY "campaign_alerts_delete" ON campaign_alerts
  FOR DELETE USING (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

-- Policies para klaviyo_sync_config
DROP POLICY IF EXISTS "sync_config_select" ON klaviyo_sync_config;
CREATE POLICY "sync_config_select" ON klaviyo_sync_config
  FOR SELECT USING (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

DROP POLICY IF EXISTS "sync_config_all" ON klaviyo_sync_config;
CREATE POLICY "sync_config_all" ON klaviyo_sync_config
  FOR ALL USING (
    is_admin(auth.uid()) OR has_store_access(auth.uid(), store_id)
  );

-- Policies para sync jobs (só admin pode gerenciar)
DROP POLICY IF EXISTS "sync_jobs_select" ON klaviyo_sync_jobs;
CREATE POLICY "sync_jobs_select" ON klaviyo_sync_jobs
  FOR SELECT USING (
    is_admin(auth.uid())
    OR (store_id IS NOT NULL AND has_store_access(auth.uid(), store_id))
  );

DROP POLICY IF EXISTS "sync_jobs_insert" ON klaviyo_sync_jobs;
CREATE POLICY "sync_jobs_insert" ON klaviyo_sync_jobs
  FOR INSERT WITH CHECK (
    is_admin(auth.uid())
    OR (store_id IS NOT NULL AND has_store_access(auth.uid(), store_id))
  );

DROP POLICY IF EXISTS "sync_jobs_update" ON klaviyo_sync_jobs;
CREATE POLICY "sync_jobs_update" ON klaviyo_sync_jobs
  FOR UPDATE USING (is_admin(auth.uid()));

-- =====================================================
-- DONE! Schema para métricas Klaviyo criado com sucesso.
-- =====================================================
