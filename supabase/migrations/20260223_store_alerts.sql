-- Migration: Store Alerts System
-- Date: 2026-02-23
-- Description: Alert system for monitoring store health (revenue, Klaviyo, campaigns, recovery rate)

-- Add alert threshold column to client_stores
ALTER TABLE client_stores
ADD COLUMN IF NOT EXISTS alert_revenue_threshold INTEGER DEFAULT 30;

COMMENT ON COLUMN client_stores.alert_revenue_threshold IS 'Percentage drop threshold to trigger low revenue alert (default 30%)';

-- Store Alerts table
CREATE TABLE IF NOT EXISTS store_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('low_revenue', 'klaviyo_account_error', 'campaign_failure', 'low_recovery_rate')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  metadata JSONB DEFAULT '{}',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_store_alerts_store_id ON store_alerts(store_id);
CREATE INDEX IF NOT EXISTS idx_store_alerts_client_id ON store_alerts(client_id);
CREATE INDEX IF NOT EXISTS idx_store_alerts_status ON store_alerts(status);
CREATE INDEX IF NOT EXISTS idx_store_alerts_type ON store_alerts(type);
CREATE INDEX IF NOT EXISTS idx_store_alerts_created_at ON store_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_alerts_store_status ON store_alerts(store_id, status);

-- RLS
ALTER TABLE store_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_store_alerts" ON store_alerts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_store_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_store_alerts_updated_at
  BEFORE UPDATE ON store_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_store_alerts_updated_at();
