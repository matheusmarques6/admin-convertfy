-- Fix: stale_pending_crm_templates returned SQLSTATE 42804 because
-- EXTRACT(EPOCH ...) / 60.0 returns numeric while age_minutes is declared
-- as DOUBLE PRECISION.

CREATE OR REPLACE FUNCTION stale_pending_crm_templates(
  p_threshold_minutes INTEGER DEFAULT 60
)
RETURNS TABLE(
  template_id UUID,
  name TEXT,
  language TEXT,
  channel_id UUID,
  created_at TIMESTAMPTZ,
  age_minutes DOUBLE PRECISION
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.language,
    t.channel_id,
    t.created_at,
    (EXTRACT(EPOCH FROM (now() - t.created_at)) / 60.0)::double precision AS age_minutes
  FROM crm_whatsapp_templates t
  WHERE t.status = 'PENDING'
    AND t.created_at < now() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY t.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION stale_pending_crm_templates(INTEGER) TO service_role;
