-- =====================================================
-- MIGRATION: Fix Client Creation and Add Financial Tables
-- Run this in your Supabase SQL Editor
-- =====================================================

-- 1. Fix the clients table foreign key constraint
-- This allows creating clients without requiring a profile entry
ALTER TABLE clients
DROP CONSTRAINT IF EXISTS clients_owner_id_fkey;

ALTER TABLE clients
ADD CONSTRAINT clients_owner_id_fkey
FOREIGN KEY (owner_id)
REFERENCES profiles(id)
ON DELETE SET NULL;

-- Make owner_id nullable if it isn't already
ALTER TABLE clients ALTER COLUMN owner_id DROP NOT NULL;

-- 2. Add missing columns to clients table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'cpf_cnpj') THEN
    ALTER TABLE clients ADD COLUMN cpf_cnpj TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'asaas_customer_id') THEN
    ALTER TABLE clients ADD COLUMN asaas_customer_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'address') THEN
    ALTER TABLE clients ADD COLUMN address JSONB;
  END IF;
END $$;

-- 3. Create client_subscriptions table for local subscription management
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  cycle TEXT NOT NULL CHECK (cycle IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('asaas', 'pix_direto', 'wise', 'boleto')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'cancelled')),
  start_date DATE NOT NULL,
  next_due_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create client_charges table for local charge management
CREATE TABLE IF NOT EXISTS client_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES client_subscriptions(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('asaas', 'pix_direto', 'wise', 'boleto', 'cartao')),
  actual_payment_method TEXT, -- Used when payment was made via different method
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_client_id ON client_subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_status ON client_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_client_charges_client_id ON client_charges(client_id);
CREATE INDEX IF NOT EXISTS idx_client_charges_status ON client_charges(status);
CREATE INDEX IF NOT EXISTS idx_client_charges_due_date ON client_charges(due_date);

-- 6. Enable RLS on new tables
ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_charges ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for client_subscriptions
CREATE POLICY "Allow all operations on client_subscriptions" ON client_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 8. Create RLS policies for client_charges
CREATE POLICY "Allow all operations on client_charges" ON client_charges
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 9. Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_client_subscriptions_updated_at ON client_subscriptions;
CREATE TRIGGER update_client_subscriptions_updated_at
  BEFORE UPDATE ON client_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_client_charges_updated_at ON client_charges;
CREATE TRIGGER update_client_charges_updated_at
  BEFORE UPDATE ON client_charges
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- DONE! Client creation should work now.
-- =====================================================
