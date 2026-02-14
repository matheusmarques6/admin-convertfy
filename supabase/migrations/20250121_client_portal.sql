-- Client Portal System
-- Sistema de portal do cliente para acesso autônomo aos dados

-- ===========================================
-- CLIENT PORTAL USERS TABLE
-- ===========================================
-- Separate from admin profiles - clients have their own accounts
CREATE TABLE client_portal_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to client
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Authentication (stored in Supabase Auth)
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- User info
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,

  -- Access control
  is_active BOOLEAN DEFAULT true,
  is_primary BOOLEAN DEFAULT false, -- Primary contact for the client

  -- Permissions (JSON for flexibility)
  permissions JSONB DEFAULT '{
    "view_reports": true,
    "view_invoices": true,
    "view_campaigns": true,
    "edit_profile": true,
    "manage_stores": false
  }'::jsonb,

  -- Login tracking
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,

  -- Password reset
  password_reset_token TEXT,
  password_reset_expires_at TIMESTAMPTZ,

  -- Email verification
  email_verified_at TIMESTAMPTZ,
  email_verification_token TEXT,

  -- Invitation
  invited_by UUID REFERENCES profiles(id),
  invited_at TIMESTAMPTZ DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_client_portal_users_client_id ON client_portal_users(client_id);
CREATE INDEX idx_client_portal_users_auth_user_id ON client_portal_users(auth_user_id);
CREATE INDEX idx_client_portal_users_email ON client_portal_users(email);
CREATE INDEX idx_client_portal_users_active ON client_portal_users(is_active);

-- ===========================================
-- CLIENT PORTAL SESSIONS
-- ===========================================
-- Track active sessions for security
CREATE TABLE client_portal_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_user_id UUID NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE,

  -- Session info
  session_token TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address INET,

  -- Validity
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_portal_sessions_user ON client_portal_sessions(portal_user_id);
CREATE INDEX idx_client_portal_sessions_token ON client_portal_sessions(session_token);
CREATE INDEX idx_client_portal_sessions_expires ON client_portal_sessions(expires_at);

-- ===========================================
-- CLIENT PORTAL ACTIVITY LOG
-- ===========================================
-- Audit log for client portal access
CREATE TABLE client_portal_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_user_id UUID NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Activity type
  action TEXT NOT NULL, -- 'login', 'logout', 'view_report', 'view_invoice', 'download_report', etc.

  -- Details
  resource_type TEXT, -- 'report', 'invoice', 'campaign', etc.
  resource_id UUID,
  metadata JSONB DEFAULT '{}',

  -- Request info
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_portal_activity_user ON client_portal_activity(portal_user_id);
CREATE INDEX idx_client_portal_activity_client ON client_portal_activity(client_id);
CREATE INDEX idx_client_portal_activity_action ON client_portal_activity(action);
CREATE INDEX idx_client_portal_activity_date ON client_portal_activity(created_at);

-- ===========================================
-- CLIENT NOTIFICATION PREFERENCES
-- ===========================================
CREATE TABLE client_notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_user_id UUID NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE UNIQUE,

  -- Email notifications
  email_report_weekly BOOLEAN DEFAULT true,
  email_report_monthly BOOLEAN DEFAULT true,
  email_invoice_reminder BOOLEAN DEFAULT true,
  email_invoice_paid BOOLEAN DEFAULT true,
  email_campaign_sent BOOLEAN DEFAULT false,
  email_performance_alerts BOOLEAN DEFAULT true,

  -- WhatsApp notifications
  whatsapp_enabled BOOLEAN DEFAULT false,
  whatsapp_number TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===========================================
-- CLIENT REPORT ACCESS TOKENS
-- ===========================================
-- For sharing reports via public links
CREATE TABLE client_report_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  store_id UUID REFERENCES client_stores(id) ON DELETE CASCADE,

  -- Token
  token TEXT NOT NULL UNIQUE,

  -- Access control
  expires_at TIMESTAMPTZ,
  max_views INTEGER,
  view_count INTEGER DEFAULT 0,

  -- Report settings
  report_type TEXT DEFAULT 'full', -- 'full', 'summary', 'custom'
  allowed_sections JSONB, -- Which sections can be viewed

  -- Tracking
  created_by UUID REFERENCES profiles(id),
  last_viewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_report_tokens_token ON client_report_tokens(token);
