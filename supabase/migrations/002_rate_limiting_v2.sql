-- Migration: Optimized Rate Limiting System v2
-- Description: Sliding window rate limiting with IP + identifier support
-- Date: 2024

-- ============================================
-- 1. DROP OLD TABLES (if migrating)
-- ============================================

DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS rate_limit_config CASCADE;

-- ============================================
-- 2. OPTIMIZED RATE LIMIT TABLE
-- ============================================

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL,           -- email, user_id, etc.
  ip_address TEXT,                    -- optional IP for dual-key limiting
  action_type TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 1,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite index for fast lookups (identifier + action + optional IP)
CREATE UNIQUE INDEX idx_rate_limits_lookup
  ON rate_limits(identifier, action_type, COALESCE(ip_address, ''));

-- Index for IP-only lookups
CREATE INDEX idx_rate_limits_ip ON rate_limits(ip_address, action_type)
  WHERE ip_address IS NOT NULL;

-- Index for cleanup
CREATE INDEX idx_rate_limits_cleanup ON rate_limits(updated_at);

-- ============================================
-- 3. RATE LIMIT RULES (in-memory optimized)
-- ============================================

-- Using a simpler approach: embed rules in function for speed
-- Rules are: action_type -> (max_attempts, window_seconds, block_seconds)

CREATE OR REPLACE FUNCTION get_rate_limit_rule(p_action_type TEXT)
RETURNS TABLE (
  max_attempts INTEGER,
  window_seconds INTEGER,
  block_seconds INTEGER
)
LANGUAGE sql
IMMUTABLE  -- Can be cached by PostgreSQL
AS $$
  SELECT
    CASE p_action_type
      WHEN 'password_reset' THEN 3
      WHEN 'login_attempt' THEN 5
      WHEN 'api_call' THEN 100
      WHEN 'ip_global' THEN 20  -- Global IP limit
      ELSE 10
    END::INTEGER as max_attempts,
    CASE p_action_type
      WHEN 'password_reset' THEN 900   -- 15 min
      WHEN 'login_attempt' THEN 900    -- 15 min
      WHEN 'api_call' THEN 60          -- 1 min
      WHEN 'ip_global' THEN 300        -- 5 min
      ELSE 300
    END::INTEGER as window_seconds,
    CASE p_action_type
      WHEN 'password_reset' THEN 1800  -- 30 min block
      WHEN 'login_attempt' THEN 900    -- 15 min block
      WHEN 'api_call' THEN 300         -- 5 min block
      WHEN 'ip_global' THEN 600        -- 10 min block
      ELSE 300
    END::INTEGER as block_seconds;
$$;

-- ============================================
-- 4. SINGLE ATOMIC RATE LIMIT CHECK + RECORD
-- ============================================

