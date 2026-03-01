-- =============================================
-- Tabela live_fetch_cooldowns
-- =============================================
-- Coordena live fetches entre multiplas serverless functions.
-- Evita race conditions e rate limit amplification via INSERT ON CONFLICT atomico.
-- Epic 10 - Story 10.4

CREATE TABLE IF NOT EXISTS live_fetch_cooldowns (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id      UUID         NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  fetch_key     TEXT         NOT NULL,           -- "30d" ou "custom_abc123" (md5 do date range)
  status        TEXT         NOT NULL DEFAULT 'in_progress',  -- 'in_progress' | 'completed' | 'failed'
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ  NOT NULL,           -- cooldown expiry
  result_summary JSONB,                          -- opcional: resumo do resultado para debugging
  created_by    TEXT,                            -- "cron" | "admin-fallback" | "portal-fallback"

  CONSTRAINT uq_store_fetch_key UNIQUE (store_id, fetch_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cooldowns_expires ON live_fetch_cooldowns(expires_at);
CREATE INDEX IF NOT EXISTS idx_cooldowns_store ON live_fetch_cooldowns(store_id);

-- =============================================
-- Function: try_acquire_live_fetch
-- =============================================
-- Tenta adquirir lock atomico para live fetch.
-- Retorna true se adquiriu (pode prosseguir), false se cooldown ativo (skip).
-- Limpa entradas expiradas antes de tentar inserir.

CREATE OR REPLACE FUNCTION try_acquire_live_fetch(
  p_store_id UUID,
  p_fetch_key TEXT,
  p_cooldown_ms INTEGER DEFAULT 60000,
  p_created_by TEXT DEFAULT 'unknown'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted BOOLEAN := false;
  v_expires_at TIMESTAMPTZ;
BEGIN
  v_expires_at := now() + (p_cooldown_ms || ' milliseconds')::INTERVAL;

  -- Clean expired entries for this store+key first
  DELETE FROM live_fetch_cooldowns
  WHERE store_id = p_store_id
    AND fetch_key = p_fetch_key
    AND expires_at < now();

  -- Try atomic insert — fails silently if row exists (cooldown active)
  INSERT INTO live_fetch_cooldowns (store_id, fetch_key, status, expires_at, created_by)
  VALUES (p_store_id, p_fetch_key, 'in_progress', v_expires_at, p_created_by)
  ON CONFLICT (store_id, fetch_key) DO NOTHING
  RETURNING true INTO v_inserted;

  RETURN COALESCE(v_inserted, false);
END;
$$;

-- =============================================
-- Function: release_live_fetch
-- =============================================
-- Libera lock apos conclusao ou falha do live fetch.

CREATE OR REPLACE FUNCTION release_live_fetch(
  p_store_id UUID,
  p_fetch_key TEXT,
  p_status TEXT DEFAULT 'completed',
  p_result_summary JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE live_fetch_cooldowns
  SET status = p_status,
      completed_at = now(),
      result_summary = COALESCE(p_result_summary, result_summary)
  WHERE store_id = p_store_id
    AND fetch_key = p_fetch_key;
END;
$$;

-- =============================================
-- Function: clean_expired_cooldowns
-- =============================================
-- Remove todas as entradas expiradas. Chamado pelo cron periodicamente.

CREATE OR REPLACE FUNCTION clean_expired_cooldowns()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM live_fetch_cooldowns
  WHERE expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- =============================================
-- RLS
-- =============================================
-- Only service_role has access because all cooldown operations use createAdminClient().
-- PL/pgSQL functions are SECURITY DEFINER, so direct RPC calls bypass RLS anyway.
-- If user-scoped client accidentally calls tryAcquireLiveFetch, the TypeScript
-- fail-open logic returns true (allows fetch), so no silent lockout occurs.
ALTER TABLE live_fetch_cooldowns ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (cron + admin endpoints)
CREATE POLICY "service_role_full_access" ON live_fetch_cooldowns
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- Comments
-- =============================================
COMMENT ON TABLE live_fetch_cooldowns IS
  'Coordena live fetches entre multiplas serverless functions. '
  'Evita race conditions e rate limit amplification via INSERT ON CONFLICT atomico.';

COMMENT ON FUNCTION try_acquire_live_fetch IS
  'Tenta adquirir lock atomico para live fetch. Retorna true se adquiriu, false se cooldown ativo.';

COMMENT ON FUNCTION release_live_fetch IS
  'Libera lock apos conclusao ou falha do live fetch.';

COMMENT ON FUNCTION clean_expired_cooldowns IS
  'Remove entradas expiradas da tabela live_fetch_cooldowns. Chamado pelo cron.';
