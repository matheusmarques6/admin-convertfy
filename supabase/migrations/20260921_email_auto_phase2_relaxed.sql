-- ============================================================
-- Teste "Geração completa": flag auto_phase2_relaxed
--
-- O modo de teste completo (fase 1 → copy via n8n → fase 2) é ASSÍNCRONO:
-- a request dispara a fase 1 + o webhook do n8n e retorna; a copy chega
-- depois no callback /api/webhooks/n8n/email-copy. Precisamos de um flag
-- que ATRAVESSE essa fronteira async para o callback (e o watchdog, como
-- rede de segurança) saberem que, ao chegar em copy_ready, devem disparar
-- a fase 2 RELAXADA (relaxedBrandCheck) — sem esperar o gate de identidade
-- visual (store_brand_identity.confirmed_at), que é o comportamento de
-- produção.
--
-- O flag é setado no início do teste completo e LIMPO assim que a fase 2
-- é disparada (callback ou watchdog), pra não vazar pro fluxo normal.
-- ============================================================

ALTER TABLE email_flow_emails
  ADD COLUMN IF NOT EXISTS auto_phase2_relaxed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN email_flow_emails.auto_phase2_relaxed IS
  'Teste "Geração completa": quando true, ao chegar em copy_ready a fase 2 '
  'é disparada automaticamente em modo relaxado (sem gate de identidade). '
  'Setado no início do teste, limpo ao disparar a fase 2.';

-- Índice parcial: o watchdog varre só os poucos e-mails com o flag ligado.
CREATE INDEX IF NOT EXISTS idx_email_flow_emails_auto_phase2
  ON email_flow_emails (status)
  WHERE auto_phase2_relaxed = true;