CREATE INDEX idx_client_report_tokens_client ON client_report_tokens(client_id);

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_client_portal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER client_portal_users_updated_at
  BEFORE UPDATE ON client_portal_users
  FOR EACH ROW
  EXECUTE FUNCTION update_client_portal_updated_at();

CREATE TRIGGER client_notification_preferences_updated_at
  BEFORE UPDATE ON client_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_client_portal_updated_at();

-- Function to increment login count
CREATE OR REPLACE FUNCTION increment_portal_login()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE client_portal_users
  SET
    login_count = login_count + 1,
    last_login_at = NOW()
  WHERE id = NEW.portal_user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create notification preferences
CREATE OR REPLACE FUNCTION create_portal_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO client_notification_preferences (portal_user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_notification_prefs_on_portal_user
  AFTER INSERT ON client_portal_users
  FOR EACH ROW
  EXECUTE FUNCTION create_portal_notification_preferences();

-- Generate secure random token
CREATE OR REPLACE FUNCTION generate_portal_token(length INTEGER DEFAULT 32)
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  FOR i IN 1..length LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_portal_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_report_tokens ENABLE ROW LEVEL SECURITY;

-- Admin can see all
CREATE POLICY "Admin can view all portal users"
  ON client_portal_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'cs')
    )
  );

CREATE POLICY "Admin can manage portal users"
  ON client_portal_users FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
  );

-- Portal users can see their own data
CREATE POLICY "Portal users can view own record"
  ON client_portal_users FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "Portal users can update own record"
  ON client_portal_users FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Sessions - users can only see their own
CREATE POLICY "Users can view own sessions"
  ON client_portal_sessions FOR SELECT
  TO authenticated
  USING (
    portal_user_id IN (
      SELECT id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Activity - users can see their own, admin can see all
CREATE POLICY "Users can view own activity"
  ON client_portal_activity FOR SELECT
  TO authenticated
  USING (
    portal_user_id IN (
      SELECT id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'cs')
    )
  );

-- Notification preferences
CREATE POLICY "Users can manage own notification preferences"
  ON client_notification_preferences FOR ALL
  TO authenticated
  USING (
    portal_user_id IN (
      SELECT id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Report tokens - admin manages, clients can view their own
CREATE POLICY "Admin can manage report tokens"
  ON client_report_tokens FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager', 'cs')
    )
  );

CREATE POLICY "Clients can view own report tokens"
  ON client_report_tokens FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- ===========================================
-- EXTEND EXISTING TABLES RLS FOR PORTAL ACCESS
-- ===========================================

-- Allow portal users to view their client's stores
CREATE POLICY "Portal users can view own client stores"
  ON client_stores FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Allow portal users to view their campaigns
CREATE POLICY "Portal users can view own campaigns"
  ON campaigns FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Allow portal users to view their invoices
CREATE POLICY "Portal users can view own invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Allow portal users to view their contracts
CREATE POLICY "Portal users can view own contracts"
  ON contracts FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Allow portal users to view their meetings
CREATE POLICY "Portal users can view own meetings"
  ON meetings FOR SELECT
  TO authenticated
  USING (
    client_id IN (
      SELECT client_id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- Allow portal users to view their client record
CREATE POLICY "Portal users can view own client"
  ON clients FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT client_id FROM client_portal_users WHERE auth_user_id = auth.uid()
    )
  );

-- ===========================================
-- COMMENTS
-- ===========================================
COMMENT ON TABLE client_portal_users IS 'Client portal user accounts for self-service access';
COMMENT ON TABLE client_portal_sessions IS 'Active sessions for portal users';
COMMENT ON TABLE client_portal_activity IS 'Audit log of portal user actions';
COMMENT ON TABLE client_notification_preferences IS 'Email and notification preferences for portal users';
COMMENT ON TABLE client_report_tokens IS 'Public access tokens for sharing reports';

COMMENT ON COLUMN client_portal_users.is_primary IS 'Primary contact receives all notifications';
COMMENT ON COLUMN client_portal_users.permissions IS 'JSON object with permission flags';
