-- ============================================================
-- Fix do MONTADOR truncado (batch Luxe Lift, 23/jul):
-- o run parou EXATAMENTE em 16.384 tokens de output (== max_tokens), sem
-- fechar </html> → guard looksLikeHtml barra → fallback llm_output_not_html.
-- O HTML de arquitetura de emails grandes não cabe em 16k. Sobe o teto pra
-- 32.000 (headroom 2x). Idempotente: só sobe se estiver abaixo.
--
-- NOTA: o fix do HTML agent (timeout) NÃO é troca de modelo — o ambiente
-- NÃO tem crédito Anthropic direto e roteia TUDO via OpenRouter (id com
-- "/"). O HTML agent DEVE ficar em 'anthropic/claude-sonnet-4.6'. O timeout
-- de 200s do OpenRouter é tratado como issue separada (ver 20261030).
-- ============================================================

-- Montador: teto de tokens maior (emails grandes fecham o </html>).
UPDATE email_agent_configs
SET max_tokens = 32000
WHERE agent_type = 'assembler'
  AND is_active = true
  AND max_tokens < 32000;
