-- ============================================================
-- Store alerts — novos tipos pra consolidar com fluxos CS
-- ============================================================
-- Tabela store_alerts (existente desde 20260223) cobria alertas
-- automaticos da operacao (low_revenue, klaviyo_account_error,
-- campaign_failure, low_recovery_rate).
--
-- Agora absorve tambem o que era "Leads CS" (que foi removido por
-- redundancia com clients/client_stores). Tipos novos:
--   - health_critical     : score < 50 (substitui health_alert lead)
--   - renewal_due         : contract_end_date <= 60d (substitui renewal_opportunity lead)
--   - feedback_received   : NPS/health-check respondido (substitui feedback_followup lead)
--   - churn_recovery      : cliente cancelou recentemente (substitui churn_recovery lead)
--
-- Tabela crm_leads passa a ser apenas "sales" (aquisicao). Os
-- campos scope/category/store_id criados em 20260612 ficam pra
-- backwards compat — leads existentes nao sao migrados (banco de
-- dev), so o codigo deixa de cria-los.

-- Drop e recria o CHECK constraint com os tipos novos
DO $$
BEGIN
  -- Tenta achar o nome do constraint existente
  IF EXISTS (
    SELECT 1
    FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name LIKE 'store_alerts_type%'
  ) THEN
    EXECUTE 'ALTER TABLE store_alerts DROP CONSTRAINT IF EXISTS store_alerts_type_check';
  END IF;
END $$;

ALTER TABLE store_alerts
  ADD CONSTRAINT store_alerts_type_check
  CHECK (type IN (
    -- Tipos operacionais (preservados)
    'low_revenue',
    'klaviyo_account_error',
    'campaign_failure',
    'low_recovery_rate',
    -- Tipos CS (novos)
    'health_critical',
    'renewal_due',
    'feedback_received',
    'churn_recovery'
  ));

-- Indexes adicionais pros tipos CS
CREATE INDEX IF NOT EXISTS idx_store_alerts_type_status
  ON store_alerts(type, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_store_alerts_cs_active
  ON store_alerts(store_id, type)
  WHERE status = 'active'
    AND type IN ('health_critical', 'renewal_due', 'feedback_received', 'churn_recovery');

COMMENT ON COLUMN store_alerts.type IS
  'Tipo do alerta. Operacionais: low_revenue | klaviyo_account_error | campaign_failure | low_recovery_rate. CS: health_critical | renewal_due | feedback_received | churn_recovery.';
