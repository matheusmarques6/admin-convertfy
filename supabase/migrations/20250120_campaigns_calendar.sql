-- Campaigns Calendar System
-- Sistema de calendário de campanhas para visualizar e gerenciar campanhas por loja

-- Campaign status enum
CREATE TYPE campaign_status AS ENUM ('draft', 'scheduled', 'sent', 'cancelled');

-- Campaign channel enum
CREATE TYPE campaign_channel AS ENUM ('email', 'sms', 'push', 'whatsapp');

-- Campaign type enum
CREATE TYPE campaign_type AS ENUM ('promotional', 'newsletter', 'transactional', 'automation', 'seasonal', 'launch', 'other');

-- Campaigns table
CREATE TABLE campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Store relationship
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Campaign info
  name TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  scheduled_date DATE NOT NULL,
  scheduled_time TIME,
  send_datetime TIMESTAMPTZ,

  -- Campaign details
  channel campaign_channel NOT NULL DEFAULT 'email',
  campaign_type campaign_type NOT NULL DEFAULT 'promotional',
  status campaign_status NOT NULL DEFAULT 'draft',

  -- Content
  subject_line TEXT,
  preview_text TEXT,
  template_id TEXT, -- External template ID (Klaviyo, etc.)

  -- Targeting
  segment_id TEXT, -- External segment ID
  segment_name TEXT,
  estimated_recipients INTEGER,

  -- Performance metrics (synced from Klaviyo/external)
  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  opened INTEGER DEFAULT 0,
  clicked INTEGER DEFAULT 0,
  converted INTEGER DEFAULT 0,
  revenue DECIMAL(12, 2) DEFAULT 0,

  -- External IDs for syncing
  klaviyo_campaign_id TEXT,
  external_id TEXT,

  -- Tags and categorization
  tags TEXT[] DEFAULT '{}',
  color TEXT DEFAULT '#3b82f6', -- For calendar display

  -- Notes and tracking
  notes TEXT,
  created_by UUID REFERENCES profiles(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_campaigns_store_id ON campaigns(store_id);
CREATE INDEX idx_campaigns_client_id ON campaigns(client_id);
CREATE INDEX idx_campaigns_scheduled_date ON campaigns(scheduled_date);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_campaigns_channel ON campaigns(channel);
CREATE INDEX idx_campaigns_klaviyo_id ON campaigns(klaviyo_campaign_id);

-- Composite index for calendar queries (date range + store)
CREATE INDEX idx_campaigns_calendar ON campaigns(scheduled_date, store_id, status);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_campaigns_updated_at();

-- RLS Policies
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Allow users to view campaigns for stores they can access
CREATE POLICY "Users can view campaigns for accessible stores"
  ON campaigns FOR SELECT
  TO authenticated
  USING (can_access_store(store_id));

-- Allow users to create campaigns for stores they can manage
CREATE POLICY "Users can create campaigns for managed stores"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK (can_manage_store_campaigns(store_id));

-- Allow users to update campaigns for stores they can manage
CREATE POLICY "Users can update campaigns for managed stores"
  ON campaigns FOR UPDATE
  TO authenticated
  USING (can_manage_store_campaigns(store_id))
  WITH CHECK (can_manage_store_campaigns(store_id));

-- Allow users to delete campaigns for stores they can manage
CREATE POLICY "Users can delete campaigns for managed stores"
  ON campaigns FOR DELETE
  TO authenticated
  USING (can_manage_store_campaigns(store_id));

-- Comments
COMMENT ON TABLE campaigns IS 'Stores campaign information for the calendar system';
COMMENT ON COLUMN campaigns.scheduled_date IS 'Date the campaign is scheduled to be sent';
COMMENT ON COLUMN campaigns.send_datetime IS 'Full datetime when campaign was/will be sent';
COMMENT ON COLUMN campaigns.klaviyo_campaign_id IS 'External Klaviyo campaign ID for syncing';
COMMENT ON COLUMN campaigns.color IS 'Color for calendar display, hex format';
