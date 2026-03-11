-- Story 33.5: Atomic sync lock via RPC
-- Replaces the TOCTOU race condition in acquireSyncLock (SELECT + UPSERT)
-- with a single atomic UPDATE ... WHERE statement inside a PL/pgSQL function.

CREATE OR REPLACE FUNCTION acquire_sync_lock(
  p_lock_name TEXT,
  p_stale_ms BIGINT DEFAULT 600000
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INT;
  v_was_stale BOOLEAN := false;
BEGIN
  -- Check if stale before update (for logging purposes)
  SELECT (is_running = true AND (started_at IS NULL OR started_at < now() - (p_stale_ms || ' milliseconds')::interval))
  INTO v_was_stale
  FROM cron_locks
  WHERE lock_name = p_lock_name;

  -- Atomic UPDATE: acquire only if not running OR stale
  UPDATE cron_locks
  SET is_running = true,
      started_at = now()
  WHERE lock_name = p_lock_name
    AND (
      is_running = false
      OR started_at IS NULL
      OR started_at < now() - (p_stale_ms || ' milliseconds')::interval
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 AND v_was_stale THEN
    RAISE LOG '[Cron] Stale lock acquired for %', p_lock_name;
  END IF;

  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION acquire_sync_lock FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_sync_lock TO service_role;

-- AC 33.5.5: Ensure the sync_reports row exists so UPDATE can find it
INSERT INTO cron_locks (lock_name, is_running, started_at)
VALUES ('sync_reports', false, now())
ON CONFLICT (lock_name) DO NOTHING;
