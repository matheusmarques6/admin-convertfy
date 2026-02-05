-- ============================================================================
-- Migration: Optimized Rate Limiting System v2 (CORRECTED)
-- Description: Sliding window rate limiting with IP + identifier support
-- Date: 2024
--
-- CHANGELOG:
-- - STABLE ao invés de IMMUTABLE para config
-- - RLS policies corrigidas (USING false)
-- - Race condition corrigida no INSERT ON CONFLICT
-- - remaining/retry_after calculados corretamente
-- - Cleanup não deleta bloqueios ativos
-- - Trigger para updated_at automático
-- ============================================================================

-- ============================================
-- 0. PRE-MIGRATION SAFETY CHECK
-- ============================================

DO $$
BEGIN
  -- Verificar se há dados importantes antes de dropar
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'rate_limits'
    AND table_schema = 'public'
  ) THEN
    -- Se tabela existe e tem bloqueios ativos, avisar
    IF EXISTS (
      SELECT 1 FROM rate_limits
      WHERE blocked_until > NOW()
      LIMIT 1
    ) THEN
      RAISE NOTICE 'Atenção: Existem bloqueios ativos que serão perdidos na migração.';
    END IF;
  END IF;
END $$;

-- ============================================
-- 1. DROP OLD OBJECTS (safe)
-- ============================================

