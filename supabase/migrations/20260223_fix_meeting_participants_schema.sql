-- ============================================================
-- FIX: Migrate meeting_participants from old schema to new schema
-- Old: user_id, role (enum), status (enum)
-- New: participant_id, participant_type (enum), is_organizer (bool), response_status (enum)
-- ============================================================

-- 1. Create new enums (if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_participant_type') THEN
    CREATE TYPE meeting_participant_type AS ENUM ('profile', 'org_member');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'meeting_response_status') THEN
    CREATE TYPE meeting_response_status AS ENUM ('pending', 'accepted', 'declined', 'tentative');
  END IF;
END
$$;

-- 2. Add new columns
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS participant_id UUID;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS participant_type meeting_participant_type DEFAULT 'profile';
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS is_organizer BOOLEAN DEFAULT false;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS response_status meeting_response_status DEFAULT 'pending';
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE meeting_participants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 3. Migrate data from old columns to new columns
UPDATE meeting_participants
SET
  participant_id = user_id,
  participant_type = 'profile',
  is_organizer = (role = 'organizer'),
  response_status = status::text::meeting_response_status
WHERE participant_id IS NULL AND user_id IS NOT NULL;

-- 4. Make participant_id NOT NULL after migration
ALTER TABLE meeting_participants ALTER COLUMN participant_id SET NOT NULL;

-- 5. Drop old unique constraint and add new one
ALTER TABLE meeting_participants DROP CONSTRAINT IF EXISTS meeting_participants_meeting_id_user_id_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'meeting_participants_meeting_id_participant_id_participant_key'
  ) THEN
    ALTER TABLE meeting_participants ADD CONSTRAINT meeting_participants_meeting_id_participant_id_participant_key
      UNIQUE(meeting_id, participant_id, participant_type);
  END IF;
END
$$;

-- 6. Drop old columns (after confirming migration)
ALTER TABLE meeting_participants DROP COLUMN IF EXISTS user_id;
ALTER TABLE meeting_participants DROP COLUMN IF EXISTS role;
ALTER TABLE meeting_participants DROP COLUMN IF EXISTS status;
ALTER TABLE meeting_participants DROP COLUMN IF EXISTS responded_at;

-- 7. Drop old enum types (no longer needed)
DROP TYPE IF EXISTS meeting_participant_role;
DROP TYPE IF EXISTS meeting_participant_status;

-- 8. Add new indexes
CREATE INDEX IF NOT EXISTS idx_meeting_participants_participant
  ON meeting_participants(participant_id, participant_type);

-- 9. Add updated_at trigger
CREATE OR REPLACE FUNCTION update_meeting_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_meeting_participants_updated_at ON meeting_participants;
CREATE TRIGGER trigger_meeting_participants_updated_at
  BEFORE UPDATE ON meeting_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_meeting_participants_updated_at();

-- 10. Update RLS policies
DROP POLICY IF EXISTS "Users can view meeting participants" ON meeting_participants;
DROP POLICY IF EXISTS "Users can manage meeting participants" ON meeting_participants;

CREATE POLICY "meeting_participants_select_policy" ON meeting_participants
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "meeting_participants_insert_policy" ON meeting_participants
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "meeting_participants_update_policy" ON meeting_participants
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "meeting_participants_delete_policy" ON meeting_participants
  FOR DELETE TO authenticated USING (true);

-- 11. Add table comment
COMMENT ON TABLE meeting_participants IS 'Stores meeting participants. participant_id references profiles.id when participant_type is profile, or org_members.id when participant_type is org_member';

-- 12. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
