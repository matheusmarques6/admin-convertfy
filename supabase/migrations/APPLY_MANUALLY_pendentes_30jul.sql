-- ============================================================
-- CONSOLIDADO — migrations pendentes de 30/jul/2026.
--
-- Aplicar UMA vez no SQL Editor, na ordem abaixo. Todas idempotentes.
--
--   20261059  coluna design_system      OBRIGATÓRIA junto com o deploy
--   20261060  coluna photo_direction    OBRIGATÓRIA junto com o deploy
--   20261058  coluna hero_vision_model  opcional (sem ela o default in-code assume)
--   20261057  regra "nenhum texto na imagem" no prompt do BANCO
--   20261061  direção fotográfica no prompt do BANCO
--
-- Por que duas são obrigatórias: o select da variante da hero passou a
-- pedir `design_system`, e o carregamento da direção fotográfica pede
-- `photo_direction`. Sem as colunas, a query falha e a hero fica sem
-- variante.
--
-- Por que os prompts precisam de UPDATE: o agente `image` tem system e
-- user_template com 10k+/6k+ chars no banco, então o default in-code nunca
-- é usado — mexer só no código não teria efeito nenhum.
--
-- O SELECT do fim é o único statement que devolve linhas: é o relatório.
-- ============================================================

-- ── 20261059 — Design system por variante ────────────────────────────
-- Regras de DESIGN/implementação da variante, para o agente que a finaliza
-- (hoje só o hero_section). Diferente de copy_guidance, que orienta a
-- ESCRITA: aqui é o desenho — hierarquia, bandas de fundo intencionais,
-- acabamento de botão, comportamento no mobile, o que nunca sai.
ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS design_system TEXT;

COMMENT ON COLUMN email_component_variants.design_system IS
  'Instruções de DESIGN/implementação desta variante, escritas para o agente que a finaliza (hoje só o hero_section). Diferente de copy_guidance, que orienta a ESCRITA: aqui vão as regras visuais — hierarquia, bandas de fundo intencionais, acabamento dos botões, comportamento no mobile, o que nunca pode ser removido. NULL/vazio = a seção não entra no prompt.';


-- ── 20261060 — Direção fotográfica por variante ──────────────────────
-- Briefing do FOTÓGRAFO. O agente de imagem decidia o "como fotografar"
-- sozinho a partir de nicho e posicionamento; do cadastro só vinha o QUE
-- mostrar. Agora a direção entra no topo do prompt e o resto vira contexto.
ALTER TABLE email_component_variants
  ADD COLUMN IF NOT EXISTS photo_direction TEXT;

COMMENT ON COLUMN email_component_variants.photo_direction IS
  'Direção FOTOGRÁFICA desta variante, escrita para o agente de imagem: luz, enquadramento, distância, presença e pose de modelo, cenário, profundidade, tratamento de cor, o que deixar limpo para a copy. Entra como input principal do prompt de imagem (nicho/posicionamento viram contexto). Diferente de image_brief, que diz O QUE mostrar — aqui é COMO fotografar. NULL/vazio = a seção não entra no prompt.';


-- ── 20261058 — Modelo do espelho visual da hero ──────────────────────
-- Kill-switch sem deploy. NULL = default in-code (anthropic/claude-sonnet-4.6);
-- '' = fallback desligado; outro valor = esse modelo (precisa de visão e de
-- rota pelo OpenRouter).
ALTER TABLE email_generation_settings
  ADD COLUMN IF NOT EXISTS hero_vision_model TEXT;

COMMENT ON COLUMN email_generation_settings.hero_vision_model IS
  'Modelo do espelho visual da hero (story CM-8). NULL = default in-code (HERO_VISION_MODEL); string vazia = fallback desligado; outro valor = esse modelo. Precisa de visão e de rota pelo OpenRouter — o caminho Anthropic-direto recusa imagem anexada.';


-- ── 20261057 — "Nenhum texto na imagem", no prompt do banco ──────────
-- A regra já existia e o Gemini desobedeceu: competia com a ideia do email,
-- o brief do slot e a copy do bloco, todos em forma de frase pronta para
-- desenhar. Agora abre e fecha o system prompt.
UPDATE email_agent_configs
SET system_prompt =
  'CFY_NO_TEXT_RULE — ABSOLUTE, OVERRIDES EVERYTHING BELOW.
Render NO text, NO lettering, NO numbers, NO logo, NO wordmark, NO button, NO badge, NO price tag, NO watermark, NO UI element anywhere in the image. Not a headline, not a product name, not a brand name, not a call to action, not a single legible character.
Every word you receive — the email idea, the slot brief, the block copy, the product names — is DIRECTION for the composition. None of it is content to draw.
All copy, the logo and the buttons are placed in HTML ON TOP of your image. Text baked into the image renders twice, cannot be edited, cannot be translated and cannot be A/B tested.
Where the composition seems to call for a headline or a button, leave that area CLEAN and let the layout breathe there.

' || system_prompt || '

CFY_NO_TEXT_RULE — FINAL CHECK
Before returning: the image must contain zero legible characters. If you drew any text, logo or button, redo the composition without it.'
WHERE agent_type = 'image'
  AND is_active = true
  AND system_prompt NOT LIKE '%CFY_NO_TEXT_RULE%';


-- ── 20261061 — Direção fotográfica no prompt do banco ────────────────
-- Envolvida em {{#if}}: variante sem direção escrita não pode abrir uma
-- seção vazia — seção vazia num prompt é convite para o modelo preencher
-- sozinho.
UPDATE email_agent_configs
SET user_template =
  '{{#if PHOTO_DIRECTION}}
CFY_PHOTO_DIRECTION — PHOTOGRAPHIC DIRECTION, YOUR PRIMARY BRIEF.
Written for this exact component by the person who designed it. It governs HOW the photograph is made: light, framing, distance, lens feel, presence and pose of a model, setting, depth, colour treatment, and which area stays clean for copy. Shoot to satisfy it.
Everything else in this prompt — niche, positioning, palette, products, block role — is SUPPORTING CONTEXT: it fills in what the direction leaves open, and never a reason to contradict it.

{{PHOTO_DIRECTION}}

{{/if}}' || user_template
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%CFY_PHOTO_DIRECTION%';


-- ── Relatório ────────────────────────────────────────────────────────
SELECT 10 AS ordem,
       '20261059 · coluna design_system' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_component_variants'
                AND column_name='design_system') THEN 'ok' ELSE 'AUSENTE' END AS estado
UNION ALL
SELECT 20, '20261060 · coluna photo_direction',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_component_variants'
                AND column_name='photo_direction') THEN 'ok' ELSE 'AUSENTE' END
UNION ALL
SELECT 30, '20261058 · coluna hero_vision_model',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='email_generation_settings'
                AND column_name='hero_vision_model') THEN 'ok' ELSE 'AUSENTE' END
UNION ALL
SELECT 40, '20261057 · regra sem texto no prompt de imagem',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_agent_configs
                        WHERE agent_type='image' AND is_active = true
                          AND system_prompt LIKE '%CFY_NO_TEXT_RULE%'$q$,
                   false, true, '')))[1]::text::int, 0) > 0 THEN 'ok'
            ELSE 'AUSENTE' END
UNION ALL
SELECT 50, '20261061 · direcao fotografica no prompt de imagem',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_agent_configs
                        WHERE agent_type='image' AND is_active = true
                          AND user_template LIKE '%CFY_PHOTO_DIRECTION%'$q$,
                   false, true, '')))[1]::text::int, 0) > 0 THEN 'ok'
            ELSE 'AUSENTE' END
ORDER BY ordem;
