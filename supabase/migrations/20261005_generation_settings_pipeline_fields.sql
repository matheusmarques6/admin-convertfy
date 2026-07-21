-- ═══════════════════════════════════════════════════════════════════
-- Configurações do pipeline de geração (maquete EG · aba Configurações)
-- + índice da listagem global da aba Geradas.
--
-- email_generation_settings ganha os parâmetros globais do pipeline:
--   • qa_vision_enabled  — NULL = respeita env EMAIL_QA_VISION_ENABLED
--     (rollout seguro); true/false = override explícito da UI
--   • refiner_enabled    — kill-switch do Refinador Tipográfico (além da
--     ausência de config ativa, que continua desligando)
--   • max_blocks_per_email — clamp da estrutura gerada por email
--   • default_model      — fallback quando NÃO há config ativa do agente
--   • usd_brl_rate       — override do câmbio nos logs (NULL = cotação online)
--   • cost_alert_usd     — alerta por execução acima deste custo
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS qa_vision_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS refiner_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_blocks_per_email INT NOT NULL DEFAULT 9
    CHECK (max_blocks_per_email BETWEEN 3 AND 15),
  ADD COLUMN IF NOT EXISTS default_model TEXT,
  ADD COLUMN IF NOT EXISTS usd_brl_rate NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS cost_alert_usd NUMERIC(8,2);

-- Listagem global "Geradas" (emails que passaram pelo pipeline, mais
-- recentes primeiro) — índice parcial para não varrer emails sem geração
-- nem estourar statement timeout (precedente: fix 57014 nos gen-logs).
CREATE INDEX IF NOT EXISTS idx_efe_generated_recent
  ON email_flow_emails (updated_at DESC)
  WHERE generation_batch_id IS NOT NULL;