-- This is the main function: check AND record in a single call
CREATE OR REPLACE FUNCTION rate_limit_check(
  p_identifier TEXT,
  p_action_type TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after INTEGER,
  is_blocked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule RECORD;
  v_record rate_limits%ROWTYPE;
  v_window_start TIMESTAMPTZ;
  v_now TIMESTAMPTZ := NOW();
  v_ip_key TEXT := COALESCE(p_ip_address, '');
  v_is_blocked BOOLEAN := FALSE;
  v_remaining INTEGER;
  v_retry INTEGER := 0;
BEGIN
  -- Get rule (cached by PostgreSQL due to IMMUTABLE)
  SELECT * INTO v_rule FROM get_rate_limit_rule(p_action_type);

  -- Calculate sliding window start
  v_window_start := v_now - (v_rule.window_seconds || ' seconds')::INTERVAL;

  -- Try to get existing record with row lock
  SELECT * INTO v_record
  FROM rate_limits
  WHERE identifier = p_identifier
    AND action_type = p_action_type
    AND COALESCE(ip_address, '') = v_ip_key
  FOR UPDATE SKIP LOCKED;  -- Non-blocking for concurrent requests

  -- No existing record: create new one
  IF NOT FOUND THEN
    INSERT INTO rate_limits (identifier, action_type, ip_address, attempts, window_start)
    VALUES (p_identifier, p_action_type, NULLIF(p_ip_address, ''), 1, v_now)
    ON CONFLICT (identifier, action_type, COALESCE(ip_address, ''))
    DO UPDATE SET
      attempts = 1,
      window_start = v_now,
      blocked_until = NULL,
      updated_at = v_now;

    RETURN QUERY SELECT TRUE, v_rule.max_attempts - 1, 0, FALSE;
    RETURN;
  END IF;

  -- Check if currently blocked
  IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    v_retry := EXTRACT(EPOCH FROM (v_record.blocked_until - v_now))::INTEGER;
    RETURN QUERY SELECT FALSE, 0, v_retry, TRUE;
    RETURN;
  END IF;

  -- Check if window expired (sliding window reset)
  IF v_record.window_start < v_window_start THEN
    -- Reset: window expired
    UPDATE rate_limits SET
      attempts = 1,
      window_start = v_now,
      blocked_until = NULL,
      updated_at = v_now
    WHERE id = v_record.id;

    RETURN QUERY SELECT TRUE, v_rule.max_attempts - 1, 0, FALSE;
    RETURN;
  END IF;

  -- Within window: check attempts
  IF v_record.attempts >= v_rule.max_attempts THEN
    -- Block the user
    UPDATE rate_limits SET
      blocked_until = v_now + (v_rule.block_seconds || ' seconds')::INTERVAL,
      updated_at = v_now
    WHERE id = v_record.id;

    RETURN QUERY SELECT FALSE, 0, v_rule.block_seconds, TRUE;
    RETURN;
  END IF;

  -- Increment attempts
  UPDATE rate_limits SET
    attempts = attempts + 1,
    updated_at = v_now
  WHERE id = v_record.id;

  v_remaining := v_rule.max_attempts - v_record.attempts - 1;

  RETURN QUERY SELECT TRUE, v_remaining, 0, FALSE;
END;
$$;

-- ============================================
-- 5. DUAL-KEY RATE LIMITING (IP + Identifier)
-- ============================================

-- Check both IP and identifier limits in one call
CREATE OR REPLACE FUNCTION rate_limit_dual_check(
  p_identifier TEXT,
  p_action_type TEXT,
  p_ip_address TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after INTEGER,
  blocked_by TEXT  -- 'ip', 'identifier', or NULL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip_result RECORD;
  v_id_result RECORD;
BEGIN
  -- Check IP-based global limit first (faster to reject bots)
  IF p_ip_address IS NOT NULL AND p_ip_address != '' THEN
    SELECT * INTO v_ip_result
    FROM rate_limit_check(p_ip_address, 'ip_global', NULL);

    IF NOT v_ip_result.allowed THEN
      RETURN QUERY SELECT FALSE, 0, v_ip_result.retry_after, 'ip'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check identifier-based limit
  SELECT * INTO v_id_result
  FROM rate_limit_check(p_identifier, p_action_type, p_ip_address);

  IF NOT v_id_result.allowed THEN
    RETURN QUERY SELECT FALSE, 0, v_id_result.retry_after, 'identifier'::TEXT;
    RETURN;
  END IF;

  -- Both passed
  RETURN QUERY SELECT TRUE, v_id_result.remaining, 0, NULL::TEXT;
END;
$$;

-- ============================================
-- 6. CLEAR RATE LIMIT
-- ============================================

CREATE OR REPLACE FUNCTION rate_limit_clear(
  p_identifier TEXT,
  p_action_type TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM rate_limits
  WHERE identifier = p_identifier
    AND action_type = p_action_type
    AND COALESCE(ip_address, '') = COALESCE(p_ip_address, '');
$$;

-- ============================================
-- 7. PASSWORD RESET AUDIT (unchanged)
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  account_type TEXT,
  action TEXT NOT NULL,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_audit_email
  ON password_reset_audit(email);
CREATE INDEX IF NOT EXISTS idx_password_reset_audit_ip
  ON password_reset_audit(ip_address) WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_audit_created
  ON password_reset_audit(created_at DESC);

-- ============================================
-- 8. RLS POLICIES
-- ============================================

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_audit ENABLE ROW LEVEL SECURITY;

-- Rate limits: service role only (via SECURITY DEFINER functions)
CREATE POLICY "Service role manages rate limits"
  ON rate_limits FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Audit: admins can view, system can insert
CREATE POLICY "Admins view audit"
  ON password_reset_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "System inserts audit"
  ON password_reset_audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- 9. CLEANUP (for pg_cron or manual)
-- ============================================

CREATE OR REPLACE FUNCTION rate_limit_cleanup()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH deleted AS (
    DELETE FROM rate_limits
    WHERE updated_at < NOW() - INTERVAL '24 hours'
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM deleted;
$$;
