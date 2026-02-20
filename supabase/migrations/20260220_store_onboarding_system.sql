-- Store Onboarding Data (campos exclusivos do formulario, nao duplicados de client_stores)
CREATE TABLE IF NOT EXISTS store_onboarding_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  price_sensitivity TEXT CHECK (price_sensitivity IN ('price', 'quality', 'balanced')),
  additional_notes TEXT,
  logo_url TEXT,
  design_direction_text TEXT,
  design_direction_file_url TEXT,
  brand_manual_url TEXT,
  filled_by UUID,
  filled_at TIMESTAMPTZ,
  is_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Store Briefings (versionado por loja)
CREATE TABLE IF NOT EXISTS store_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  onboarding_data_id UUID REFERENCES store_onboarding_data(id),
  briefing_data JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  generated_at TIMESTAMPTZ DEFAULT now(),
  generated_by TEXT DEFAULT 'auto',
  status TEXT DEFAULT 'current' CHECK (status IN ('current', 'archived')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sod_store ON store_onboarding_data(store_id);
CREATE INDEX IF NOT EXISTS idx_sod_org ON store_onboarding_data(org_id);
CREATE INDEX IF NOT EXISTS idx_sb_store ON store_briefings(store_id);
CREATE INDEX IF NOT EXISTS idx_sb_status ON store_briefings(status);

-- RLS
ALTER TABLE store_onboarding_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_briefings ENABLE ROW LEVEL SECURITY;

-- Policies permissivas (mesmo padrao do projeto)
CREATE POLICY "all_store_onboarding_data" ON store_onboarding_data FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "all_store_briefings" ON store_briefings FOR ALL TO authenticated USING (true) WITH CHECK (true);
