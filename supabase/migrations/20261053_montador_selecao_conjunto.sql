-- ============================================================
-- Story CM-4 — o Montador deixa de montar e passa a ESCOLHER.
--
-- Desde o CM-2 o documento é concatenado por código; o passo B do LLM tinha
-- ficado sem função. Agora ele ganha o papel que justifica a segunda passada:
-- recebe os até 3 finalistas de TODAS as posições de uma vez e escolhe UMA
-- por posição, olhando o EMAIL INTEIRO.
--
-- O que muda:
--   1. Prompt reescrito do zero. Sai toda instrução de montagem de HTML
--      (slots de imagem, tags canônicas, marcadores de bloco, container
--      600px, CSS variables, blocos sem variante). Entra o critério de
--      CONJUNTO, com as três razões fechadas para sair do rank 1 do Curador:
--      conjunto, viabilidade e histórico.
--   2. `motivo` é OBRIGATÓRIO quando rank != 1 e PROIBIDO quando rank = 1 —
--      mantém o output curto e evita justificativa inventada para confirmar
--      o óbvio.
--   3. max_tokens 16384 -> 2048: o output virou um JSON de ~500 tokens.
--   4. O `output_schema` das variantes passa a ser insumo EXCLUSIVO dele
--      (saiu do Curador na CM-3): é o que revela que um bloco vai exigir
--      campo obrigatório de cupom ou mais slots de produto do que a loja tem.
--
-- Modelo mantido em anthropic/claude-opus-4.8: ele se justificava por gerar
-- 40KB de HTML, e agora faz a decisão mais nobre do pipeline com output
-- curto — o custo cai sozinho. Se a telemetria de `desvios` mostrar que ele
-- quase sempre confirma o Curador, aí sim vale testar um modelo menor.
--
-- Corte seco: zera os prompts para os defaults novos in-code assumirem.
-- Rollback: reativar a versão anterior da row e reverter o código.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = '',
    user_template = '',
    max_tokens = 2048
WHERE agent_type = 'assembler'
  AND is_active = true;

-- Verificação
SELECT agent_type, model, temperature, max_tokens,
       length(system_prompt) AS system_chars,
       length(user_template) AS user_chars
FROM email_agent_configs
WHERE agent_type IN ('assembler_chooser', 'assembler') AND is_active = true
ORDER BY agent_type;
