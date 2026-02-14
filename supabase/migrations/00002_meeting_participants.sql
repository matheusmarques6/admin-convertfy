-- Convertfy Admin - Meeting Participants & Calendar Support
-- Migration: 00002_meeting_participants.sql
-- Adds multi-participant support for meetings and new activity types

-- ========================
-- ENUMS
-- ========================

-- Role of a participant in a meeting
CREATE TYPE meeting_participant_role AS ENUM ('organizer', 'participant', 'optional');

-- RSVP status for meeting invitations
CREATE TYPE meeting_participant_status AS ENUM ('pending', 'accepted', 'declined', 'tentative');

-- Add new activity types for meeting lifecycle events
ALTER TYPE activity_type ADD VALUE 'meeting_cancelled';
ALTER TYPE activity_type ADD VALUE 'meeting_no_show';
ALTER TYPE activity_type ADD VALUE 'meeting_rescheduled';

-- ========================
-- ALTER MEETINGS TABLE
-- ========================

-- Add created_by to track who created the meeting (distinct from user_id which is legacy)
ALTER TABLE meetings ADD COLUMN created_by UUID REFERENCES profiles(id);

-- Add updated_at for change tracking
ALTER TABLE meetings ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Backfill created_by with user_id for existing rows
UPDATE meetings SET created_by = user_id WHERE created_by IS NULL;

-- Apply the update_updated_at trigger to meetings
CREATE TRIGGER update_meetings_updated_at
  BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ========================
-- MEETING PARTICIPANTS TABLE
-- ========================

CREATE TABLE meeting_participants (
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

CREATE INDEX idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_user ON meeting_participants(user_id);
CREATE INDEX idx_meeting_participants_status ON meeting_participants(status);
CREATE INDEX idx_meetings_created_by ON meetings(created_by);

-- ========================
-- ROW LEVEL SECURITY
-- ========================

ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

-- Everyone can view participants (needed for calendar display)
CREATE POLICY "Users can view meeting participants" ON meeting_participants
  FOR SELECT USING (true);

-- Authenticated users can manage participants
CREATE POLICY "Users can manage meeting participants" ON meeting_participants
  FOR ALL USING (auth.uid() IS NOT NULL);
