-- Migration: Add feedback/call control to client_stores
-- Date: 2025-01-07

-- Add feedback control columns to client_stores
ALTER TABLE client_stores
ADD COLUMN IF NOT EXISTS feedback_frequency TEXT DEFAULT 'monthly' CHECK (feedback_frequency IN ('monthly', '30_days')),
ADD COLUMN IF NOT EXISTS last_feedback_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_feedback_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_feedback_by UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS feedback_notes TEXT;

-- Create a table to track feedback call history
CREATE TABLE IF NOT EXISTS store_feedback_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conducted_by UUID NOT NULL REFERENCES profiles(id),
  conducted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_minutes INTEGER,
  notes TEXT,
  action_items TEXT,
  next_call_date TIMESTAMPTZ,
  result_percentage DECIMAL(5,2), -- Store the result % at the time of the call
  klaviyo_revenue DECIMAL(15,2),
  total_revenue DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_store_feedback_calls_store_id ON store_feedback_calls(store_id);
CREATE INDEX IF NOT EXISTS idx_store_feedback_calls_client_id ON store_feedback_calls(client_id);
CREATE INDEX IF NOT EXISTS idx_store_feedback_calls_conducted_at ON store_feedback_calls(conducted_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_stores_next_feedback ON client_stores(next_feedback_date);

-- Enable RLS
ALTER TABLE store_feedback_calls ENABLE ROW LEVEL SECURITY;

-- RLS Policies for store_feedback_calls
CREATE POLICY "Users can view all feedback calls" ON store_feedback_calls
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert feedback calls" ON store_feedback_calls
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Users can update feedback calls" ON store_feedback_calls
  FOR UPDATE TO authenticated USING (true);

-- Function to automatically update next_feedback_date based on frequency
CREATE OR REPLACE FUNCTION update_next_feedback_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Update client_stores with the last feedback info
  UPDATE client_stores
  SET
    last_feedback_date = NEW.conducted_at,
    last_feedback_by = NEW.conducted_by,
    feedback_notes = NEW.notes,
    next_feedback_date = CASE
      WHEN feedback_frequency = 'monthly' THEN
        DATE_TRUNC('month', NEW.conducted_at) + INTERVAL '1 month'
      ELSE
        NEW.conducted_at + INTERVAL '30 days'
    END
  WHERE id = NEW.store_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update next_feedback_date when a new feedback call is inserted
DROP TRIGGER IF EXISTS trigger_update_next_feedback ON store_feedback_calls;
CREATE TRIGGER trigger_update_next_feedback
  AFTER INSERT ON store_feedback_calls
  FOR EACH ROW
  EXECUTE FUNCTION update_next_feedback_date();

-- Comment on columns
COMMENT ON COLUMN client_stores.feedback_frequency IS 'Frequency of feedback calls: monthly (1st of each month) or 30_days (rolling 30 days)';
COMMENT ON COLUMN client_stores.last_feedback_date IS 'Date of the last feedback call';
COMMENT ON COLUMN client_stores.next_feedback_date IS 'Date of the next scheduled feedback call';
COMMENT ON COLUMN client_stores.last_feedback_by IS 'User who conducted the last feedback call';
COMMENT ON TABLE store_feedback_calls IS 'History of feedback calls for each store';
