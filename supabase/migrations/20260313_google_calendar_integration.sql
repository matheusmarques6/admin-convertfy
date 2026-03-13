-- ============================================================
-- Story 42.1 — DB Migration: user_google_tokens + ALTER meetings/participants
-- Epic 42 — Google Calendar Integration (Phase 1 - Foundation)
--
-- Creates:
--   1. user_google_tokens table (OAuth tokens per-user)
--   2. ALTER meetings: google sync columns, timezone, meeting_url_source
--   3. ALTER meeting_participants: email, google_rsvp_status
--   4. RLS policies on user_google_tokens (auth.uid() = user_id)
--   5. Indexes for sync queries and unique constraint on google_event_id
--
-- Idempotent: all operations use IF NOT EXISTS / IF EXISTS guards
-- ============================================================

-- ===========================================
-- 1. Nova tabela user_google_tokens
-- ===========================================
CREATE TABLE IF NOT EXISTS user_google_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_type TEXT NOT NULL CHECK (user_type IN ('profile', 'portal_user')),
  user_id UUID NOT NULL,
  google_email TEXT NOT NULL,
  google_account_id TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  sync_error TEXT,
  org_id UUID REFERENCES organizations(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_type, user_id)
);

-- Indexes on user_google_tokens
CREATE INDEX IF NOT EXISTS idx_user_google_tokens_user
  ON user_google_tokens(user_type, user_id);

CREATE INDEX IF NOT EXISTS idx_user_google_tokens_org
  ON user_google_tokens(org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_user_google_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_google_tokens_updated_at ON user_google_tokens;
CREATE TRIGGER trigger_user_google_tokens_updated_at
  BEFORE UPDATE ON user_google_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_user_google_tokens_updated_at();

-- Comments
COMMENT ON TABLE user_google_tokens IS 'Stores Google OAuth tokens per-user (admin profiles and portal users). Tokens are encrypted at application layer with enc:v1: prefix.';
COMMENT ON COLUMN user_google_tokens.user_type IS 'profile = admin user (profiles.id = auth.uid), portal_user = client portal user (client_portal_users.id)';
COMMENT ON COLUMN user_google_tokens.access_token IS 'Encrypted with AES-256-GCM, prefix enc:v1:';
COMMENT ON COLUMN user_google_tokens.refresh_token IS 'Encrypted with AES-256-GCM, prefix enc:v1:';

-- ===========================================
-- 2. RLS on user_google_tokens [C5]
-- ===========================================
ALTER TABLE user_google_tokens ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist (idempotent)
DROP POLICY IF EXISTS user_google_tokens_select ON user_google_tokens;
DROP POLICY IF EXISTS user_google_tokens_insert ON user_google_tokens;
DROP POLICY IF EXISTS user_google_tokens_update ON user_google_tokens;
DROP POLICY IF EXISTS user_google_tokens_delete ON user_google_tokens;
DROP POLICY IF EXISTS user_google_tokens_service ON user_google_tokens;

-- SELECT: user can only see their own tokens
CREATE POLICY user_google_tokens_select ON user_google_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- INSERT: user can only insert tokens for themselves
CREATE POLICY user_google_tokens_insert ON user_google_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- UPDATE: user can only update their own tokens
CREATE POLICY user_google_tokens_update ON user_google_tokens
  FOR UPDATE USING (auth.uid() = user_id);

-- DELETE: user can only delete their own tokens
CREATE POLICY user_google_tokens_delete ON user_google_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass (for cron jobs and admin operations via createAdminClient)
-- NOTE [H4]: auth.uid() = user_id works only for admin users (user_type='profile')
-- because profiles.id = auth.users.id. Portal users (user_type='portal_user')
-- must access tokens via createAdminClient() (service role) since
-- client_portal_users.id != auth.uid().
CREATE POLICY user_google_tokens_service ON user_google_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ===========================================
-- 3. ALTER meetings — sync columns
-- ===========================================
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS meeting_url_source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS google_sync_status TEXT DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS google_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;

-- Add CHECK constraints separately for idempotent ADD COLUMN IF NOT EXISTS
-- (CHECK inline with ADD COLUMN IF NOT EXISTS would fail if column already exists without the constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meetings_meeting_url_source_check'
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_meeting_url_source_check
      CHECK (meeting_url_source IN ('manual', 'google_meet', 'external'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meetings_google_sync_status_check'
  ) THEN
    ALTER TABLE meetings ADD CONSTRAINT meetings_google_sync_status_check
      CHECK (google_sync_status IN ('synced', 'pending', 'error', 'not_connected'));
  END IF;
END
$$;

-- [C9] Unique constraint parcial on google_event_id (existing column)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_google_event_id
  ON meetings(google_event_id) WHERE google_event_id IS NOT NULL;

-- [R6] Index for retry queries on sync status
CREATE INDEX IF NOT EXISTS idx_meetings_google_sync_status
  ON meetings(google_sync_status);

-- Comments
COMMENT ON COLUMN meetings.google_calendar_id IS 'Google Calendar ID where this meeting is synced';
COMMENT ON COLUMN meetings.meeting_url_source IS 'Origin of meeting_url: manual (user-entered), google_meet (auto-generated), external (zoom/teams/etc)';
COMMENT ON COLUMN meetings.google_sync_status IS 'Sync state with Google Calendar: synced, pending, error, not_connected';
COMMENT ON COLUMN meetings.google_sync_error IS 'Last sync error message (null when synced)';
COMMENT ON COLUMN meetings.timezone IS 'IANA timezone for the meeting (e.g., America/Sao_Paulo)';

-- ===========================================
-- 4. ALTER meeting_participants — email + RSVP
-- (NO google_event_id per R8)
-- ===========================================
ALTER TABLE meeting_participants
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS google_rsvp_status TEXT;

COMMENT ON COLUMN meeting_participants.email IS 'Participant email for Google Calendar invites';
COMMENT ON COLUMN meeting_participants.google_rsvp_status IS 'RSVP status from Google Calendar (accepted, declined, tentative, needsAction)';

-- ===========================================
-- 5. Notify PostgREST to reload schema cache
-- ===========================================
NOTIFY pgrst, 'reload schema';
