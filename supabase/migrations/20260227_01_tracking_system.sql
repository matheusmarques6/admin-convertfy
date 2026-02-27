-- =============================================
-- TRACKING SYSTEM - Story 4.1
-- =============================================
-- 1. Table: order_tracking_cache (cache de pedidos 30 dias)
-- 2. Table: tracking_config (configuração de rastreio por loja)
-- 3. Indexes para performance
-- 4. Triggers de updated_at
-- 5. RLS policies
-- 6. Cleanup function para expiração automática

-- =============================================
-- 1. TABLE: order_tracking_cache
-- =============================================
-- Cache de pedidos para lookup por email/tracking code
-- Retenção de 30 dias, populado via sync Shopify/Klaviyo

CREATE TABLE IF NOT EXISTS order_tracking_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  -- Dados do pedido
  order_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT,

  -- Dados de rastreio
  tracking_code TEXT,
  tracking_carrier TEXT,
  fulfillment_status TEXT,

  -- Itens (resumo)
  line_items JSONB DEFAULT '[]',
  total_price NUMERIC(10,2),
  currency TEXT DEFAULT 'BRL',

  -- Datas
  order_created_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,

  -- Meta
  source TEXT NOT NULL DEFAULT 'shopify'
    CHECK (source IN ('shopify', 'klaviyo', 'manual')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(store_id, order_id)
);

-- =============================================
-- 2. TABLE: tracking_config
-- =============================================
-- Configuração de rastreio por loja (17Track API key, widget config)

CREATE TABLE IF NOT EXISTS tracking_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,

  -- 17Track API
  seventeen_track_api_key TEXT,

  -- Customização do widget
  widget_config JSONB DEFAULT '{
    "primary_color": "#000000",
    "logo_url": null,
    "custom_css": null,
    "show_carrier_logo": true,
    "language": "pt-BR",
    "placeholder_tracking": "Digite seu código de rastreio",
    "placeholder_email": "Digite seu email"
  }',

  -- Controle
  enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(store_id)
);

-- =============================================
-- 3. INDEXES
-- =============================================

CREATE INDEX IF NOT EXISTS idx_otc_email ON order_tracking_cache(lower(customer_email), store_id);
CREATE INDEX IF NOT EXISTS idx_otc_tracking ON order_tracking_cache(tracking_code, store_id);
CREATE INDEX IF NOT EXISTS idx_otc_expires ON order_tracking_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_otc_org_id ON order_tracking_cache(org_id);
CREATE INDEX IF NOT EXISTS idx_otc_store_id ON order_tracking_cache(store_id);

CREATE INDEX IF NOT EXISTS idx_tc_org_id ON tracking_config(org_id);
CREATE INDEX IF NOT EXISTS idx_tc_store_id ON tracking_config(store_id);

-- =============================================
-- 4. TRIGGERS: updated_at
-- =============================================

CREATE OR REPLACE FUNCTION update_order_tracking_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_tracking_cache_updated_at ON order_tracking_cache;
CREATE TRIGGER trg_order_tracking_cache_updated_at
  BEFORE UPDATE ON order_tracking_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_order_tracking_cache_updated_at();

CREATE OR REPLACE FUNCTION update_tracking_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tracking_config_updated_at ON tracking_config;
CREATE TRIGGER trg_tracking_config_updated_at
  BEFORE UPDATE ON tracking_config
  FOR EACH ROW
  EXECUTE FUNCTION update_tracking_config_updated_at();

-- =============================================
-- 5. RLS POLICIES
-- =============================================

-- ---------- order_tracking_cache ----------
ALTER TABLE order_tracking_cache ENABLE ROW LEVEL SECURITY;

-- Admin bypass
CREATE POLICY "otc_admin_all"
  ON order_tracking_cache FOR ALL
  TO authenticated
  USING (is_admin());

-- NOTE: Sem policy anon — rotas públicas usam service_role (createAdminClient)
-- que bypassa RLS automaticamente. Expor SELECT anon seria data leak.

-- SELECT: membros da org podem ver pedidos de suas lojas
CREATE POLICY "otc_select_authenticated"
  ON order_tracking_cache FOR SELECT
  TO authenticated
  USING (
    can_access_store(store_id)
  );

-- INSERT/UPDATE/DELETE: somente via service_role (sync jobs, API routes internas)
-- Não precisa de policy explícita — service_role bypassa RLS automaticamente

-- ---------- tracking_config ----------
ALTER TABLE tracking_config ENABLE ROW LEVEL SECURITY;

-- Admin bypass
CREATE POLICY "tc_admin_all"
  ON tracking_config FOR ALL
  TO authenticated
  USING (is_admin());

-- SELECT: membros da org com acesso à loja
CREATE POLICY "tc_select"
  ON tracking_config FOR SELECT
  TO authenticated
  USING (
    can_access_store(store_id)
  );

-- NOTE: Sem policy anon — widget busca config via service_role.
-- Policy anon exporia seventeen_track_api_key desnecessariamente.

-- UPDATE: owner/manager ou quem tem feature de config
CREATE POLICY "tc_update"
  ON tracking_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = tracking_config.org_id
        AND om.is_active = true
        AND om.role IN ('owner', 'manager')
    )
  );

-- INSERT: owner/manager
CREATE POLICY "tc_insert"
  ON tracking_config FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = tracking_config.org_id
        AND om.is_active = true
        AND om.role IN ('owner', 'manager')
    )
  );

-- =============================================
-- 6. CLEANUP FUNCTION: Expiração automática
-- =============================================
-- Deleta registros expirados de order_tracking_cache
-- Executar via pg_cron, Supabase Edge Function, ou manualmente

CREATE OR REPLACE FUNCTION cleanup_expired_tracking_cache()
RETURNS TABLE(deleted_count BIGINT) AS $$
DECLARE
  v_count BIGINT;
BEGIN
  DELETE FROM order_tracking_cache
  WHERE expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE order_tracking_cache IS 'Cache de pedidos para rastreio público. Retenção 30 dias. Story 4.1.';
COMMENT ON TABLE tracking_config IS 'Configuração de rastreio por loja (17Track API, widget). Story 4.1.';
COMMENT ON FUNCTION cleanup_expired_tracking_cache() IS 'Remove registros expirados do cache de rastreio. Executar diariamente. Story 4.1.3.';
