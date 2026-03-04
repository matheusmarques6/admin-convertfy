-- Add org_id to email_logs for multi-tenant isolation
-- Story 15.3

ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Index for tenant-filtered queries
CREATE INDEX IF NOT EXISTS idx_email_logs_org_id
  ON email_logs(org_id, created_at DESC);

-- Recreate SELECT policy with tenant filter
DROP POLICY IF EXISTS "email_logs_select_admin" ON email_logs;

CREATE POLICY "email_logs_select_admin" ON email_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'manager')
    )
    AND (org_id = current_org_id() OR org_id IS NULL)
  );

-- INSERT policy: unchanged — all inserts use createAdminClient() (bypasses RLS)
-- org_id enforcement is at application level, not RLS level
COMMENT ON COLUMN email_logs.org_id IS
  'Organization tenant ID. Set by application code on insert. NULL = legacy/system logs.';
