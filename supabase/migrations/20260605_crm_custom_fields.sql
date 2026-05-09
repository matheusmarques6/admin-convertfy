-- Custom fields definitions per org/entity. Permite admins definirem
-- campos arbitrarios pra leads e deals (URL da loja, faturamento, etc)
-- sem precisar de migration nova a cada campo.

DO $$ BEGIN
  CREATE TYPE crm_custom_field_entity AS ENUM ('lead', 'deal');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE crm_custom_field_type AS ENUM (
    'text', 'textarea', 'number', 'select', 'multi_select',
    'boolean', 'date', 'url', 'email', 'phone'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS crm_custom_fields (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type crm_custom_field_entity NOT NULL DEFAULT 'lead',
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type crm_custom_field_type NOT NULL DEFAULT 'text',
  options JSONB DEFAULT '[]'::jsonb,
  description TEXT,
  required BOOLEAN DEFAULT FALSE,
  position INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, entity_type, key)
);

CREATE INDEX IF NOT EXISTS idx_crm_custom_fields_org_entity
  ON crm_custom_fields (org_id, entity_type, position)
  WHERE is_active = true;

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION update_crm_custom_fields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_custom_fields_updated_at ON crm_custom_fields;
CREATE TRIGGER trg_crm_custom_fields_updated_at
  BEFORE UPDATE ON crm_custom_fields
  FOR EACH ROW EXECUTE FUNCTION update_crm_custom_fields_updated_at();

ALTER TABLE crm_custom_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view custom fields" ON crm_custom_fields;
CREATE POLICY "Members can view custom fields" ON crm_custom_fields
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  );

DROP POLICY IF EXISTS "Owners can manage custom fields" ON crm_custom_fields;
CREATE POLICY "Owners can manage custom fields" ON crm_custom_fields
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
        AND role IN ('owner', 'manager')
    )
  );
