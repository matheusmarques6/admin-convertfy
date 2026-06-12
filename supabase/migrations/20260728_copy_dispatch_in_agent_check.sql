-- ─────────────────────────────────────────────────────────────────────
-- Fix: telemetria do dispatch de copy NUNCA gravou.
--
-- email-copy-webhook.service.ts insere agent='copy_dispatch' em
-- email_generation_runs desde a criação do dispatch, mas o CHECK da
-- coluna só aceitava ('seed','copy','image','html','qa','blueprint',
-- 'assembler'). O insert falhava com 23514 e o service não conferia o
-- erro → falha silenciosa. Nenhum disparo (manual ou automático) ficou
-- registrado.
--
-- Expande o CHECK incluindo 'copy_dispatch'. Idempotente (mesmo padrão
-- das migrations 20260530/20260708).
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_generation_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_generation_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_generation_runs
    ADD CONSTRAINT email_generation_runs_agent_check
    CHECK (agent IN (
      'seed','copy','image','html','qa','blueprint','assembler','copy_dispatch'
    ));
END $$;
