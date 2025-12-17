-- Add currency column to client_stores table
ALTER TABLE client_stores
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'BRL';

-- Add comment to explain the column
COMMENT ON COLUMN client_stores.currency IS 'Currency code for the store (e.g., BRL, USD, EUR)';
