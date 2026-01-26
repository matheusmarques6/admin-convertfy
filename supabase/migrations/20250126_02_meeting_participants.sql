-- ========================
-- MEETING PARTICIPANTS
-- Supports multiple attendees per meeting including org members (agents)
-- ========================

-- Enum for participant type
CREATE TYPE meeting_participant_type AS ENUM ('profile', 'org_member');

-- Enum for response status
CREATE TYPE meeting_response_status AS ENUM ('pending', 'accepted', 'declined', 'tentative');

-- Meeting participants table
CREATE TABLE meeting_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  participant_id UUID NOT NULL,
  participant_type meeting_participant_type NOT NULL DEFAULT 'profile',
  is_organizer BOOLEAN DEFAULT false,
  response_status meeting_response_status DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique participant per meeting
  UNIQUE(meeting_id, participant_id, participant_type)
);

-- Indexes for efficient queries
CREATE INDEX idx_meeting_participants_meeting_id ON meeting_participants(meeting_id);
CREATE INDEX idx_meeting_participants_participant ON meeting_participants(participant_id, participant_type);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_meeting_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_meeting_participants_updated_at
  BEFORE UPDATE ON meeting_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_participants_updated_at();

-- RLS Policies
ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

-- View policy: Allow authenticated users to view meeting participants
CREATE POLICY "meeting_participants_select_policy" ON meeting_participants
  FOR SELECT TO authenticated
  USING (true);

-- Insert policy: Allow authenticated users to add participants
CREATE POLICY "meeting_participants_insert_policy" ON meeting_participants
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Update policy: Allow authenticated users to update participants
CREATE POLICY "meeting_participants_update_policy" ON meeting_participants
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Delete policy: Allow authenticated users to remove participants
CREATE POLICY "meeting_participants_delete_policy" ON meeting_participants
  FOR DELETE TO authenticated
  USING (true);

-- Migrate existing meetings: Add the user_id as the organizer participant
INSERT INTO meeting_participants (meeting_id, participant_id, participant_type, is_organizer, response_status)
SELECT id, user_id, 'profile', true, 'accepted'
FROM meetings
ON CONFLICT DO NOTHING;

-- Add comment explaining the table
COMMENT ON TABLE meeting_participants IS 'Stores meeting participants. participant_id references profiles.id when participant_type is profile, or org_members.id when participant_type is org_member';
