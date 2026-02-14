-- Convertfy Admin - Meeting Participants & Calendar Support
-- Migration: 00002_meeting_participants.sql
-- Adds multi-participant support for meetings and new activity types

-- ========================
-- ENUMS
-- ========================

-- Create activity_type enum if it doesn't exist, otherwise add new values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_type') THEN
    CREATE TYPE activity_type AS ENUM (
      'client_created', 'client_updated', 'status_changed',
      'meeting_scheduled', 'meeting_completed',
      'payment_received', 'payment_overdue',
      'report_uploaded', 'note_added',
      'email_sent', 'whatsapp_sent',
      'deal_created', 'deal_updated', 'deal_won', 'deal_lost',
      'meeting_cancelled', 'meeting_no_show', 'meeting_rescheduled'
    );
  ELSE
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'meeting_cancelled';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'meeting_no_show';
    ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'meeting_rescheduled';
  END IF;
END
$$;

-- Role of a participant in a meeting
CREATE TYPE meeting_participant_role AS ENUM ('organizer', 'participant', 'optional');

-- RSVP status for meeting invitations
CREATE TYPE meeting_participant_status AS ENUM ('pending', 'accepted', 'declined', 'tentative');

-- ========================
-- ALTER MEETINGS TABLE
-- ========================

-- Add created_by to track who created the meeting
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);

-- Add updated_at for change tracking
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill created_by with user_id for existing rows
UPDATE meetings SET created_by = user_id WHERE created_by IS NULL;

-- Apply the update_updated_at trigger to meetings
DROP TRIGGER IF EXISTS update_meetings_updated_at ON meetings;
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- MEETING PARTICIPANTS TABLE
-- ========================

CREATE TABLE IF NOT EXISTS meeting_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role meeting_participant_role NOT NULL DEFAULT 'participant',
  status meeting_participant_status NOT NULL DEFAULT 'pending',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Each user can only be added once per meeting
  UNIQUE(meeting_id, user_id)
);

-- ========================
-- INDEXES
-- ========================

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_user ON meeting_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_status ON meeting_participants(status);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON meetings(created_by);

-- ========================
-- ROW LEVEL SECURITY
-- ========================

ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view meeting participants" ON meeting_participants
  FOR SELECT USING (true);

CREATE POLICY "Users can manage meeting participants" ON meeting_participants
  FOR ALL USING (auth.uid() IS NOT NULL);
