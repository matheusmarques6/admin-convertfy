-- Story 27.5.3: Never delete rows with sync_status = 'ok'
-- Only clean expired rows that have error/partial/pending status

CREATE OR REPLACE FUNCTION clean_expired_revenue_summaries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM store_revenue_summary
  WHERE expires_at < NOW() - INTERVAL '1 hour'
    AND sync_status != 'ok';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
