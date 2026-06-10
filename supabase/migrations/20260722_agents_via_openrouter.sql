-- ============================================================
-- Roteia Blueprint, HTML e QA pelo OpenRouter (Sonnet 4.6).
--
-- Motivo: a conta Anthropic direta ficou sem crédito (400 "credit balance too
-- low"), derrubando Blueprint (fallback) e HTML (erro). O Montador e a Imagem
-- já usam OpenRouter e funcionam. Centralizar tudo no OpenRouter elimina a
-- dependência da conta Anthropic direta.
--
-- O id "anthropic/claude-sonnet-4.6" (com "/") faz o código rotear pelo
-- OpenRouter (invokeAgent p/ Blueprint; html.chain e qa.chain ganharam o
-- branch via invokeOpenRouter). Requer OPENROUTER_API_KEY no ambiente.
-- Idempotente.
-- ============================================================

UPDATE email_agent_configs
SET model = 'anthropic/claude-sonnet-4.6'
WHERE agent_type IN ('blueprint', 'html', 'qa') AND is_active = true;
