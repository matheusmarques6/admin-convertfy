-- Fix RLS policy for campaign_batches
-- The original policy checked for 'super_admin' which doesn't exist in the user_role enum

-- Drop the existing policies that reference 'super_admin'
DROP POLICY IF EXISTS "Admin full access to campaign_batches" ON campaign_batches;

-- Recreate the admin policy with only valid roles
CREATE POLICY "Admin full access to campaign_batches"
  ON campaign_batches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Also ensure service role policy exists
DROP POLICY IF EXISTS "Service role full access to campaign_batches" ON campaign_batches;

CREATE POLICY "Service role full access to campaign_batches"
  ON campaign_batches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
