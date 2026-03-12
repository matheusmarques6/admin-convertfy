-- Story 35.4: Ensure client_portal_activity table exists with correct schema
-- Table was created by earlier migration (00002_client_portal_users.sql) with correct column "metadata"
-- This migration is a no-op safety net for fresh environments

CREATE TABLE IF NOT EXISTS client_portal_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  portal_user_id UUID NOT NULL REFERENCES client_portal_users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_activity_portal_user
  ON client_portal_activity(portal_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_activity_client
  ON client_portal_activity(client_id, created_at DESC);

ALTER TABLE client_portal_activity ENABLE ROW LEVEL SECURITY;
