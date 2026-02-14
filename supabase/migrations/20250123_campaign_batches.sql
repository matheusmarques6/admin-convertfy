-- Campaign Batches Table (Multi-tenant)
-- Stores campaign batches created by admin for multiple stores
-- Clients can see campaigns for their stores but NOT the instructions doc

CREATE TABLE IF NOT EXISTS campaign_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Information
  name VARCHAR(255) NOT NULL,
  campaign_type VARCHAR(50) NOT NULL, -- 'email', 'sms', 'push', 'whatsapp'

  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,

  -- Instructions Document (INTERNAL - not visible to clients)
  instructions_doc_url TEXT,

  -- Selected Stores (array of store IDs)
  store_ids UUID[] NOT NULL,

  -- Status tracking
  status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'processing', 'completed', 'failed', 'cancelled'

  -- Internal notes (not visible to clients)
  notes TEXT,

  -- Audit fields
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Webhook integration (future)
  webhook_sent_at TIMESTAMPTZ,
  webhook_response JSONB
);

-- Indexes for performance
CREATE INDEX idx_campaign_batches_scheduled ON campaign_batches(scheduled_at);
CREATE INDEX idx_campaign_batches_status ON campaign_batches(status);
CREATE INDEX idx_campaign_batches_store_ids ON campaign_batches USING GIN(store_ids);
CREATE INDEX idx_campaign_batches_created_by ON campaign_batches(created_by);

-- Enable RLS
ALTER TABLE campaign_batches ENABLE ROW LEVEL SECURITY;

-- Policy: Admin/Super Admin has full access
CREATE POLICY "Admin full access to campaign_batches"
  ON campaign_batches
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'super_admin')
    )
  );

-- Policy: Portal users can SELECT campaigns for their stores
-- IMPORTANT: This only grants SELECT, not full access
-- The instructions_doc_url will be filtered at the API level
CREATE POLICY "Portal users can view campaigns for their stores"
  ON campaign_batches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM client_portal_users cpu
      JOIN client_stores cs ON cs.client_id = cpu.client_id
      WHERE cpu.auth_user_id = auth.uid()
      AND cpu.is_active = true
      AND cs.id = ANY(campaign_batches.store_ids)
    )
  );

-- Policy: Service role has full access (for API operations)
CREATE POLICY "Service role full access to campaign_batches"
  ON campaign_batches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_campaign_batches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating updated_at
CREATE TRIGGER trigger_campaign_batches_updated_at
  BEFORE UPDATE ON campaign_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_batches_updated_at();

-- Comments for documentation
COMMENT ON TABLE campaign_batches IS 'Multi-tenant campaign batches. Admin creates, clients view only their stores campaigns.';
COMMENT ON COLUMN campaign_batches.instructions_doc_url IS 'INTERNAL: Google Docs link with copy instructions. NOT visible to clients.';
COMMENT ON COLUMN campaign_batches.notes IS 'INTERNAL: Admin notes. NOT visible to clients.';
COMMENT ON COLUMN campaign_batches.store_ids IS 'Array of client_stores IDs that will receive this campaign.';
