-- ============================================================
-- Reverte o HTML agent para OpenRouter.
--
-- A versão ORIGINAL da 20261029 (já publicada) trocava o modelo do HTML
-- agent para o id direto 'claude-sonnet-4-6' (Anthropic SDK). O ambiente
-- NÃO tem crédito Anthropic direto ("credit balance too low") — TODO o
-- pipeline roteia via OpenRouter (id com "/"). Esta migration garante que
-- ambientes que aplicaram a 20261029 ruim voltem pro OpenRouter.
--
-- Idempotente: só age se o modelo estiver no id direto.
-- ============================================================

UPDATE email_agent_configs
SET model = 'anthropic/claude-sonnet-4.6'
WHERE agent_type = 'html'
  AND is_active = true
  AND model = 'claude-sonnet-4-6';
