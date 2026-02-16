-- =============================================
-- PIPELINE FILE 03: CAMPAIGN APPROVAL WORKFLOW
-- =============================================
-- Adds: pending_review, approved, rejected to campaign_status enum
-- Adds: submitted_by, submitted_at, reviewed_by, reviewed_at,
--        rejection_reason, approval_notes columns to campaigns
-- Creates: campaign_history table
-- Creates: log_campaign_status_change() function and trigger
-- Creates: campaigns_with_approval view
-- Creates: RLS policies for campaign_history
-- =============================================

BEGIN;

-- Add new status values to the enum
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'approved';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'rejected';

COMMIT;

-- NOTE: ALTER TYPE ADD VALUE cannot run inside a transaction in some PG versions.
-- We commit the enum changes first, then continue with the rest.

BEGIN;

-- Add approval-related fields to campaigns table
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS approval_notes TEXT;

-- Create campaign_history table to track all status changes
CREATE TABLE IF NOT EXISTS campaign_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

  -- Status change
  from_status campaign_status,
  to_status campaign_status NOT NULL,

  -- Who made the change
  changed_by UUID REFERENCES profiles(id),

  -- Additional info
  reason TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient history queries
CREATE INDEX IF NOT EXISTS idx_campaign_history_campaign_id ON campaign_history(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_history_created_at ON campaign_history(created_at);

-- RLS for campaign_history
ALTER TABLE campaign_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign history for accessible stores" ON campaign_history;
CREATE POLICY "Users can view campaign history for accessible stores"
  ON campaign_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_access_store(c.store_id)
    )
  );

DROP POLICY IF EXISTS "Campaign managers can create history" ON campaign_history;
CREATE POLICY "Campaign managers can create history"
  ON campaign_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_manage_store_campaigns(c.store_id)
    )
  );

-- Service role full access
DROP POLICY IF EXISTS "Service role campaign_history" ON campaign_history;
CREATE POLICY "Service role campaign_history"
  ON campaign_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Function to automatically log status changes
CREATE OR REPLACE FUNCTION log_campaign_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO campaign_history (
      campaign_id,
      from_status,
      to_status,
      changed_by,
      reason,
      notes
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      COALESCE(NEW.reviewed_by, NEW.submitted_by, NEW.created_by),
      CASE
        WHEN NEW.status = 'rejected' THEN NEW.rejection_reason
        ELSE NULL
      END,
      CASE
        WHEN NEW.status = 'approved' THEN NEW.approval_notes
        ELSE NULL
      END
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log status changes
DROP TRIGGER IF EXISTS campaign_status_change_trigger ON campaigns;
CREATE TRIGGER campaign_status_change_trigger
  AFTER UPDATE OF status ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION log_campaign_status_change();

-- Create view for campaigns with approval info
CREATE OR REPLACE VIEW campaigns_with_approval AS
SELECT
  c.*,
  submitter.name AS submitted_by_name,
  submitter.email AS submitted_by_email,
  reviewer.name AS reviewed_by_name,
  reviewer.email AS reviewed_by_email,
  (
    SELECT COUNT(*)
    FROM campaign_history ch
    WHERE ch.campaign_id = c.id
  ) AS history_count,
  (
    SELECT json_agg(json_build_object(
      'id', ch.id,
      'from_status', ch.from_status,
      'to_status', ch.to_status,
      'changed_by', ch.changed_by,
      'reason', ch.reason,
      'notes', ch.notes,
      'created_at', ch.created_at
    ) ORDER BY ch.created_at DESC)
    FROM campaign_history ch
    WHERE ch.campaign_id = c.id
    LIMIT 5
  ) AS recent_history
FROM campaigns c
LEFT JOIN profiles submitter ON c.submitted_by = submitter.id
LEFT JOIN profiles reviewer ON c.reviewed_by = reviewer.id;

-- Comments
COMMENT ON TABLE campaign_history IS 'Tracks all status changes for campaigns';
COMMENT ON COLUMN campaigns.submitted_by IS 'User who submitted the campaign for review';
COMMENT ON COLUMN campaigns.submitted_at IS 'When the campaign was submitted for review';
COMMENT ON COLUMN campaigns.reviewed_by IS 'User who approved or rejected the campaign';
COMMENT ON COLUMN campaigns.reviewed_at IS 'When the campaign was reviewed';
COMMENT ON COLUMN campaigns.rejection_reason IS 'Reason for rejection if campaign was rejected';
COMMENT ON COLUMN campaigns.approval_notes IS 'Notes from reviewer when approving';

COMMIT;

-- =============================================
-- 03_campaign_approval.sql DONE
-- =============================================
