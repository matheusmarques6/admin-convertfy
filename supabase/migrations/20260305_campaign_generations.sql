-- Migration: Campaign Generation Tables
-- Story: 20.2 - Migrations Supabase: Tabelas Campaign Generation
-- Date: 2026-03-05

-- ============================================
-- Table: campaign_generations
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  name VARCHAR(255) NOT NULL,
  date DATE NOT NULL,
  reference_doc_url TEXT,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Table: campaign_generation_stores
-- ============================================
CREATE TABLE IF NOT EXISTS campaign_generation_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES campaign_generations(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'done', 'error')),
  version INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Indices
-- ============================================
CREATE INDEX idx_campaign_generations_client_id
  ON campaign_generations(client_id);

CREATE INDEX idx_campaign_generation_stores_generation_id
  ON campaign_generation_stores(generation_id);

CREATE UNIQUE INDEX idx_campaign_generation_stores_gen_store
  ON campaign_generation_stores(generation_id, store_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE campaign_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_generation_stores ENABLE ROW LEVEL SECURITY;

-- Portal users can SELECT their own client's generations
CREATE POLICY "portal_select_own_generations"
  ON campaign_generations
  FOR SELECT
  USING (
    client_id IN (
      SELECT cp.client_id
      FROM client_portal_users cp
      WHERE cp.auth_user_id = auth.uid()
    )
  );

-- Portal users can SELECT stores for generations that belong to their client
CREATE POLICY "portal_select_own_generation_stores"
  ON campaign_generation_stores
  FOR SELECT
  USING (
    generation_id IN (
      SELECT cg.id
      FROM campaign_generations cg
      JOIN client_portal_users cp ON cp.client_id = cg.client_id
      WHERE cp.auth_user_id = auth.uid()
    )
  );

-- ============================================
-- Trigger: updated_at on campaign_generations
-- (reuses existing update_updated_at_column function)
-- ============================================
CREATE TRIGGER set_campaign_generations_updated_at
  BEFORE UPDATE ON campaign_generations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
