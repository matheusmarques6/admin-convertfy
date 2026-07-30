-- ============================================================
-- Story CM-8 — modelo do espelho visual da hero.
--
-- O exemplo renderizado da variante chegava ao agente como TEXTO: o
-- `content` da chamada é string, o modelo não navega e o Kimi K3 não recebe
-- modalidade de imagem. Para os 26 mockups da biblioteca — casca de HTML em
-- volta de um `<img src>` — o que o modelo lia era a STRING da URL. O
-- "espelho de acabamento" não existia.
--
-- Agora, quando o exemplo é mockup E tem URL de imagem, o step roda num
-- modelo com VISÃO, com a imagem anexada no payload (mesmo formato que o
-- qa-vision.chain já usa em produção). Exemplo estrutural continua como
-- texto no modelo configurado — ali o CSS ensina mais que um screenshot, e
-- trocar de modelo só encareceria.
--
-- Esta coluna é o kill-switch sem deploy:
--   NULL   → usa HERO_VISION_MODEL (default in-code)
--   ''     → fallback DESLIGADO (volta ao comportamento anterior)
--   outro  → esse modelo (precisa ter visão e rota pelo OpenRouter)
--
-- Idempotente. Rollback: DROP COLUMN.
-- ============================================================

ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS hero_vision_model TEXT;

COMMENT ON COLUMN email_generation_settings.hero_vision_model IS
  'Modelo do espelho visual da hero (story CM-8). NULL = default in-code (HERO_VISION_MODEL); string vazia = fallback desligado; outro valor = esse modelo. Precisa de visão e de rota pelo OpenRouter — o caminho Anthropic-direto recusa imagem anexada.';

-- Verificação
SELECT org_id,
       COALESCE(hero_vision_model, '(NULL — usa o default in-code)') AS hero_vision_model,
       merge_verifier_mode,
       blueprint_mode
FROM email_generation_settings
ORDER BY org_id;
