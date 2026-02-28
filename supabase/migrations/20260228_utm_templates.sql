-- =====================================================
-- MIGRATION: UTM Templates CRUD
-- Tabela utm_templates com RLS multi-tenant
-- Story 6.2
--
-- DEPENDENCY: Requires function update_updated_at() to exist.
-- This function is defined in an earlier migration and provides
-- automatic updated_at timestamp management via trigger.
-- =====================================================

BEGIN;

-- =====================================================
-- 1. Tabela utm_templates
-- Templates de UTM reutilizaveis por loja
-- =====================================================

CREATE TABLE IF NOT EXISTS utm_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL,
  utm_campaign TEXT NOT NULL,
  utm_content TEXT,
  utm_term TEXT,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_utm_templates_store_id
  ON utm_templates(store_id);

CREATE INDEX IF NOT EXISTS idx_utm_templates_org_id
  ON utm_templates(org_id);

-- Indice UNIQUE parcial: previne templates ativos duplicados
CREATE UNIQUE INDEX idx_utm_templates_unique_active
  ON utm_templates(store_id, utm_source, utm_medium, utm_campaign)
  WHERE is_active = true AND deleted_at IS NULL;

-- Trigger para updated_at
CREATE TRIGGER set_utm_templates_updated_at
  BEFORE UPDATE ON utm_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- 2. RLS Policies
-- =====================================================

ALTER TABLE utm_templates ENABLE ROW LEVEL SECURITY;

-- SELECT: membros da org com acesso a loja (exclui soft-deleted)
DROP POLICY IF EXISTS "utm_templates_select" ON utm_templates;
CREATE POLICY "utm_templates_select" ON utm_templates
  FOR SELECT
  USING (
    can_access_store(store_id)
    AND deleted_at IS NULL
  );

-- INSERT: membros ativos da org, validando que store_id pertence a org_id
DROP POLICY IF EXISTS "utm_templates_insert" ON utm_templates;
CREATE POLICY "utm_templates_insert" ON utm_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = utm_templates.org_id
        AND om.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM client_stores cs
      WHERE cs.id = utm_templates.store_id
        AND cs.org_id = utm_templates.org_id
    )
  );

-- UPDATE: membros com acesso a loja
DROP POLICY IF EXISTS "utm_templates_update" ON utm_templates;
CREATE POLICY "utm_templates_update" ON utm_templates
  FOR UPDATE
  USING (can_access_store(store_id));

-- DELETE: apenas owner/manager (hard delete para cleanup)
DROP POLICY IF EXISTS "utm_templates_delete" ON utm_templates;
CREATE POLICY "utm_templates_delete" ON utm_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = utm_templates.org_id
        AND om.is_active = true
        AND om.role IN ('owner', 'manager')
    )
  );

-- =====================================================
-- 3. RPC para incremento atomico de usage_count
-- =====================================================

CREATE OR REPLACE FUNCTION increment_utm_usage(template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE utm_templates
  SET usage_count = usage_count + 1,
      updated_at = now()
  WHERE id = template_id
    AND EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.profile_id = auth.uid()
        AND om.org_id = utm_templates.org_id
        AND om.is_active = true
    );
END;
$$;

COMMIT;
