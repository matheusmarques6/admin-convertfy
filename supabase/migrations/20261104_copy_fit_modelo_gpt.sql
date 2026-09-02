-- 20261104 — o encurtador passa a rodar em GPT-5.4 mini
--
-- Run copy_fit do Welcome 1 (Innova Bay, batch f576a00f, 02/09): o Haiku
-- 4.5 tirou o travessão e preservou a mensagem, mas devolveu ~177 chars
-- para max 130 (e 199 para 180, 158 para 156) nas DUAS passadas, mesmo com
-- alvo_caracteres a 85%. O guard recusou e o corte por código decepou 6 de
-- 8 campos na última frase que cabia ("Plugs directly into any standard
-- outlet."). O corte por código foi removido; o modelo tem de caber sozinho.
--
-- Escolha do owner: openai/gpt-5.4-mini (OpenRouter, $0.75 in / $4.50 out
-- por 1M — mais barato que o Haiku 4.5 a $1 / $5). Roteamento por "/" já
-- vai ao OpenRouter; a tabela de preços do telemetry.callback ganhou a
-- linha `gpt-5-4-mini`.

UPDATE email_agent_configs
   SET model = 'openai/gpt-5.4-mini',
       version = version + 1
 WHERE agent_type = 'copy_fit'
   AND is_active = true;

SELECT agent_type, model, version
  FROM email_agent_configs
 WHERE agent_type = 'copy_fit' AND is_active = true;
