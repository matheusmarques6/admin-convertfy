-- Add language column to client_stores for campaign targeting
-- This enables quick filters like "all Portuguese stores", "all English stores", etc.

ALTER TABLE client_stores
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'pt-BR';

-- Add comment for documentation
COMMENT ON COLUMN client_stores.language IS 'Store language/locale for campaign targeting: pt-BR, en-US, es, etc.';

-- Create index for faster filtering by language
CREATE INDEX IF NOT EXISTS idx_client_stores_language ON client_stores(language);
