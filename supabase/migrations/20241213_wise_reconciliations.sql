-- Wise Reconciliations Table
-- Stores reconciliation data between Wise transactions and clients

CREATE TABLE IF NOT EXISTS wise_reconciliations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_reference TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  amount DECIMAL(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  reconciled_by UUID NOT NULL REFERENCES profiles(id),
  reconciled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_wise_reconciliations_client_id ON wise_reconciliations(client_id);
CREATE INDEX IF NOT EXISTS idx_wise_reconciliations_transaction_date ON wise_reconciliations(transaction_date);
CREATE INDEX IF NOT EXISTS idx_wise_reconciliations_transaction_reference ON wise_reconciliations(transaction_reference);

-- Enable RLS
ALTER TABLE wise_reconciliations ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view wise reconciliations"
  ON wise_reconciliations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert wise reconciliations"
  ON wise_reconciliations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update wise reconciliations"
  ON wise_reconciliations
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete wise reconciliations"
  ON wise_reconciliations
  FOR DELETE
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_wise_reconciliations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_wise_reconciliations_updated_at
  BEFORE UPDATE ON wise_reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION update_wise_reconciliations_updated_at();
