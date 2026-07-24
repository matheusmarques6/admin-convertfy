-- ============================================================
-- Troca de modelo: claude-sonnet-4.6 → z-ai/glm-5.2
--
-- Pedido (jul/2026): todos os agentes do pipeline de geração de emails
-- que usam Sonnet 4.6 passam a usar z-ai/glm-5.2 — MANTENDO prompts,
-- temperatura, max_tokens e flow; troca APENAS a coluna model.
--
-- Cobre as duas grafias em uso:
--   • 'anthropic/claude-sonnet-4.6'  (roteia via OpenRouter)
--   • 'claude-sonnet-4-6'            (Anthropic SDK direto)
-- O id novo tem "/" → roteia via OpenRouter (sem mudança de código).
--
-- NÃO toca nos agentes de imagem (gpt-5.4-image-2) nem no Montador
-- (gpt-5.4). Idempotente por natureza (WHERE model = sonnet).
--
-- Rollback: UPDATE inverso trocando 'z-ai/glm-5.2' de volta pelo id
-- anterior do agente desejado.
-- ============================================================

-- 1) Configs ativas dos agentes (html, blueprint, assembler_chooser, qa,
--    refiner, subject, component_test... — qualquer uma que esteja em Sonnet 4.6)
UPDATE email_agent_configs
SET model = 'z-ai/glm-5.2'
WHERE is_active = true
  AND model IN ('anthropic/claude-sonnet-4.6', 'claude-sonnet-4-6');

-- 2) Fallback global (aba Configurações) quando não há config ativa
UPDATE email_generation_settings
SET default_model = 'z-ai/glm-5.2'
WHERE default_model IN ('anthropic/claude-sonnet-4.6', 'claude-sonnet-4-6');

-- ── Verificação: modelos ativos por agente ──────────────────
SELECT agent_type, model, temperature, max_tokens
FROM email_agent_configs
WHERE is_active = true
ORDER BY agent_type;
