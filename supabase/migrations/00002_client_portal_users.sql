-- Client Portal Users - Migration
-- This table stores users who can access the client portal

-- ========================
-- CLIENT PORTAL USERS
-- ========================

CREATE TABLE client_portal_users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  is_primary_contact BOOLEAN DEFAULT false,
  must_change_password BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  permissions JSONB DEFAULT '{
    "view_reports": true,
    "view_invoices": true,
    "view_campaigns": true,
    "edit_profile": true
  }',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_client_portal_users_client ON client_portal_users(client_id);
CREATE INDEX idx_client_portal_users_email ON client_portal_users(email);
CREATE INDEX idx_client_portal_users_auth ON client_portal_users(auth_user_id);

-- Unique constraint: one email per client
CREATE UNIQUE INDEX idx_client_portal_users_client_email ON client_portal_users(client_id, email);

-- Trigger to update updated_at
CREATE TRIGGER update_client_portal_users_updated_at
  BEFORE UPDATE ON client_portal_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- ROW LEVEL SECURITY
-- ========================

ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;

-- Admin users can view all portal users
CREATE POLICY "Admin users can view all portal users" ON client_portal_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'cs')
    )
  );

-- Admin users can manage portal users
CREATE POLICY "Admin users can manage portal users" ON client_portal_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'cs')
    )
  );

-- Portal users can view their own record
CREATE POLICY "Portal users can view own record" ON client_portal_users
  FOR SELECT USING (auth_user_id = auth.uid());

-- Portal users can update their own record (for password change flag)
CREATE POLICY "Portal users can update own record" ON client_portal_users
  FOR UPDATE USING (auth_user_id = auth.uid());

-- ========================
-- ACTIVITY TYPE UPDATE
-- ========================

-- Add new activity types for portal users
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'portal_user_created';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'portal_user_updated';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'portal_user_deleted';
ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'portal_user_login';
