-- 20261101 — o Curador do vault vira o vigente (fase 3, com a inversão)
--
-- Até aqui rodavam DOIS Curadores em toda geração da fase 1: o vivo
-- (kimi-k3, metadados do banco, 14,31 ¢) e o shadow (sonnet-4.6, protocolo
-- do vault + eixos + notas de seção + convivência + requisitos, 28,19 ¢),
-- cuja saída era descartada. Agora o segundo é o único: 28,19 ¢ no lugar de
-- 42,50 ¢ — a virada sai MAIS BARATA que o estado anterior.
--
-- A inversão em relação ao plano original (fase 3 do
-- docs/email-generation/plano-curador-cerebro-vault.md): lá o Curador
-- SUBSTITUIRIA a estrutura do outline. Aqui ele a SEGUE. A sequência de
-- blocos é da pessoa que a desenhou na aba Arquitetura; o Curador atribui o
-- papel de cada posição e escolhe as variantes. O prompt foi reescrito e o
-- `conformarEstrutura` garante em código (a estrutura de entrada vence
-- sempre, e o desvio vira telemetria).
--
-- Rollback sem deploy: voltar `curador_vault_mode` para 'shadow' devolve o
-- kimi vivo com o prompt de hoje, byte a byte; 'off' tira o vault do
-- caminho inteiro. O `model` abaixo só é lido no caminho do kimi — o
-- Curador do vault usa CURADOR_SHADOW_MODEL (env, default sonnet-4.6).

UPDATE email_generation_settings
   SET curador_vault_mode = 'on',
       updated_at = now()
 WHERE curador_vault_mode IS DISTINCT FROM 'on';

-- O fallback (quando o Curador do vault falha e o caminho do kimi assume)
-- continua no modelo de sempre. Nada a mudar aqui — a linha existe para
-- deixar explícito que a decisão foi consciente:
--   email_agent_configs.assembler_chooser.model permanece moonshotai/kimi-k3.

SELECT curador_vault_mode, estruturador_mode, updated_at
  FROM email_generation_settings;
