-- ============================================================
-- Blueprint Agent — limite do HERO_KICKER (eyebrow do hero) = 24 chars
--
-- O Blueprint agent deriva o copy_spec (orçamento min/max de caracteres por
-- campo) e o envia ao n8n, que gera a copy dentro desse orçamento. O prompt
-- listava guarda-corpos para headline/body/cta/code/title, mas NÃO para o
-- eyebrow — então o kicker do hero saía longo demais (ex.: "You stopped by —
-- we noticed."), forçando o layout do overlay.
--
-- Esta regra fixa o teto do eyebrow do HERO em 24 caracteres (kicker de 1
-- linha). Append idempotente ao prompt ativo (mesmo padrão das migrations
-- 20260817/20260820/20260922).
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULE$

REGRA ESPECÍFICA DO HERO: o campo `eyebrow` (kicker) do bloco hero tem MÁXIMO 24 caracteres no copy_spec — é um kicker de 1 linha (1-3 palavras). NUNCA emita max_chars > 24 para o eyebrow do hero, mesmo que a geometria comporte mais.$RULE$
WHERE agent_type = 'blueprint'
  AND is_active = true
  AND system_prompt NOT LIKE '%eyebrow` (kicker) do bloco hero tem MÁXIMO 24%';