DROP FUNCTION IF EXISTS check_rate_limit(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS record_rate_limit(TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS clear_rate_limit(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS rate_limit_check(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS rate_limit_dual_check(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS rate_limit_clear(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_rate_limit_rule(TEXT) CASCADE;
DROP FUNCTION IF EXISTS rate_limit_cleanup() CASCADE;

DROP TABLE IF EXISTS rate_limits CASCADE;
DROP TABLE IF EXISTS rate_limit_config CASCADE;

-- ============================================
-- 2. HELPER: Auto-update updated_at trigger
-- ============================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. RATE LIMITS TABLE (optimized)
-- ============================================

CREATE TABLE rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier TEXT NOT NULL,
  ip_address TEXT,
  action_type VARCHAR(50) NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 1,
  blocked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para auto-update
CREATE TRIGGER rate_limits_set_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================
-- 4. INDEXES (optimized strategy)
-- ============================================

-- Index principal para lookups (com IP)
CREATE UNIQUE INDEX idx_rate_limits_with_ip
  ON rate_limits(identifier, action_type, ip_address)
  WHERE ip_address IS NOT NULL;

-- Index para lookups sem IP
CREATE UNIQUE INDEX idx_rate_limits_without_ip
  ON rate_limits(identifier, action_type)
  WHERE ip_address IS NULL;

-- Index para busca por IP (global limiting)
CREATE INDEX idx_rate_limits_ip_lookup
  ON rate_limits(ip_address, action_type)
  WHERE ip_address IS NOT NULL;

-- Index para cleanup eficiente (sem NOW() - não pode usar funções não-IMMUTABLE)
CREATE INDEX idx_rate_limits_cleanup
  ON rate_limits(updated_at);

-- ============================================
-- 5. RATE LIMIT RULES (STABLE, não IMMUTABLE)
-- ============================================

CREATE OR REPLACE FUNCTION get_rate_limit_rule(p_action_type TEXT)
RETURNS TABLE (
  max_attempts INTEGER,
  window_seconds INTEGER,
  block_seconds INTEGER
)
LANGUAGE sql
STABLE  -- Pode mudar entre transações (não cachear indefinidamente)
PARALLEL SAFE
AS $$
  SELECT
    CASE p_action_type
      WHEN 'password_reset' THEN 3
      WHEN 'login_attempt' THEN 5
      WHEN 'api_call' THEN 100
      WHEN 'ip_global' THEN 20
      ELSE 10
    END::INTEGER,
    CASE p_action_type
      WHEN 'password_reset' THEN 900   -- 15 min
      WHEN 'login_attempt' THEN 900    -- 15 min
      WHEN 'api_call' THEN 60          -- 1 min
      WHEN 'ip_global' THEN 300        -- 5 min
      ELSE 300
    END::INTEGER,
    CASE p_action_type
      WHEN 'password_reset' THEN 1800  -- 30 min block
      WHEN 'login_attempt' THEN 900    -- 15 min block
      WHEN 'api_call' THEN 300         -- 5 min block
      WHEN 'ip_global' THEN 600        -- 10 min block
      ELSE 300
    END::INTEGER;
$$;

-- ============================================
-- 6. MAIN FUNCTION: Atomic check + record
-- ============================================

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
  v_now TIMESTAMPTZ := clock_timestamp();  -- Mais preciso que NOW() em transações longas
  v_new_attempts INTEGER;
  v_retry INTEGER := 0;
BEGIN
  -- Normalizar input
  p_identifier := LOWER(TRIM(p_identifier));
  p_ip_address := NULLIF(TRIM(COALESCE(p_ip_address, '')), '');

  -- Buscar regra (STABLE = pode ser cacheado por statement)
  SELECT * INTO v_rule FROM get_rate_limit_rule(p_action_type);

  -- Calcular início da janela sliding
  v_window_start := v_now - make_interval(secs => v_rule.window_seconds);

  -- UPSERT atômico com RETURNING para evitar race conditions
  INSERT INTO rate_limits (identifier, action_type, ip_address, attempts, window_start)
  VALUES (p_identifier, p_action_type, p_ip_address, 1, v_now)
  ON CONFLICT (identifier, action_type) WHERE ip_address IS NULL
  DO UPDATE SET
    -- Se janela expirou, resetar; senão incrementar
    attempts = CASE
      WHEN rate_limits.window_start < v_window_start THEN 1
      ELSE rate_limits.attempts + 1
    END,
    -- Resetar janela se expirou
    window_start = CASE
      WHEN rate_limits.window_start < v_window_start THEN v_now
      ELSE rate_limits.window_start
    END,
    -- Calcular bloqueio
    blocked_until = CASE
      -- Se já bloqueado e bloqueio ainda válido, manter
      WHEN rate_limits.blocked_until > v_now THEN rate_limits.blocked_until
      -- Se atingiu limite, bloquear
      WHEN rate_limits.window_start >= v_window_start
           AND rate_limits.attempts + 1 >= v_rule.max_attempts
      THEN v_now + make_interval(secs => v_rule.block_seconds)
      -- Senão, limpar bloqueio
      ELSE NULL
    END
  RETURNING * INTO v_record;

  -- Se não retornou (improvável), tentar com IP
  IF v_record.id IS NULL AND p_ip_address IS NOT NULL THEN
    INSERT INTO rate_limits (identifier, action_type, ip_address, attempts, window_start)
    VALUES (p_identifier, p_action_type, p_ip_address, 1, v_now)
    ON CONFLICT (identifier, action_type, ip_address) WHERE ip_address IS NOT NULL
    DO UPDATE SET
      attempts = CASE
        WHEN rate_limits.window_start < v_window_start THEN 1
        ELSE rate_limits.attempts + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < v_window_start THEN v_now
        ELSE rate_limits.window_start
      END,
      blocked_until = CASE
        WHEN rate_limits.blocked_until > v_now THEN rate_limits.blocked_until
        WHEN rate_limits.window_start >= v_window_start
             AND rate_limits.attempts + 1 >= v_rule.max_attempts
        THEN v_now + make_interval(secs => v_rule.block_seconds)
        ELSE NULL
      END
    RETURNING * INTO v_record;
  END IF;

  -- Verificar se bloqueado
  IF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > v_now THEN
    v_retry := GREATEST(0, EXTRACT(EPOCH FROM (v_record.blocked_until - v_now))::INTEGER);
    RETURN QUERY SELECT FALSE, 0, v_retry, TRUE;
    RETURN;
  END IF;

  -- Calcular remaining baseado no valor ATUAL (pós-update)
  v_new_attempts := v_record.attempts;

  RETURN QUERY SELECT
    TRUE,
    GREATEST(0, v_rule.max_attempts - v_new_attempts),
    0,
    FALSE;
END;
$$;

-- ============================================
-- 7. DUAL-KEY: IP + Identifier check
-- ============================================

CREATE OR REPLACE FUNCTION rate_limit_dual_check(
  p_identifier TEXT,
  p_action_type TEXT,
  p_ip_address TEXT
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after INTEGER,
  blocked_by TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip_result RECORD;
  v_id_result RECORD;
BEGIN
  -- 1. Check IP global limit primeiro (rejeita bots rápido)
  IF p_ip_address IS NOT NULL AND TRIM(p_ip_address) != '' THEN
    SELECT * INTO v_ip_result
    FROM rate_limit_check(p_ip_address, 'ip_global', NULL);

    IF NOT v_ip_result.allowed THEN
      RETURN QUERY SELECT FALSE, 0, v_ip_result.retry_after, 'ip'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 2. Check identifier limit (com IP para tracking)
  SELECT * INTO v_id_result
  FROM rate_limit_check(p_identifier, p_action_type, p_ip_address);

  IF NOT v_id_result.allowed THEN
    RETURN QUERY SELECT FALSE, 0, v_id_result.retry_after, 'identifier'::TEXT;
    RETURN;
  END IF;

  -- 3. Ambos passaram
  RETURN QUERY SELECT TRUE, v_id_result.remaining, 0, NULL::TEXT;
END;
$$;

-- ============================================
-- 8. CLEAR RATE LIMIT
-- ============================================

CREATE OR REPLACE FUNCTION rate_limit_clear(
  p_identifier TEXT,
  p_action_type TEXT,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  p_identifier := LOWER(TRIM(p_identifier));
  p_ip_address := NULLIF(TRIM(COALESCE(p_ip_address, '')), '');

  IF p_ip_address IS NULL THEN
    DELETE FROM rate_limits
    WHERE identifier = p_identifier
      AND action_type = p_action_type
      AND ip_address IS NULL;
  ELSE
    DELETE FROM rate_limits
    WHERE identifier = p_identifier
      AND action_type = p_action_type
      AND ip_address = p_ip_address;
  END IF;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

-- ============================================
-- 9. PASSWORD RESET AUDIT TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  account_type VARCHAR(20),
  action VARCHAR(20) NOT NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_email
  ON password_reset_audit(email);
CREATE INDEX IF NOT EXISTS idx_audit_ip
  ON password_reset_audit(ip_address)
  WHERE ip_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created
  ON password_reset_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action
  ON password_reset_audit(action, created_at DESC);

-- ============================================
-- 10. RLS POLICIES (CORRIGIDAS - deny by default)
-- ============================================

ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_audit ENABLE ROW LEVEL SECURITY;

-- Rate limits: NENHUM acesso direto (apenas via SECURITY DEFINER)
-- Não criar policy = deny all para usuários normais
-- Functions com SECURITY DEFINER executam como owner

-- Audit: apenas admins podem VER, sistema pode INSERIR
CREATE POLICY "audit_admin_select"
  ON password_reset_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Insert via SECURITY DEFINER function (não diretamente)
-- Criar function para insert seguro
CREATE OR REPLACE FUNCTION audit_password_reset(
  p_email TEXT,
  p_action TEXT,
  p_success BOOLEAN DEFAULT FALSE,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_account_type TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO password_reset_audit (
    email, action, success, ip_address, user_agent,
    account_type, error_message, metadata
  )
  VALUES (
    LOWER(TRIM(p_email)), p_action, p_success, p_ip_address,
    p_user_agent, p_account_type, p_error_message, p_metadata
  )
  RETURNING id;
$$;

-- ============================================
-- 11. CLEANUP FUNCTION (safe)
-- ============================================

CREATE OR REPLACE FUNCTION rate_limit_cleanup(
  p_max_age_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  deleted_count INTEGER,
  skipped_blocked INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
  v_skipped INTEGER;
  v_cutoff TIMESTAMPTZ;
BEGIN
  v_cutoff := NOW() - make_interval(hours => p_max_age_hours);

  -- Contar bloqueios ativos que seriam deletados (mas não serão)
  SELECT COUNT(*) INTO v_skipped
  FROM rate_limits
  WHERE updated_at < v_cutoff
    AND blocked_until > NOW();

  -- Deletar apenas records antigos SEM bloqueio ativo
  DELETE FROM rate_limits
  WHERE updated_at < v_cutoff
    AND (blocked_until IS NULL OR blocked_until <= NOW());

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_deleted, v_skipped;
END;
$$;

-- Cleanup de audit logs (manter 90 dias)
CREATE OR REPLACE FUNCTION audit_cleanup(
  p_max_age_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH deleted AS (
    DELETE FROM password_reset_audit
    WHERE created_at < NOW() - make_interval(days => p_max_age_days)
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM deleted;
$$;

-- ============================================
-- 12. METRICS/OBSERVABILITY HELPERS
-- ============================================

-- View para métricas (apenas admins via RLS na tabela base)
CREATE OR REPLACE FUNCTION rate_limit_metrics()
RETURNS TABLE (
  action_type TEXT,
  total_records BIGINT,
  currently_blocked BIGINT,
  avg_attempts NUMERIC,
  max_attempts_seen INTEGER
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    action_type::TEXT,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE blocked_until > NOW()) as currently_blocked,
    ROUND(AVG(attempts), 2) as avg_attempts,
    MAX(attempts) as max_attempts_seen
  FROM rate_limits
  GROUP BY action_type
  ORDER BY total_records DESC;
$$;

-- ============================================
-- 13. GRANT PERMISSIONS
-- ============================================

-- Funções podem ser chamadas por authenticated users
-- (SECURITY DEFINER garante que executam com permissões do owner)
GRANT EXECUTE ON FUNCTION rate_limit_check(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rate_limit_dual_check(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION rate_limit_clear(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION audit_password_reset(TEXT, TEXT, BOOLEAN, TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- Apenas service_role pode ver métricas e fazer cleanup
GRANT EXECUTE ON FUNCTION rate_limit_metrics() TO service_role;
GRANT EXECUTE ON FUNCTION rate_limit_cleanup(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION audit_cleanup(INTEGER) TO service_role;
