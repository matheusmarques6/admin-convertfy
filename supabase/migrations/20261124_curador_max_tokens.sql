-- Teto de saída do Curador: 8192 → 16000 (08/09)
--
-- O Curador do vault vinha morrendo em `shadow_json_ilegivel`: ele escreve a
-- análise posição a posição ANTES do JSON, e quando a peça é difícil (voltas
-- ao vault, muitas seções) o orçamento acaba no meio da prosa e o JSON nunca
-- fecha. Medido nas 10 últimas runs do agente:
--
--   sucessos: 4.191 · 4.663 · 4.823 · 5.836 · 6.161 · 6.538 · 7.337
--   falhas:   6.190 · 8.328 · 9.636      (teto era 8.192)
--
-- As duas maiores passaram do teto. 16.000 dá folga sobre o pior caso
-- observado (9.636) sem virar cheque em branco.
--
-- Efeito colateral conhecido: o OpenRouter RESERVA o custo máximo da chamada
-- (prompt + max_tokens no preço do modelo), então o piso de saldo fica mais
-- exigente — é o mesmo mecanismo do incidente de crédito de 05/09.
--
-- A linha ativa é a do kimi-k3; o modelo que roda de fato vem de
-- CURADOR_SHADOW_MODEL (sonnet-4.6), mas o max_tokens sai DAQUI.
UPDATE email_agent_configs
SET max_tokens = 16000
WHERE agent_type = 'assembler_chooser' AND is_active = true;
