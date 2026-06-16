-- ============================================================
-- Epic AE — troca o modelo do Montador (assembler) de Opus 4.8 para GPT-5.4
-- via OpenRouter.
--
-- Motivo: o Montador (Opus 4.8, ~$0.60/req) é ~70% de todo o gasto de IA do
-- sistema. GPT-5.4 (input $2.50/M · output $15/M) é ~3x mais barato no preço
-- de tabela que o Opus (15/75).
--
-- GPT-5.4 é modelo de REASONING (gera "thinking tokens" cobrados como output).
-- Pra o custo ser previsível, o invoke (llm-invoke.ts) trava
-- `reasoning.effort='low'` (≈20% do max_tokens p/ reasoning) e OMITE
-- `temperature`: reasoning models não a usam e o OpenRouter a dropa sem erro,
-- então o comportamento é regulado pelo effort, não pela temperatura. O id
-- com "/" roteia pelo OpenRouter. O pricing foi adicionado em
-- telemetry.callback.ts pra a telemetria não cair no fallback (Sonnet).
--
-- Requer OPENROUTER_API_KEY no ambiente. Idempotente.
-- ============================================================

UPDATE email_agent_configs
SET model = 'openai/gpt-5.4'
WHERE agent_type = 'assembler' AND is_active = true;
