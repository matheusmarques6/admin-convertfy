-- 20261098 — o encurtador passa a rodar por OpenRouter
--
-- Com o run finalmente gravando (20261096), a primeira execução visível do
-- copy_fit disse o que quatro dias de `corrigidos: 0` escondiam:
--
--   400 {"type":"invalid_request_error","message":"Your credit balance is
--   too low to access the Anthropic API."}
--
-- O roteamento do `invokeAgent` é pelo ID do modelo: sem "/" vai no SDK da
-- Anthropic, com "/" vai no OpenRouter. O copy_fit nasceu com
-- 'claude-haiku-4-5-20251001' e era o ÚNICO agente ativo do pipeline fora
-- do OpenRouter — todos os outros (kimi, gemini, e o próprio Sonnet do
-- hero/subject/estruturador, em 'anthropic/claude-sonnet-4.6') já iam por
-- lá. A conta direta da Anthropic zerou e derrubou só ele.
--
-- Mesmo modelo, mesmo preço (o normalizeModelKey tira o vendor, então o
-- cálculo de custo continua caindo na linha do Haiku 4.5), outro caminho.

UPDATE email_agent_configs
   SET model = 'anthropic/claude-haiku-4.5'
 WHERE agent_type = 'copy_fit'
   AND is_active = true;

SELECT agent_type, model, (model LIKE '%/%') AS via_openrouter
  FROM email_agent_configs
 WHERE agent_type = 'copy_fit' AND is_active = true;
