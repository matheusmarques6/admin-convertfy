-- Migration: Rate Limiting System
-- Description: Adds rate limiting for sensitive operations (password reset, login attempts)
-- Date: 2024

-- ============================================
-- 1. RATE LIMIT TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT NOT NULL, -- email, IP, or user_id
  action_type TEXT NOT NULL, -- 'password_reset', 'login_attempt', 'api_call'
  attempts INTEGER DEFAULT 1,
  first_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ DEFAULT NOW(),
  blocked_until TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);

-- Unique constraint for identifier + action combination
CREATE UNIQUE INDEX idx_rate_limits_unique
  ON rate_limits(identifier, action_type);

-- Index for cleanup of old records
CREATE INDEX idx_rate_limits_cleanup
  ON rate_limits(last_attempt_at);

-- ============================================
-- 2. RATE LIMIT CONFIGURATION
-- ============================================

-- Configuration table for rate limit rules
CREATE TABLE IF NOT EXISTS rate_limit_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type TEXT UNIQUE NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  window_minutes INTEGER NOT NULL DEFAULT 15,
  block_duration_minutes INTEGER NOT NULL DEFAULT 30,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configurations
INSERT INTO rate_limit_config (action_type, max_attempts, window_minutes, block_duration_minutes)
VALUES
  ('password_reset', 3, 15, 30),      -- 3 attempts per 15 min, block for 30 min
  ('login_attempt', 5, 15, 15),       -- 5 attempts per 15 min, block for 15 min
  ('api_call', 100, 1, 5)             -- 100 calls per minute, block for 5 min
ON CONFLICT (action_type) DO NOTHING;

-- ============================================
-- 3. RATE LIMIT FUNCTIONS
-- ============================================

-- Function to check if an action is rate limited
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT
)
RETURNS TABLE (
  is_limited BOOLEAN,
  remaining_attempts INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config rate_limit_config%ROWTYPE;
  v_limit rate_limits%ROWTYPE;
  v_window_start TIMESTAMPTZ;
  v_remaining INTEGER;
  v_retry_seconds INTEGER;
BEGIN
  -- Get configuration for this action type
  SELECT * INTO v_config
  FROM rate_limit_config
  WHERE action_type = p_action_type AND enabled = TRUE;

  -- If no config found, allow the action
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 999, 0;
    RETURN;
  END IF;

  -- Calculate window start time
  v_window_start := NOW() - (v_config.window_minutes || ' minutes')::INTERVAL;

  -- Get current rate limit record
  SELECT * INTO v_limit
  FROM rate_limits
  WHERE identifier = p_identifier
    AND action_type = p_action_type;

  -- No record exists, action is allowed
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, v_config.max_attempts, 0;
    RETURN;
  END IF;

  -- Check if currently blocked
  IF v_limit.blocked_until IS NOT NULL AND v_limit.blocked_until > NOW() THEN
    v_retry_seconds := EXTRACT(EPOCH FROM (v_limit.blocked_until - NOW()))::INTEGER;
    RETURN QUERY SELECT TRUE, 0, v_retry_seconds;
    RETURN;
  END IF;

  -- Check if first attempt is outside the window (reset counter)
  IF v_limit.first_attempt_at < v_window_start THEN
    -- Reset will happen on record_rate_limit call
    RETURN QUERY SELECT FALSE, v_config.max_attempts, 0;
    RETURN;
  END IF;

  -- Calculate remaining attempts
  v_remaining := v_config.max_attempts - v_limit.attempts;

  IF v_remaining <= 0 THEN
    -- Block the identifier
    v_retry_seconds := EXTRACT(EPOCH FROM (
      v_limit.last_attempt_at + (v_config.block_duration_minutes || ' minutes')::INTERVAL - NOW()
    ))::INTEGER;

    IF v_retry_seconds > 0 THEN
      RETURN QUERY SELECT TRUE, 0, v_retry_seconds;
    ELSE
      -- Block period expired, allow
      RETURN QUERY SELECT FALSE, v_config.max_attempts, 0;
    END IF;
    RETURN;
  END IF;

  -- Action is allowed
  RETURN QUERY SELECT FALSE, v_remaining, 0;
END;
$$;

-- Function to record a rate limited action
CREATE OR REPLACE FUNCTION record_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE (
  is_limited BOOLEAN,
  remaining_attempts INTEGER,
  retry_after_seconds INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_config rate_limit_config%ROWTYPE;
  v_window_start TIMESTAMPTZ;
  v_result RECORD;
BEGIN
  -- Get configuration
  SELECT * INTO v_config
  FROM rate_limit_config
  WHERE action_type = p_action_type AND enabled = TRUE;

  -- If no config, just return success
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 999, 0;
    RETURN;
  END IF;

  v_window_start := NOW() - (v_config.window_minutes || ' minutes')::INTERVAL;

  -- Insert or update rate limit record
  INSERT INTO rate_limits (identifier, action_type, metadata)
  VALUES (p_identifier, p_action_type, p_metadata)
  ON CONFLICT (identifier, action_type)
  DO UPDATE SET
    attempts = CASE
      WHEN rate_limits.first_attempt_at < v_window_start THEN 1
      ELSE rate_limits.attempts + 1
    END,
    first_attempt_at = CASE
      WHEN rate_limits.first_attempt_at < v_window_start THEN NOW()
      ELSE rate_limits.first_attempt_at
    END,
    last_attempt_at = NOW(),
    blocked_until = CASE
      WHEN rate_limits.first_attempt_at >= v_window_start
           AND rate_limits.attempts + 1 >= v_config.max_attempts
      THEN NOW() + (v_config.block_duration_minutes || ' minutes')::INTERVAL
      ELSE NULL
    END,
    metadata = COALESCE(rate_limits.metadata, '{}') || p_metadata;

  -- Return the current status
  RETURN QUERY SELECT * FROM check_rate_limit(p_identifier, p_action_type);
END;
$$;

-- Function to clear rate limit (e.g., after successful login)
CREATE OR REPLACE FUNCTION clear_rate_limit(
  p_identifier TEXT,
  p_action_type TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM rate_limits
  WHERE identifier = p_identifier
    AND action_type = p_action_type;
END;
$$;

-- ============================================
-- 4. PASSWORD RESET AUDIT TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  account_type TEXT, -- 'admin', 'agent', 'client'
  action TEXT NOT NULL, -- 'request', 'complete', 'expire', 'fail'
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_reset_audit_email ON password_reset_audit(email);
CREATE INDEX idx_password_reset_audit_created ON password_reset_audit(created_at DESC);

-- ============================================
-- 5. RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_audit ENABLE ROW LEVEL SECURITY;

-- Rate limits: Only system can access
CREATE POLICY "System can manage rate limits"
  ON rate_limits FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Rate limit config: Only admins can view/modify
CREATE POLICY "Admins can view rate limit config"
  ON rate_limit_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can modify rate limit config"
  ON rate_limit_config FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Password reset audit: Only admins can view
CREATE POLICY "Admins can view password reset audit"
  ON password_reset_audit FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Allow system to insert audit records
CREATE POLICY "System can insert audit records"
  ON password_reset_audit FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- 6. CLEANUP FUNCTION (for scheduled job)
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete records older than 24 hours
  DELETE FROM rate_limits
  WHERE last_attempt_at < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Cleanup old audit records (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_records()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM password_reset_audit
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
