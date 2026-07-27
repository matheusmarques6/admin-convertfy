-- ─────────────────────────────────────────────────────────────────────
-- store_alerts: adiciona o tipo 'omnisend_account_error' ao CHECK
--
-- Bug 23514 (check_violation em store_alerts_type_check): o tipo TS
-- AlertType (src/lib/services/store-alert.service.ts:7) inclui
-- 'omnisend_account_error' e o checker o insere quando a API da Omnisend
-- falha (store-alert-checker.ts:353), mas nem a 20260223 nem a 20260614
-- adicionaram esse valor ao CHECK do banco -> todo INSERT estourava.
--
-- Alinha o schema com o tipo TS e com o label ja existente na UI
-- ("Erro Omnisend"). Mesmo padrao idempotente das migrations anteriores.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'store_alerts'::regclass
    AND contype = 'c'
    AND conname LIKE 'store_alerts_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE store_alerts DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE store_alerts
  ADD CONSTRAINT store_alerts_type_check
  CHECK (type IN (
    -- Tipos operacionais
    'low_revenue',
    'klaviyo_account_error',
    'omnisend_account_error',
    'campaign_failure',
    'low_recovery_rate',
    -- Tipos CS
    'health_critical',
    'renewal_due',
    'feedback_received',
    'churn_recovery'
  ));
