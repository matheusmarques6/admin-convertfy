-- Troca do modelo de imagem: openai/gpt-5.4-image-2 → Nano Banana 2
-- (google/gemini-3.1-flash-image) em TODA a geração de imagem.
--
-- Afeta os dois agentes de imagem, que compartilham o mesmo motor
-- (image.chain via OpenRouter):
--   - `image`          → imagens dos emails do pipeline (fase 2)
--   - `campaign_image` → Central de Campanhas + Estúdio (/admin/imagens)
--
-- O par desta migration no código (mesmo commit) troca o default de
-- OPENROUTER_IMAGE_MODEL e passa a declarar `modalities` no request —
-- os modelos Gemini só devolvem imagem quando a modalidade é declarada.
--
-- UPDATE in-place da linha ATIVA (padrão das trocas de modelo do projeto,
-- ex.: 20261038/20261047). Prompts, temperatura e versão ficam intactos.

-- NOTA: email_agent_configs NÃO tem coluna updated_at (só created_at) —
-- o UPDATE mexe apenas em `model`, igual às trocas 20261038/20261047.
UPDATE email_agent_configs
SET model = 'google/gemini-3.1-flash-image'
WHERE agent_type IN ('image', 'campaign_image')
  AND is_active = TRUE
  AND model <> 'google/gemini-3.1-flash-image';

-- Conferência (esperado: 2 linhas, ambas com o modelo novo):
--   SELECT agent_type, model, version, is_active
--   FROM email_agent_configs
--   WHERE agent_type IN ('image','campaign_image') AND is_active = TRUE;
--
-- ROLLBACK (se o Nano Banana der problema): rodar o UPDATE acima com
-- 'openai/gpt-5.4-image-2' no SET — o código aceita qualquer id do
-- OpenRouter, então o rollback do banco basta, sem redeploy.
