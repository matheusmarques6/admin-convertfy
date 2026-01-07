-- Migration: Onboarding System
-- Date: 2025-01-07
-- Description: Create onboarding stages, client briefings and auto feedback scheduling

-- ========================
-- ONBOARDING STAGES ENUM
-- ========================
CREATE TYPE onboarding_stage AS ENUM (
  'entrada',           -- Entrada - Client just submitted form
  'design_producao',   -- Design em produção
  'implementando',     -- Implementando
  'estrutura_pronta',  -- Estrutura implementada
  'concluido'          -- Cliente ✅ - Completed
);

-- ========================
-- CLIENTS TABLE UPDATES
-- ========================
-- Add onboarding columns to clients table
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS onboarding_stage onboarding_stage DEFAULT 'entrada',
ADD COLUMN IF NOT EXISTS onboarding_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS onboarding_assigned_to UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS onboarding_notes TEXT;

-- Index for onboarding queries
CREATE INDEX IF NOT EXISTS idx_clients_onboarding_stage ON clients(onboarding_stage);
CREATE INDEX IF NOT EXISTS idx_clients_onboarding_assigned ON clients(onboarding_assigned_to);

-- ========================
-- CLIENT BRIEFINGS TABLE
-- ========================
CREATE TABLE IF NOT EXISTS client_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,

  -- Informações básicas da loja
  store_name TEXT,
  store_url TEXT,
  platform TEXT,

  -- Contatos
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  contact_whatsapp TEXT,

  -- Credenciais de integração
  shopify_store_url TEXT,
  shopify_access_token TEXT,
  klaviyo_public_key TEXT,
  klaviyo_private_key TEXT,

  -- Informações do negócio
  monthly_revenue TEXT,
  products_count TEXT,
  main_products TEXT,
  target_audience TEXT,
  brand_voice TEXT,
  competitors TEXT,

  -- Email Marketing
  current_email_tool TEXT,
  email_list_size INTEGER,
  has_welcome_flow BOOLEAN DEFAULT false,
  has_abandoned_cart_flow BOOLEAN DEFAULT false,
  has_post_purchase_flow BOOLEAN DEFAULT false,

  -- Objetivos
  main_goals TEXT,
  expected_results TEXT,
  timeline_expectations TEXT,

  -- Notas adicionais
  additional_notes TEXT,
  internal_notes TEXT,

  -- AI Generated Briefing
  ai_briefing_summary TEXT,
  ai_generated_at TIMESTAMPTZ,

  -- Form submission tracking
  form_submitted_at TIMESTAMPTZ,
  form_source TEXT, -- 'notion', 'manual', 'api'

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for briefings
CREATE INDEX IF NOT EXISTS idx_client_briefings_client_id ON client_briefings(client_id);

-- Enable RLS
ALTER TABLE client_briefings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all briefings" ON client_briefings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert briefings" ON client_briefings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update briefings" ON client_briefings
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Users can delete briefings" ON client_briefings
  FOR DELETE TO authenticated USING (true);

-- ========================
-- ONBOARDING HISTORY TABLE
-- ========================
CREATE TABLE IF NOT EXISTS onboarding_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  from_stage onboarding_stage,
  to_stage onboarding_stage NOT NULL,
  changed_by UUID NOT NULL REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for history
CREATE INDEX IF NOT EXISTS idx_onboarding_history_client ON onboarding_history(client_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_history_created ON onboarding_history(created_at DESC);

-- Enable RLS
ALTER TABLE onboarding_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all onboarding history" ON onboarding_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert onboarding history" ON onboarding_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- ========================
-- TRIGGER: Auto-schedule feedback when onboarding completes
-- ========================
CREATE OR REPLACE FUNCTION handle_onboarding_completion()
RETURNS TRIGGER AS $$
DECLARE
  store_record RECORD;
BEGIN
  -- Check if status changed to 'concluido' (completed)
  IF NEW.onboarding_stage = 'concluido' AND (OLD.onboarding_stage IS NULL OR OLD.onboarding_stage != 'concluido') THEN
    -- Set onboarding completed timestamp
    NEW.onboarding_completed_at = NOW();

    -- Update client status to active
    NEW.status = 'active';

    -- Schedule first feedback for all stores of this client
    -- 30 days from completion
    UPDATE client_stores
    SET
      next_feedback_date = NOW() + INTERVAL '30 days',
      feedback_frequency = '30_days'
    WHERE client_id = NEW.id
    AND is_active = true
    AND next_feedback_date IS NULL;

  END IF;

  -- Set onboarding started timestamp if entering the pipeline
  IF NEW.onboarding_stage IS NOT NULL AND NEW.onboarding_started_at IS NULL THEN
    NEW.onboarding_started_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for onboarding completion
DROP TRIGGER IF EXISTS trigger_onboarding_completion ON clients;
CREATE TRIGGER trigger_onboarding_completion
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION handle_onboarding_completion();

-- ========================
-- TRIGGER: Record onboarding stage changes
-- ========================
CREATE OR REPLACE FUNCTION record_onboarding_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only record if stage actually changed
  IF OLD.onboarding_stage IS DISTINCT FROM NEW.onboarding_stage THEN
    INSERT INTO onboarding_history (client_id, from_stage, to_stage, changed_by, notes)
    VALUES (
      NEW.id,
      OLD.onboarding_stage,
      NEW.onboarding_stage,
      COALESCE(auth.uid(), NEW.onboarding_assigned_to),
      NULL
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for recording stage changes
DROP TRIGGER IF EXISTS trigger_record_onboarding_change ON clients;
CREATE TRIGGER trigger_record_onboarding_change
  AFTER UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION record_onboarding_stage_change();

-- ========================
-- UPDATE UPDATED_AT TRIGGER
-- ========================
CREATE TRIGGER update_client_briefings_updated_at
  BEFORE UPDATE ON client_briefings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- COMMENTS
-- ========================
COMMENT ON TYPE onboarding_stage IS 'Stages of client onboarding: entrada -> design_producao -> implementando -> estrutura_pronta -> concluido';
COMMENT ON TABLE client_briefings IS 'Stores client briefing information collected during onboarding';
COMMENT ON TABLE onboarding_history IS 'Audit log of onboarding stage changes';
COMMENT ON COLUMN clients.onboarding_stage IS 'Current stage in the onboarding Kanban';
COMMENT ON COLUMN clients.onboarding_started_at IS 'When the client entered the onboarding pipeline';
COMMENT ON COLUMN clients.onboarding_completed_at IS 'When the client completed onboarding (reached concluido stage)';
