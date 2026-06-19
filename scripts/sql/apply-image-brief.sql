-- apply-image-brief.sql
--
-- Religa o `IMAGE_BRIEF` (direcao de arte POR BLOCO, gerada pelo Blueprint) no
-- prompt do agente de imagem. Re-aplica a migration
--   supabase/migrations/20260707_image_agent_image_brief.sql
-- que NAO foi aplicada no banco de prod (config ativo ficou em version=1 e o
-- user_template nunca passou a referenciar IMAGE_BRIEF).
--
-- SINTOMA que isso corrige: todas as imagens do email saiam IGUAIS porque o
-- template caia no ramo generico por email_number (E1) e ignorava o
-- image_brief distinto que o Blueprint produz por bloco (hero=editorial,
-- story=jantar, features=close circular sem modelo, products=fundo escuro...).
--
-- Como rodar: Supabase Studio -> SQL Editor -> colar e executar.
-- Idempotente: o WHERE `user_template NOT LIKE '%IMAGE_BRIEF%'` impede dupla
-- aplicacao (rodar 2x nao duplica o bloco).

UPDATE email_agent_configs
SET user_template =
      E'{{#if IMAGE_BRIEF}}ART DIRECTION (authoritative — overrides the generic scene below):\n{{IMAGE_BRIEF}}\n\n{{/if}}'
      || user_template,
    version = version + 1
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%IMAGE_BRIEF%';

-- Conferir (esperado apos o UPDATE: usa_image_brief = true, version = 2):
-- SELECT agent_type, is_active, version,
--        user_template LIKE '%IMAGE_BRIEF%' AS usa_image_brief,
--        LEFT(user_template, 160) AS template_head
-- FROM email_agent_configs
-- WHERE agent_type = 'image' AND is_active = true;
