-- Migration: Klaviyo Audiences (Lists & Segments) Cache Table
-- Story 29.2 — Persistir nome e profile_count de cada lista e segmento Klaviyo

-- =====================================================
-- 1. TABELA DE AUDIÊNCIAS KLAVIYO (CACHE)
-- =====================================================
CREATE TABLE IF NOT EXISTS klaviyo_audiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),

  klaviyo_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('list', 'segment')),
  name TEXT NOT NULL,
  profile_count INTEGER DEFAULT 0,

  is_active BOOLEAN,
  is_starred BOOLEAN,

  is_main_list BOOLEAN DEFAULT false,
  is_engaged_segment BOOLEAN DEFAULT false,

  created_at_klaviyo TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, klaviyo_id)
);

-- =====================================================
-- 2. ÍNDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_klaviyo_audiences_store ON klaviyo_audiences(store_id);
CREATE INDEX IF NOT EXISTS idx_klaviyo_audiences_type ON klaviyo_audiences(store_id, type);
CREATE INDEX IF NOT EXISTS idx_klaviyo_audiences_role ON klaviyo_audiences(store_id, is_main_list, is_engaged_segment)
  WHERE is_main_list OR is_engaged_segment;

-- =====================================================
-- 3. RLS POLICIES (matching klaviyo_flow_metrics pattern)
-- =====================================================
ALTER TABLE klaviyo_audiences ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for cron/admin operations)
CREATE POLICY "service_audiences_all" ON klaviyo_audiences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Org member select: via org_id or store access
CREATE POLICY "org_audiences_select" ON klaviyo_audiences
  FOR SELECT USING (
    (org_id = current_org_id()) OR can_access_store(store_id)
  );

-- Org member update
CREATE POLICY "org_audiences_update" ON klaviyo_audiences
  FOR UPDATE USING (
    (org_id = current_org_id()) OR can_access_store(store_id)
  );

-- Org member delete (admin/owner only)
CREATE POLICY "org_audiences_delete" ON klaviyo_audiences
  FOR DELETE USING (
    ((org_id = current_org_id()) OR can_access_store(store_id))
    AND (is_admin() OR is_org_owner())
  );

-- Portal user select: via client_portal_users
CREATE POLICY "portal_audiences_select" ON klaviyo_audiences
  FOR SELECT USING (
    store_id IN (
      SELECT cs.id
      FROM client_stores cs
      JOIN client_portal_users cpu ON cs.client_id = cpu.client_id
      WHERE cpu.auth_user_id = auth.uid() AND cpu.is_active = true
    )
  );

COMMENT ON TABLE klaviyo_audiences IS 'Cache de listas e segmentos do Klaviyo com nome e profile_count';
COMMENT ON COLUMN klaviyo_audiences.org_id IS 'Nullable por compatibilidade com stores legadas sem org (issue 15.6 F3).';
