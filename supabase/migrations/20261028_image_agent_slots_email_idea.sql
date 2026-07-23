-- ============================================================
-- Agente de imagem: IMAGE_SLOTS + ideia do email (enriquecimento jul/2026).
--
-- O user_template ATIVO abre hoje com o bloco {{#if IMAGE_BRIEF}}ART
-- DIRECTION…{{/if}}. Prependamos DUAS seções novas:
--   1. <ideia_do_email> ({{EMAIL_IDEIA}}) — o ângulo geral que a imagem
--      sustenta (o modelo compõe pra reforçar, NUNCA renderiza o texto).
--   2. ART DIRECTION por SLOT ({{IMAGE_SLOTS}}) — schema (especificidade/
--      exemplo/formato) + comentário do designer no <td> + a copy REAL do
--      grupo daquele slot. Fonte PRIMÁRIA de direção de arte.
-- O {{IMAGE_BRIEF}} legado permanece como fallback (o builder o SUPRIME
-- quando IMAGE_SLOTS existe, então nunca duplica).
--
-- REPLACE idempotente do início do template (guard NOT LIKE '%IMAGE_SLOTS%').
-- Prompt editado à mão fica intocado (REPLACE no-op se o trecho não bate).
-- As vars snake_case cortadas (tom_voz/persona/diferencial) NÃO aparecem
-- neste template (ele já usa as UPPERCASE niche-adaptive) — nada a remover.
-- ============================================================

UPDATE email_agent_configs
SET user_template = REPLACE(
  user_template,
  '{{#if IMAGE_BRIEF}}ART DIRECTION (authoritative — overrides the generic scene below):
{{IMAGE_BRIEF}}',
  '{{#if EMAIL_IDEIA}}EMAIL IDEA (the overall angle this image supports — compose to reinforce it; do NOT render this text):
{{EMAIL_IDEIA}}

{{/if}}{{#if IMAGE_SLOTS}}ART DIRECTION — IMAGE SLOTS (authoritative; per slot: schema spec, the designer''s slot comment, and the block copy this image accompanies — compose to fit, NEVER render any of this text):
{{IMAGE_SLOTS}}

{{/if}}{{#if IMAGE_BRIEF}}ART DIRECTION (authoritative — overrides the generic scene below):
{{IMAGE_BRIEF}}'
)
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%IMAGE_SLOTS%';
