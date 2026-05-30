-- ============================================================
-- Epic AE: Agent Email Generation
-- Story AE-4 patch: contador de tentativas de re-dispatch para
-- emails em `copy_ready` travados (front 4 do watchdog).
--
-- Motivacao: o watchdog detecta emails em `copy_ready` que nao
-- progrediram para `rendering` em N minutos e faz POST para o
-- endpoint interno /api/internal/run-phase2. Se esse POST falha
-- repetidamente (endpoint flaky, 5xx, timeout), o email pode
-- ficar travado em `copy_ready` indefinidamente. Esta coluna +
-- RPC permitem cap em K tentativas — depois disso o cron marca
-- o email como `failed:stale_copy_ready_exhausted`.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================

-- Contador de tentativas de re-dispatch (front 4 do AE-4 watchdog)
ALTER TABLE email_flow_emails
  ADD COLUMN IF NOT EXISTS copy_ready_dispatch_attempts INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN email_flow_emails.copy_ready_dispatch_attempts IS
  'Quantas vezes o watchdog (Story AE-4 front 4) tentou re-dispatchar '
  'a fase 2 via POST /api/internal/run-phase2 para este email. '
  'Quando atinge MAX_STALE_COPY_READY_DISPATCH (default 3), o cron '
  'desiste e marca o email como failed:stale_copy_ready_exhausted.';

-- RPC batch para incrementar tentativas atomicamente.
CREATE OR REPLACE FUNCTION increment_copy_ready_dispatch_attempts(p_email_ids UUID[])
RETURNS TABLE(email_id UUID, attempts INT) AS $$
BEGIN
  RETURN QUERY
  UPDATE email_flow_emails efe
    SET copy_ready_dispatch_attempts = efe.copy_ready_dispatch_attempts + 1
  WHERE efe.id = ANY(p_email_ids)
  RETURNING efe.id, efe.copy_ready_dispatch_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION increment_copy_ready_dispatch_attempts(UUID[]) IS
  'Increments copy_ready_dispatch_attempts for a batch of emails. '
  'Used by AE-4 watchdog (front 4) after each failed POST to '
  '/api/internal/run-phase2. Returns the new attempts value per email.';
