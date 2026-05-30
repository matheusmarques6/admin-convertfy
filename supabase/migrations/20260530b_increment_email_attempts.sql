-- ============================================================
-- Epic AE: Agent Email Generation
-- Story AE-2 patch: RPC atomica para incrementar attempts
--
-- Motivacao: PostgREST nao expoe `UPDATE ... SET col = col + 1`
-- diretamente. Sem essa funcao, o service de start-onboarding
-- nao consegue incrementar `email_flow_emails.attempts` ao
-- iniciar uma rodada, e o watchdog (AE-4) nao tem como aplicar
-- cap de retries (attempts < 3).
--
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

-- Versao batch (preferida pelo service: 1 chamada por dispatch).
CREATE OR REPLACE FUNCTION increment_email_attempts(p_email_ids UUID[])
RETURNS TABLE(email_id UUID, attempts INT) AS $$
BEGIN
  RETURN QUERY
  UPDATE email_flow_emails efe
    SET attempts = efe.attempts + 1,
        last_attempt_at = NOW()
  WHERE efe.id = ANY(p_email_ids)
  RETURNING efe.id, efe.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_email_attempts(UUID[]) IS
  'Increments attempts and updates last_attempt_at for a batch of emails. '
  'Used by start-onboarding service (Epic AE / Story AE-2) and by the '
  'watchdog fallback (AE-4). Returns the new attempts value per email.';

-- Versao singular (compat: alguns paths legados podem chamar 1-a-1).
CREATE OR REPLACE FUNCTION increment_email_attempt(p_email_id UUID)
RETURNS INT AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE email_flow_emails
    SET attempts = attempts + 1,
        last_attempt_at = NOW()
  WHERE id = p_email_id
  RETURNING attempts INTO new_count;
  RETURN new_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_email_attempt(UUID) IS
  'Singular helper: increments attempts for a single email. Prefer the '
  'batch variant increment_email_attempts(UUID[]) when dispatching multiple.';
