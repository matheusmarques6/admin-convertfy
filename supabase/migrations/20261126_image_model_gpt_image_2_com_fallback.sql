-- Modelo de imagem: google/gemini-3.1-flash-image → openai/gpt-5.4-image-2
-- (GPT Image 2) como PRIMÁRIO em toda a geração de imagem.
--
-- Afeta os dois agentes que compartilham o motor (image.chain via
-- OpenRouter):
--   - `image`          → imagens dos emails do pipeline (fase 2)
--   - `campaign_image` → Central de Campanhas + Estúdio (/admin/imagens)
--
-- ── Por que isto NÃO é a 20261071 de novo ──────────────────────────────
--
-- A 20261071 fez este mesmo caminho e a 20261072 o desfez, por um motivo
-- real: o gpt-5.4-image-2 entra em LOOP DE WHITESPACE — responde 200 OK e
-- fica pingando espaço por minutos, sem imagem. Na Luxe Lift (10/08) duas
-- tentativas somaram 455 s do orçamento da fase 2 e o email SAIU SEM a
-- imagem da hero: o agente de hero recebeu <hero_image url="" /> e removeu
-- a linha.
--
-- O defeito é do provedor e continua existindo. O que mudou é o custo
-- dele, em duas camadas que não existiam quando a 20261071 subiu:
--
--   1. `OPENROUTER_IMAGE_BODY_TIMEOUT_MS` (300 s) corta o corpo que não
--      termina. O `fetch` resolve nos HEADERS, então antes a leitura
--      seguia sem relógio nenhum — foi assim que uma chamada com "timeout
--      de 90 s" levou 235 s.
--   2. **Fallback de modelo** (`src/lib/agents/image/model-policy.ts`):
--      falha de PROVEDOR (whitespace_body, timeout, 5xx, 429) troca para
--      o Nano Banana 2 e gera a imagem, em vez de devolver bloco vazio.
--      Recusa por política de conteúdo NÃO troca — o segundo modelo
--      recusaria igual e a mensagem do primeiro é o que explica o motivo.
--
-- Ou seja: o pior caso deixou de ser "email sem hero" e passou a ser
-- "imagem do Gemini + uma linha `image.model.fallback` no log".
--
-- ── Variações ─────────────────────────────────────────────────────────
--
-- Pedido de DUAS variações do mesmo prompt sai uma de cada modelo
-- (`modelosParaVariacoes`) — é comparação lado a lado, não duas
-- tentativas do mesmo. Isso é código, não config: não depende desta
-- migration.
--
-- ── Rollback ──────────────────────────────────────────────────────────
--
-- Trocar o valor abaixo de volta para 'google/gemini-3.1-flash-image'.
-- A constante do código (OPENROUTER_IMAGE_MODEL) é só o fallback e o
-- rótulo default da telemetria — a config do banco VENCE.
--
-- UPDATE in-place da linha ATIVA (padrão das trocas de modelo do projeto:
-- 20260730, 20261038, 20261047, 20261071, 20261072). Prompts, temperatura
-- e versão ficam intactos.

-- NOTA: email_agent_configs NÃO tem coluna updated_at (só created_at) —
-- o UPDATE mexe apenas em `model`.
UPDATE email_agent_configs
SET model = 'openai/gpt-5.4-image-2'
WHERE agent_type IN ('image', 'campaign_image')
  AND is_active = TRUE
  AND model <> 'openai/gpt-5.4-image-2';

-- Conferência (esperado: 2 linhas, ambas com o modelo novo).
SELECT agent_type, model, version, is_active
FROM email_agent_configs
WHERE agent_type IN ('image', 'campaign_image')
  AND is_active = TRUE
ORDER BY agent_type;
