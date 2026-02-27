-- =====================================================
-- MIGRATION: Módulo de Rastreamento de Pedidos
-- Tabelas: tracking_stores, tracking_orders, tracking_codes, tracking_lookups
-- =====================================================

BEGIN;

-- =====================================================
-- 1. tracking_stores
-- Configuração de cada loja para rastreamento
-- Vinculada à client_stores existente
-- =====================================================

CREATE TABLE IF NOT EXISTS tracking_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  shop_domain TEXT,
  shop_name TEXT,
  shopify_access_token TEXT,
  webhook_secret TEXT,
  seventeen_track_api_key TEXT,
  is_active BOOLEAN DEFAULT true,
  widget_config JSONB DEFAULT '{
    "primaryColor": "#3b82f6",
    "language": "pt-BR",
    "position": "bottom-right"
  }'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_stores_client_store
  ON tracking_stores(client_store_id);
CREATE INDEX IF NOT EXISTS idx_tracking_stores_org
  ON tracking_stores(org_id);
CREATE INDEX IF NOT EXISTS idx_tracking_stores_domain
  ON tracking_stores(shop_domain);

-- =====================================================
-- 2. tracking_orders
-- Pedidos importados do Shopify para rastreamento
-- =====================================================

CREATE TABLE IF NOT EXISTS tracking_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_store_id UUID NOT NULL REFERENCES tracking_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  shopify_order_id TEXT,
  shopify_order_number TEXT,
  order_name TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  financial_status TEXT,
  fulfillment_status TEXT,
  total_price DECIMAL(12,2),
  currency TEXT DEFAULT 'BRL',
  order_created_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_orders_store
  ON tracking_orders(tracking_store_id);
CREATE INDEX IF NOT EXISTS idx_tracking_orders_shopify_id
  ON tracking_orders(shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_orders_order_number
  ON tracking_orders(shopify_order_number);
CREATE INDEX IF NOT EXISTS idx_tracking_orders_customer_email
  ON tracking_orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_tracking_orders_org
  ON tracking_orders(org_id);

-- =====================================================
-- 3. tracking_codes
-- Códigos de rastreio vinculados a pedidos
-- =====================================================

CREATE TABLE IF NOT EXISTS tracking_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_order_id UUID NOT NULL REFERENCES tracking_orders(id) ON DELETE CASCADE,
  tracking_store_id UUID NOT NULL REFERENCES tracking_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  tracking_number TEXT NOT NULL,
  carrier_code TEXT,
  carrier_name TEXT,
  status TEXT DEFAULT 'pending',
  status_detail TEXT,
  last_event TEXT,
  last_event_at TIMESTAMPTZ,
  estimated_delivery TIMESTAMPTZ,
  tracking_events JSONB DEFAULT '[]'::jsonb,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_codes_order
  ON tracking_codes(tracking_order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_codes_store
  ON tracking_codes(tracking_store_id);
CREATE INDEX IF NOT EXISTS idx_tracking_codes_number
  ON tracking_codes(tracking_number);
CREATE INDEX IF NOT EXISTS idx_tracking_codes_status
  ON tracking_codes(status);
CREATE INDEX IF NOT EXISTS idx_tracking_codes_org
  ON tracking_codes(org_id);

-- =====================================================
-- 4. tracking_lookups
-- Log de buscas de rastreamento (público e widget)
-- =====================================================

CREATE TABLE IF NOT EXISTS tracking_lookups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_store_id UUID REFERENCES tracking_stores(id) ON DELETE SET NULL,
  tracking_number TEXT,
  order_number TEXT,
  customer_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  found BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'public',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_lookups_store
  ON tracking_lookups(tracking_store_id);
CREATE INDEX IF NOT EXISTS idx_tracking_lookups_number
  ON tracking_lookups(tracking_number);
CREATE INDEX IF NOT EXISTS idx_tracking_lookups_created
  ON tracking_lookups(created_at DESC);

-- =====================================================
-- 5. Triggers: updated_at automático
-- =====================================================

CREATE TRIGGER set_tracking_stores_updated_at
  BEFORE UPDATE ON tracking_stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_tracking_orders_updated_at
  BEFORE UPDATE ON tracking_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_tracking_codes_updated_at
  BEFORE UPDATE ON tracking_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 6. RLS Policies
-- =====================================================

ALTER TABLE tracking_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_lookups ENABLE ROW LEVEL SECURITY;

-- tracking_stores: org members + service role
CREATE POLICY "Users can view tracking_stores in their org"
  ON tracking_stores FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
  );

CREATE POLICY "Users can insert tracking_stores in their org"
  ON tracking_stores FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Users can update tracking_stores in their org"
  ON tracking_stores FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Users can delete tracking_stores in their org"
  ON tracking_stores FOR DELETE TO authenticated
  USING (
    is_admin()
  );

-- tracking_orders: org members
CREATE POLICY "Users can view tracking_orders in their org"
  ON tracking_orders FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
  );

CREATE POLICY "Users can insert tracking_orders"
  ON tracking_orders FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Users can update tracking_orders"
  ON tracking_orders FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
    OR is_admin()
  );

-- tracking_codes: org members
CREATE POLICY "Users can view tracking_codes in their org"
  ON tracking_codes FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
  );

CREATE POLICY "Users can insert tracking_codes"
  ON tracking_codes FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
    OR is_admin()
  );

CREATE POLICY "Users can update tracking_codes"
  ON tracking_codes FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
    OR is_admin()
  );

-- tracking_lookups: public insert (para widget), org select
CREATE POLICY "Anyone can insert tracking_lookups"
  ON tracking_lookups FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Users can view tracking_lookups in their org"
  ON tracking_lookups FOR SELECT TO authenticated
  USING (
    tracking_store_id IN (
      SELECT ts.id FROM tracking_stores ts
      WHERE ts.org_id IN (SELECT om.org_id FROM org_members om WHERE om.profile_id = auth.uid())
    )
  );

-- Service role (admin client) bypasses all RLS

COMMIT;
