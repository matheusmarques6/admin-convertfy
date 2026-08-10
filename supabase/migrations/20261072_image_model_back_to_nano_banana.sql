-- Troca do modelo de imagem: openai/gpt-5.4-image-2 → Nano Banana 2
-- (google/gemini-3.1-flash-image), em TODA a geração de imagem.
--
-- É o rollback da 20261071, que tinha feito o caminho oposto. Afeta os
-- dois agentes que compartilham o motor de imagem (image.chain via
-- OpenRouter):
--   - `image`          → imagens dos emails do pipeline (fase 2)
--   - `campaign_image` → Central de Campanhas + Estúdio (/admin/imagens)
--
-- MOTIVO (ago/2026): o gpt-5.4-image-2 entra em loop de whitespace —
-- responde 200 OK e fica pingando espaço por minutos, sem imagem. Duas
-- ocorrências provadas na Luxe Lift (09-10/08); numa delas as duas
-- tentativas somaram 455s do orçamento da fase 2 e o email saiu sem a
-- imagem da hero, porque o agente de hero recebeu <hero_image url="" />
-- e removeu a linha. O teto de leitura do corpo (commit 000fb71) limita
-- o desperdício, mas não impede a falha — ela é do provedor.
--
-- `google/gemini-3.1-flash-image` já é a constante do CÓDIGO
-- (OPENROUTER_IMAGE_MODEL) e o caminho tem guard próprio: para modelo
-- com `gemini` no nome a request declara `modalities: ["image","text"]`,
-- sem o que o Nano Banana responde só texto e a extração falha.
--
-- UPDATE in-place da linha ATIVA (padrão das trocas de modelo do
-- projeto: 20260730, 20261038, 20261047, 20261071). Prompts, temperatura
-- e versão ficam intactos.

-- NOTA: email_agent_configs NÃO tem coluna updated_at (só created_at) —
-- o UPDATE mexe apenas em `model`.
UPDATE email_agent_configs
SET model = 'google/gemini-3.1-flash-image'
WHERE agent_type IN ('image', 'campaign_image')
  AND is_active = TRUE
  AND model <> 'google/gemini-3.1-flash-image';

-- Conferência (esperado: 2 linhas, ambas com o modelo novo).
SELECT agent_type, model, version, is_active
FROM email_agent_configs
WHERE agent_type IN ('image', 'campaign_image')
  AND is_active = TRUE
ORDER BY agent_type;

-- ROLLBACK (voltar para o gpt-5.4-image-2): rodar o UPDATE acima com
-- 'openai/gpt-5.4-image-2' no SET.
