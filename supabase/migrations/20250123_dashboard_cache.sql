-- Dashboard Report Cache Table
-- Stores cached dashboard data to improve loading performance

CREATE TABLE IF NOT EXISTS dashboard_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  cache_type VARCHAR(50) NOT NULL, -- 'klaviyo' or 'shopify'
  period VARCHAR(20) NOT NULL, -- '7d', '15d', '30d', '90d'
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,

  -- Unique constraint to prevent duplicates
  UNIQUE(store_id, cache_type, period)
);

-- Index for fast lookups
CREATE INDEX idx_dashboard_cache_lookup ON dashboard_cache(store_id, cache_type, period);
CREATE INDEX idx_dashboard_cache_expiry ON dashboard_cache(expires_at);

-- RLS Policies
ALTER TABLE dashboard_cache ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for API)
CREATE POLICY "Service role can manage dashboard cache"
  ON dashboard_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to clean expired cache entries (run periodically)
CREATE OR REPLACE FUNCTION clean_expired_dashboard_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM dashboard_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Comment for documentation
COMMENT ON TABLE dashboard_cache IS 'Cached dashboard data for faster loading. TTL-based expiration.';
