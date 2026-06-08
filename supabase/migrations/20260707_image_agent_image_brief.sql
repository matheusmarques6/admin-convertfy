-- WS3(b): religa `image_brief` no prompt do agente de imagem.
--
-- A coluna `email_blueprints.image_brief` (instrução de arte por email) era
-- escrita pelas migrations/UI mas NUNCA lida na geração. Agora
-- `buildImagePromptVars` expõe a var `IMAGE_BRIEF`, e aqui o template do agente
-- passa a referenciá-la como instrução autoritativa no topo do prompt.
--
-- Renderer (image/template-renderer.ts) resolve `{{#if IMAGE_BRIEF}}`: quando
-- vazia, o bloco some (retrocompatível com blueprints sem brief).
--
-- Idempotente: só aplica se o template ativo ainda não menciona IMAGE_BRIEF.
-- Datada após 20260624 (seed do template de imagem) e 20260706 (html v3) para
-- garantir que roda depois do template já existir.

UPDATE email_agent_configs
SET user_template =
      E'{{#if IMAGE_BRIEF}}ART DIRECTION (authoritative — overrides the generic scene below):\n{{IMAGE_BRIEF}}\n\n{{/if}}'
      || user_template,
    version = version + 1
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%IMAGE_BRIEF%';
