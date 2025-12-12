-- Convertfy Admin - Initial Schema
-- Run this in Supabase SQL Editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================
-- USERS & PERMISSIONS
-- ========================

-- User Roles Enum
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'sdr', 'closer', 'cs', 'financial');

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'cs',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- CLIENTS
-- ========================

-- Client Status Enum
CREATE TYPE client_status AS ENUM ('active', 'inactive', 'churned', 'prospect', 'onboarding');

-- Clients table
CREATE TABLE clients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  website TEXT,
  status client_status NOT NULL DEFAULT 'prospect',
  health_score INTEGER DEFAULT 50 CHECK (health_score >= 0 AND health_score <= 100),
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  owner_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client Stores (for Shopify integration)
CREATE TYPE store_platform AS ENUM ('shopify', 'nuvemshop', 'woocommerce', 'other');

CREATE TABLE client_stores (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  platform store_platform NOT NULL DEFAULT 'shopify',
  store_name TEXT NOT NULL,
  store_url TEXT,
  api_key TEXT,
  api_secret TEXT,
  access_token TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- CONTRACTS
-- ========================

CREATE TYPE contract_status AS ENUM ('active', 'expired', 'cancelled', 'pending');

CREATE TABLE contracts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  plan_name TEXT NOT NULL,
  monthly_value DECIMAL(10, 2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status contract_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- FINANCIAL
-- ========================

CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled', 'refunded');

CREATE TABLE invoices (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  asaas_id TEXT,
  amount DECIMAL(10, 2) NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  status payment_status NOT NULL DEFAULT 'pending',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- MEETINGS
-- ========================

CREATE TYPE meeting_status AS ENUM ('scheduled', 'completed', 'cancelled', 'no_show');

CREATE TABLE meetings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  status meeting_status NOT NULL DEFAULT 'scheduled',
  meeting_url TEXT,
  notes TEXT,
  google_event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- REPORTS
-- ========================

CREATE TABLE reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  month TEXT NOT NULL, -- Format: YYYY-MM
  document_url TEXT,
  metrics JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- PIPELINE
-- ========================

CREATE TABLE pipelines (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pipeline_stages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8B5CF6',
  "order" INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE deals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value DECIMAL(10, 2) DEFAULT 0,
  probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  owner_id UUID REFERENCES profiles(id) NOT NULL,
  custom_fields JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- AUTOMATIONS
-- ========================

CREATE TABLE automations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT false,
  trigger JSONB NOT NULL,
  conditions JSONB DEFAULT '[]',
  actions JSONB NOT NULL,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE automation_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  automation_id UUID REFERENCES automations(id) ON DELETE CASCADE NOT NULL,
  trigger_data JSONB DEFAULT '{}',
  actions_executed TEXT[] DEFAULT '{}',
  status TEXT NOT NULL,
  error_message TEXT,
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- ACTIVITIES (Timeline)
-- ========================

CREATE TYPE activity_type AS ENUM (
  'client_created', 'client_updated', 'status_changed',
  'meeting_scheduled', 'meeting_completed',
  'payment_received', 'payment_overdue',
  'report_uploaded', 'note_added',
  'email_sent', 'whatsapp_sent',
  'deal_created', 'deal_updated', 'deal_won', 'deal_lost'
);

CREATE TABLE activities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  type activity_type NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- INTEGRATIONS
-- ========================

CREATE TYPE integration_type AS ENUM (
  'asaas', 'meta_ads', 'google_ads', 'klaviyo',
  'shopify', 'instagram', 'whatsapp', 'google_calendar'
);

CREATE TABLE integrations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type integration_type NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  credentials JSONB DEFAULT '{}',
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- CUSTOM FIELDS & TAGS
-- ========================

CREATE TYPE custom_field_type AS ENUM ('text', 'number', 'date', 'select', 'multiselect', 'boolean', 'url', 'email');
CREATE TYPE entity_type AS ENUM ('client', 'deal', 'contract');

CREATE TABLE custom_fields (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  type custom_field_type NOT NULL,
  entity_type entity_type NOT NULL,
  options TEXT[],
  is_required BOOLEAN DEFAULT false,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tags (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#8B5CF6',
  entity_type entity_type NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- EMAIL TEMPLATES
-- ========================

CREATE TABLE email_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- SETTINGS
-- ========================

CREATE TABLE settings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================
-- INDEXES
-- ========================

CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_owner ON clients(owner_id);
CREATE INDEX idx_clients_created ON clients(created_at DESC);

CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

CREATE INDEX idx_meetings_client ON meetings(client_id);
CREATE INDEX idx_meetings_user ON meetings(user_id);
CREATE INDEX idx_meetings_scheduled ON meetings(scheduled_at);

CREATE INDEX idx_deals_pipeline ON deals(pipeline_id);
CREATE INDEX idx_deals_stage ON deals(stage_id);
CREATE INDEX idx_deals_owner ON deals(owner_id);

CREATE INDEX idx_activities_client ON activities(client_id);
CREATE INDEX idx_activities_created ON activities(created_at DESC);

CREATE INDEX idx_automation_logs_automation ON automation_logs(automation_id);
CREATE INDEX idx_automation_logs_executed ON automation_logs(executed_at DESC);

-- ========================
-- TRIGGERS
-- ========================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON pipelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- ROW LEVEL SECURITY (RLS)
-- ========================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view all profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Clients policies (everyone can view, only owner/admin can modify)
CREATE POLICY "Users can view all clients" ON clients
  FOR SELECT USING (true);

CREATE POLICY "Users can insert clients" ON clients
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update clients" ON clients
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can delete clients" ON clients
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Apply similar policies to other tables
CREATE POLICY "Users can view client_stores" ON client_stores
  FOR SELECT USING (true);

CREATE POLICY "Users can manage client_stores" ON client_stores
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view contracts" ON contracts
  FOR SELECT USING (true);

CREATE POLICY "Users can manage contracts" ON contracts
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view invoices" ON invoices
  FOR SELECT USING (true);

CREATE POLICY "Users can manage invoices" ON invoices
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view meetings" ON meetings
  FOR SELECT USING (true);

CREATE POLICY "Users can manage meetings" ON meetings
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view reports" ON reports
  FOR SELECT USING (true);

CREATE POLICY "Users can manage reports" ON reports
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view pipelines" ON pipelines
  FOR SELECT USING (true);

CREATE POLICY "Users can manage pipelines" ON pipelines
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view pipeline_stages" ON pipeline_stages
  FOR SELECT USING (true);

CREATE POLICY "Users can manage pipeline_stages" ON pipeline_stages
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view deals" ON deals
  FOR SELECT USING (true);

CREATE POLICY "Users can manage deals" ON deals
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view automations" ON automations
  FOR SELECT USING (true);

CREATE POLICY "Users can manage automations" ON automations
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view automation_logs" ON automation_logs
  FOR SELECT USING (true);

CREATE POLICY "Users can view activities" ON activities
  FOR SELECT USING (true);

CREATE POLICY "Users can create activities" ON activities
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view integrations" ON integrations
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage integrations" ON integrations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Users can view custom_fields" ON custom_fields
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage custom_fields" ON custom_fields
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view tags" ON tags
  FOR SELECT USING (true);

CREATE POLICY "Users can manage tags" ON tags
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view email_templates" ON email_templates
  FOR SELECT USING (true);

CREATE POLICY "Users can manage email_templates" ON email_templates
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can view settings" ON settings
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage settings" ON settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ========================
-- FUNCTIONS
-- ========================

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cs')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function to calculate client health score
CREATE OR REPLACE FUNCTION calculate_health_score(client_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 50;
  has_overdue_payments BOOLEAN;
  has_overdue_meetings BOOLEAN;
  has_recent_activity BOOLEAN;
  contract_active BOOLEAN;
BEGIN
  -- Check for overdue payments (-20 points)
  SELECT EXISTS(
    SELECT 1 FROM invoices
    WHERE client_id = client_uuid
    AND status = 'overdue'
  ) INTO has_overdue_payments;

  IF has_overdue_payments THEN
    score := score - 20;
  END IF;

  -- Check for overdue meetings (-15 points)
  SELECT EXISTS(
    SELECT 1 FROM meetings
    WHERE client_id = client_uuid
    AND status = 'no_show'
    AND scheduled_at > NOW() - INTERVAL '30 days'
  ) INTO has_overdue_meetings;

  IF has_overdue_meetings THEN
    score := score - 15;
  END IF;

  -- Check for recent activity (+20 points)
  SELECT EXISTS(
    SELECT 1 FROM activities
    WHERE client_id = client_uuid
    AND created_at > NOW() - INTERVAL '14 days'
  ) INTO has_recent_activity;

  IF has_recent_activity THEN
    score := score + 20;
  END IF;

  -- Check for active contract (+15 points)
  SELECT EXISTS(
    SELECT 1 FROM contracts
    WHERE client_id = client_uuid
    AND status = 'active'
  ) INTO contract_active;

  IF contract_active THEN
    score := score + 15;
  END IF;

  -- Ensure score is between 0 and 100
  RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql;

-- ========================
-- SEED DATA
-- ========================

-- Insert default pipeline
INSERT INTO pipelines (name, description, is_default) VALUES
  ('Pipeline Principal', 'Pipeline padrão de vendas', true);

-- Get the pipeline ID for stages
DO $$
DECLARE
  pipeline_uuid UUID;
BEGIN
  SELECT id INTO pipeline_uuid FROM pipelines WHERE is_default = true LIMIT 1;

  INSERT INTO pipeline_stages (pipeline_id, name, color, "order") VALUES
    (pipeline_uuid, 'Lead', '#94A3B8', 1),
    (pipeline_uuid, 'Qualificação', '#F59E0B', 2),
    (pipeline_uuid, 'Proposta', '#3B82F6', 3),
    (pipeline_uuid, 'Negociação', '#8B5CF6', 4),
    (pipeline_uuid, 'Fechado Ganho', '#22C55E', 5),
    (pipeline_uuid, 'Fechado Perdido', '#EF4444', 6);
END $$;

-- Insert default settings
INSERT INTO settings (key, value) VALUES
  ('company', '{"name": "Convertfy", "logo": null}'),
  ('meeting_frequency', '{"default_days": 14}'),
  ('report_frequency', '{"default_days": 30}'),
  ('notifications', '{"email": true, "push": true}');
