-- Agente de imagem (15/09): as cenas JÁ decididas para as outras posições
-- entram no prompt como CFY_OTHER_FRAMES.
--
-- Batch b6c478d3 (Innova Bay · Welcome 1): hero e body saíram com o mesmo
-- produto na mesma parede. Cada run de imagem é independente e nada dizia
-- à segunda o que a primeira mostra. A var `OUTRAS_CENAS`
-- (`prompt-vars-builder.ts`) lista `requisitos.imagem` das outras posições
-- do blueprint; vazia quando nenhuma outra posição tem cena decidida — e
-- aí o template fica idêntico ao de antes.
--
-- UPDATE in-place da linha ATIVA (padrão 20261108/20261135): não bumpa
-- version. Idempotente: só troca quando a âncora existe e a var ainda não
-- está lá.

UPDATE email_agent_configs
SET user_template = replace(
  user_template,
  'CFY_THIS_FRAME — THE ONE IMAGE YOU ARE MAKING NOW.',
  '{{#if OUTRAS_CENAS}}CFY_OTHER_FRAMES — WHAT THE OTHER PHOTOGRAPHS OF THIS EMAIL ALREADY SHOW. Do not repeat them.
Each position of the email tells a different moment of the same story. The scenes below are already taken by other images; this frame must show something else (another moment, another distance, another gesture), never the same product in the same setting again.

{{OUTRAS_CENAS}}

{{/if}}CFY_THIS_FRAME — THE ONE IMAGE YOU ARE MAKING NOW.'
)
WHERE agent_type = 'image'
  AND is_active = true
  AND position('OUTRAS_CENAS' IN coalesce(user_template, '')) = 0
  AND position('CFY_THIS_FRAME — THE ONE IMAGE YOU ARE MAKING NOW.' IN user_template) > 0;

-- Conferência: deve devolver 1 linha com tem > 0.
-- SELECT agent_type, position('OUTRAS_CENAS' IN user_template) AS tem
-- FROM email_agent_configs WHERE agent_type = 'image' AND is_active;
