-- ============================================================
-- Troca de modelo: moonshotai/kimi-k3 → anthropic/claude-sonnet-4.6
--
-- Reverte o swap do 20261047/20261048. Todos os agentes que hoje rodam
-- Kimi K3 (cadeia de formatacao hero/text/image/color + Taguedor de
-- Variantes + Verificador de merge) passam a usar o Sonnet 4.6 via
-- OpenRouter — MANTENDO prompts, temperatura, max_tokens e flow; troca
-- APENAS a coluna model. O id tem "/" → roteia via OpenRouter (sem
-- mudanca de codigo; custo real continua vindo de usage.cost).
--
-- NAO toca no agente de imagem (gpt-5.4-image-2), no Montador
-- (claude-opus-4.8), no Blueprint nem no QA. Idempotente
-- (WHERE model = kimi). Rollback: UPDATE inverso.
-- ============================================================

-- 1) Configs ativas que estao em Kimi K3
--    (hero_section, text_format, image_format, color_format,
--     component_tagger, merge_verifier)
UPDATE email_agent_configs
SET model = 'anthropic/claude-sonnet-4.6'
WHERE is_active = true
  AND model = 'moonshotai/kimi-k3';

-- 2) Fallback global (aba Configuracoes) quando nao ha config ativa
UPDATE email_generation_settings
SET default_model = 'anthropic/claude-sonnet-4.6'
WHERE default_model = 'moonshotai/kimi-k3';

-- ── Verificacao: modelos ativos por agente ──────────────────
SELECT agent_type, model, temperature, max_tokens
FROM email_agent_configs
WHERE is_active = true
ORDER BY agent_type;
