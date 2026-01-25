-- =============================================
-- FASE 1.1: ORGANIZAÇÕES
-- =============================================
-- Organizações representam times/agências
-- A Convertfy é a organização principal (interna)
-- No futuro, pode ter agências parceiras

-- Criar tabela de organizações
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificação
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,

  -- Tipo de organização
  type TEXT DEFAULT 'internal' CHECK (type IN ('internal', 'agency', 'partner')),

  -- Branding (futuro)
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3b82f6',

  -- Configurações gerais
  settings JSONB DEFAULT '{}',

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(type);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active) WHERE is_active = true;

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_organizations_updated_at ON organizations;
CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Inserir Convertfy como organização padrão
INSERT INTO organizations (name, slug, type, settings)
VALUES (
  'Convertfy',
  'convertfy',
  'internal',
  '{"is_main": true}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- Comentários
COMMENT ON TABLE organizations IS 'Organizações/times que usam o sistema';
COMMENT ON COLUMN organizations.type IS 'internal = Convertfy, agency = agência parceira, partner = parceiro';
COMMENT ON COLUMN organizations.settings IS 'Configurações específicas da organização';
