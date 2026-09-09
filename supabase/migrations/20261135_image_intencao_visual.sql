-- Agente de imagem (set/2026): a intenção VISUAL do Estruturador entra
-- ACIMA da direção fotográfica da variante.
--
-- Batch 644d86c5: o Estruturador pediu "foto de uso real em corpo adulto,
-- não estúdio"; a direção da variante (flat-lay) tinha peso 1 e o pedido
-- viajava em CFY_SUPPORT (peso 3). Saiu flat-lay. A var `INTENCAO_VISUAL`
-- (requisitos.imagem da posição, `prompt-vars-builder.ts`) chega vazia
-- quando o Estruturador não decidiu cena — e aí o template fica idêntico
-- ao de antes.
--
-- UPDATE in-place da linha ATIVA (padrão 20261108): não bumpa version.
-- Idempotente: só troca quando a âncora existe e a var ainda não está lá.

UPDATE email_agent_configs
SET user_template = replace(
  user_template,
  '{{#if PHOTO_DIRECTION}}CFY_PRIMARY_BRIEF — PHOTOGRAPHIC DIRECTION OF THIS COMPONENT. YOUR MAIN SOURCE.',
  '{{#if INTENCAO_VISUAL}}CFY_PRIMARY_BRIEF — THE SCENE DECIDED FOR THIS POSITION. HIGHEST WEIGHT.
Decided by the email''s structure for this exact position: what the photograph must SHOW (who, doing what, where). The component direction below says how to shoot it; when they disagree on the scene, this line wins.

{{INTENCAO_VISUAL}}

{{/if}}{{#if PHOTO_DIRECTION}}CFY_PRIMARY_BRIEF — PHOTOGRAPHIC DIRECTION OF THIS COMPONENT. YOUR MAIN SOURCE.'
)
WHERE agent_type = 'image'
  AND is_active = true
  AND position('INTENCAO_VISUAL' IN coalesce(user_template, '')) = 0
  AND position('{{#if PHOTO_DIRECTION}}CFY_PRIMARY_BRIEF — PHOTOGRAPHIC DIRECTION OF THIS COMPONENT. YOUR MAIN SOURCE.' IN user_template) > 0;

-- Conferência: deve devolver 1 linha com tem > 0.
-- SELECT agent_type, position('INTENCAO_VISUAL' IN user_template) AS tem
-- FROM email_agent_configs WHERE agent_type = 'image' AND is_active;
