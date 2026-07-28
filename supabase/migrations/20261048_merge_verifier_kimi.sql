-- ============================================================
-- Verificador de merge: claude-haiku-4-5 → moonshotai/kimi-k3.
--
-- O seed do 20261043 apontava pro Haiku direto na Anthropic — que falhou
-- em produção com 400 "credit balance is too low" (28/07), derrubando o
-- 7b pro fallback mecânico em 272ms. Todo o pipeline roda no OpenRouter;
-- o verificador passa a rodar junto (Kimi K3), na mesma conta.
--
-- Idempotente (WHERE model = haiku). Rollback: UPDATE inverso.
-- ============================================================

UPDATE email_agent_configs
SET model = 'moonshotai/kimi-k3'
WHERE agent_type = 'merge_verifier'
  AND is_active = true
  AND model = 'claude-haiku-4-5';

-- Verificação
SELECT agent_type, model, temperature, max_tokens
FROM email_agent_configs
WHERE agent_type = 'merge_verifier' AND is_active = true;
