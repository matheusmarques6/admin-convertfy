-- ============================================================
-- Epic AE — troca o modelo do Montador (assembler) para Opus 4.8 via OpenRouter.
--
-- O id com "/" faz o invokeAgent (llm-invoke.ts) rotear pela API OpenAI-compatible
-- do OpenRouter (Bearer OPENROUTER_API_KEY) em vez do SDK Anthropic direto.
-- Opus 4.8 não aceita `temperature` — o invoke omite o parâmetro nesse caso.
-- Idempotente. Requer OPENROUTER_API_KEY no ambiente.
-- ============================================================

UPDATE email_agent_configs
SET model = 'anthropic/claude-opus-4.8'
WHERE agent_type = 'assembler' AND is_active = true;
