-- 20261105 — orçamento de saída do encurtador em GPT-5.4 mini
--
-- Run copy_fit 5d7396b5 (Innova Bay, Welcome 1, 02/09 17:11 UTC): primeira
-- execução no openai/gpt-5.4-mini (migration 20261104). tokens_output =
-- 1500 = max_tokens, raw_output VAZIO, erro "Unexpected end of JSON input",
-- 13 alvos e 0 corrigidos (fail-open manteve a copy do n8n).
--
-- Causa: GPT-5.4 mini é modelo de raciocínio — o max_tokens cobre
-- pensamento + resposta. Os 1500 foram dimensionados para o Haiku 4.5, que
-- não pensa; o invoke ainda mandava reasoning effort 'medium' (ajuste do
-- Curador). O modelo gastou o orçamento inteiro pensando e não escreveu
-- nada. O código passou a pedir effort 'low' para este agente e a nomear a
-- causa no erro; aqui sobe o teto: 13 campos precisam de ~800 tokens de
-- resposta, 6000 deixa folga para o raciocínio em 'low'.
--
-- UPDATE in-place da linha ativa (padrão das migrations de agente).

UPDATE email_agent_configs
   SET max_tokens = 6000,
       version = version + 1
 WHERE agent_type = 'copy_fit'
   AND is_active = true;

SELECT agent_type, model, max_tokens, version
  FROM email_agent_configs
 WHERE agent_type = 'copy_fit' AND is_active = true;
