-- Adiciona timestamp de inicio da geracao do briefing IA pra permitir
-- auto-recovery se a chamada Anthropic morrer no meio (function freezing,
-- 5xx, timeout). Sem isso, briefing_status fica eternamente em "generating".
--
-- Logica de retry: se status='generating' e briefing_started_at > 90s atras,
-- considera stuck e libera re-geracao no proximo submit-data.

ALTER TABLE onboardings
  ADD COLUMN IF NOT EXISTS briefing_started_at timestamptz NULL;

COMMENT ON COLUMN onboardings.briefing_started_at IS
  'Timestamp de quando generateBriefing() comecou. Usado pra detectar geracoes stuck (>90s sem briefing_generated_at) e permitir auto-retry.';
