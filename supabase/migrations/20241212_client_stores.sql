-- Create client_stores table for storing store configurations per client
CREATE TABLE IF NOT EXISTS client_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(500),
  platform VARCHAR(100),
  klaviyo_api_key VARCHAR(255),
  klaviyo_list_id VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by client
CREATE INDEX IF NOT EXISTS idx_client_stores_client_id ON client_stores(client_id);

-- Enable RLS
ALTER TABLE client_stores ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all stores
CREATE POLICY "Allow authenticated users to view stores" ON client_stores
  FOR SELECT TO authenticated USING (true);

-- Policy: Allow authenticated users to insert stores
CREATE POLICY "Allow authenticated users to insert stores" ON client_stores
  FOR INSERT TO authenticated WITH CHECK (true);

-- Policy: Allow authenticated users to update stores
CREATE POLICY "Allow authenticated users to update stores" ON client_stores
  FOR UPDATE TO authenticated USING (true);

-- Policy: Allow authenticated users to delete stores
CREATE POLICY "Allow authenticated users to delete stores" ON client_stores
  FOR DELETE TO authenticated USING (true);
