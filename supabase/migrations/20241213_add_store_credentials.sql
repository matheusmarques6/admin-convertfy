-- =====================================================
-- MIGRATION: Add Store Credentials (Shopify + Klaviyo)
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. First, ensure client_stores table exists
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

-- 2. Add Shopify credential columns
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS shopify_store_domain VARCHAR(255);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS shopify_api_key VARCHAR(255);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS shopify_api_secret VARCHAR(255);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS shopify_access_token TEXT;

-- 3. Add new Klaviyo credential columns
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS klaviyo_public_key VARCHAR(100);
ALTER TABLE client_stores ADD COLUMN IF NOT EXISTS klaviyo_private_key TEXT;

-- 4. Create index if not exists
CREATE INDEX IF NOT EXISTS idx_client_stores_client_id ON client_stores(client_id);

-- 5. Enable RLS
ALTER TABLE client_stores ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies (drop first if exist)
DROP POLICY IF EXISTS "Allow authenticated users to view stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to insert stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to update stores" ON client_stores;
DROP POLICY IF EXISTS "Allow authenticated users to delete stores" ON client_stores;
DROP POLICY IF EXISTS "Allow all operations on client_stores" ON client_stores;

CREATE POLICY "Allow all operations on client_stores" ON client_stores
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7. Ensure client_subscriptions table exists
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  cycle TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  start_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to client_subscriptions if needed
ALTER TABLE client_subscriptions ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

-- 8. Ensure client_charges table exists
CREATE TABLE IF NOT EXISTS client_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL,
  actual_payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns to client_charges if needed
ALTER TABLE client_charges ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT;

-- 9. Create indexes for subscriptions and charges
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client_id ON client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_charges_client_id ON client_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_client_charges_due_date ON client_charges(due_date);

-- 10. Enable RLS on subscriptions and charges
ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_charges ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS policies for subscriptions
DROP POLICY IF EXISTS "Allow all operations on client_subscriptions" ON client_subscriptions;
CREATE POLICY "Allow all operations on client_subscriptions" ON client_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 12. Create RLS policies for charges
DROP POLICY IF EXISTS "Allow all operations on client_charges" ON client_charges;
CREATE POLICY "Allow all operations on client_charges" ON client_charges
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- DONE! All tables and columns should be ready now.
-- =====================================================
