-- Troca do modelo de imagem: Nano Banana 2 (google/gemini-3.1-flash-image)
-- → openai/gpt-5.4-image-2, em TODA a geração de imagem.
--
-- É o caminho inverso da 20260730 (que trocou image-2 → Nano Banana), e
-- afeta os dois agentes que compartilham o motor de imagem
-- (image.chain via OpenRouter):
--   - `image`          → imagens dos emails do pipeline (fase 2)
--   - `campaign_image` → Central de Campanhas + Estúdio (/admin/imagens)
--
-- ATENÇÃO — este SQL sozinho NÃO basta para os EMAILS. O
-- phase2-runner carregava `email_agent_configs.model` e nunca o passava
-- para a chain, então o agente `image` usava sempre a constante do
-- código. O commit que acompanha esta migration liga o parâmetro; sem
-- esse deploy, só `campaign_image` (campanhas/estúdio) respeita o banco.
--
-- UPDATE in-place da linha ATIVA (padrão das trocas de modelo do
-- projeto: 20261038, 20261047, 20260730). Prompts, temperatura e versão
-- ficam intactos.

-- NOTA: email_agent_configs NÃO tem coluna updated_at (só created_at) —
-- o UPDATE mexe apenas em `model`.
UPDATE email_agent_configs
SET model = 'openai/gpt-5.4-image-2'
WHERE agent_type IN ('image', 'campaign_image')
  AND is_active = TRUE
  AND model <> 'openai/gpt-5.4-image-2';

-- Conferência (esperado: 2 linhas, ambas com o modelo novo):
--   SELECT agent_type, model, version, is_active
--   FROM email_agent_configs
--   WHERE agent_type IN ('image','campaign_image') AND is_active = TRUE;
--
-- ROLLBACK (voltar para o Nano Banana 2): rodar o UPDATE acima com
-- 'google/gemini-3.1-flash-image' no SET.
