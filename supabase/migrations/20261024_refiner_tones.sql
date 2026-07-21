-- ============================================================
-- Refinador Tipográfico recebe os tons canônicos da loja.
--
-- A fase 2 passa a renderizar a var {{tones}} (deriveToneKeys do tom de
-- voz — Urgente/Aspiracional/Educacional/Descontraído/Premium/Amigável).
-- Este UPDATE injeta a seção <tones> no user_template ATIVO do refiner e
-- 1 frase no system prompt. Estratégia em 2 passos, idempotente
-- (guard NOT LIKE), mesmo padrão da 20261023.
-- ============================================================

-- 1. Inserção no ponto canônico (logo após o fechamento de <store>).
UPDATE email_agent_configs
SET user_template = REPLACE(
  user_template,
  '</store>',
  '</store>

<tones>{{tones}}</tones>'
)
WHERE agent_type = 'refiner'
  AND is_active = true
  AND user_template NOT LIKE '%{{tones}}%'
  AND user_template LIKE '%</store>%';

-- 2. Fallback: template divergente sem </store> → apenda ao final.
UPDATE email_agent_configs
SET user_template = user_template || '

<tones>{{tones}}</tones>'
WHERE agent_type = 'refiner'
  AND is_active = true
  AND user_template NOT LIKE '%{{tones}}%';

-- 3. System prompt: sinal de como usar os tons.
UPDATE email_agent_configs
SET system_prompt = system_prompt || '

TONS CANÔNICOS: o input traz <tones> (Urgente, Aspiracional, Educacional, Descontraído, Premium, Amigável — derivados do tom de voz da marca). Use-os como sinal ADICIONAL do espectro da voz visual: Premium/Aspiracional puxam para serifada elegante; Descontraído/Amigável para sans com personalidade; Urgente para contraste de peso marcado. A pesquisa continua sendo a fonte primária.'
WHERE agent_type = 'refiner'
  AND is_active = true
  AND system_prompt NOT LIKE '%TONS CANÔNICOS%';
