-- ============================================================
-- Troca de modelo: z-ai/glm-5.2 → moonshotai/kimi-k3
--
-- Pedido (jul/2026): os agentes do pipeline que rodam GLM-5.2 (cadeia de
-- formatação hero/text/image/color + Taguedor de Variantes) passam a usar
-- o Kimi K3 — MANTENDO prompts, temperatura, max_tokens e flow; troca
-- APENAS a coluna model. O id tem "/" → roteia via OpenRouter (sem
-- mudança de código; custo real continua vindo de usage.cost).
--
-- NÃO toca no agente de imagem (gpt-5.4-image-2), no Montador
-- (claude-opus-4.8), no Blueprint, no QA (claude-sonnet-4-6) nem no
-- Verificador de merge (claude-haiku-4-5). Idempotente (WHERE model=glm).
--
-- ATENÇÃO operacional: o Kimi K3 é modelo de reasoning "always-on" — o
-- corte de thinking dos steps de JSON (reasoning {enabled:false}) pode
-- ser ignorado pelo provider. Observar duração/custo por step nos
-- gen-logs após a primeira geração; rollback = UPDATE inverso.
-- ============================================================

-- 1) Configs ativas que estão em GLM-5.2
UPDATE email_agent_configs
SET model = 'moonshotai/kimi-k3'
WHERE is_active = true
  AND model = 'z-ai/glm-5.2';

-- 2) Fallback global (aba Configurações) quando não há config ativa
UPDATE email_generation_settings
SET default_model = 'moonshotai/kimi-k3'
WHERE default_model = 'z-ai/glm-5.2';

-- ── Verificação: modelos ativos por agente ──────────────────
SELECT agent_type, model, temperature, max_tokens
FROM email_agent_configs
WHERE is_active = true
ORDER BY agent_type;
