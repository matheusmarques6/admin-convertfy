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
--   20261063  fundo pela PALETA + regra de enquadramento
--             (a 20261062 é a v1 deste bloco e NÃO entra aqui — ver a nota
--              na seção; a 63 sozinha já cobre e ainda limpa a 62 avulsa)
--   20261064  prompt do Taguedor zerado (schema-first roda no default in-code)
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
-- "Success. No rows returned" AQUI É O ESPERADO. O SQL Editor do Supabase
-- reporta só o desfecho do script quando ele tem vários statements — o
-- SELECT do fim existe para quem roda por psql/outro cliente. Para VER o
-- relatório, rode depois o VERIFICAR_pronto_para_gerar.sql, que é um
-- statement só (mesmo motivo do DIAGNOSTICO_schema_x_tags.sql).
--
-- Rodar mais de uma vez é seguro: verificado em Postgres 16 local, três
-- passadas seguidas deixam o prompt de imagem byte a byte igual.
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


-- ── 20261063 — Fundo pela PALETA + enquadramento ─────────────────────
-- A 20261062 (versão 1 deste bloco) mandava só o hex do fundo e ainda saiu
-- errado: com a direção pedindo estúdio, o modelo escolheu um cinza-azulado
-- que não é da marca, e a continuidade entre foto e seção — que é o ponto do
-- layout — não aconteceu. Faltava dizer que o fundo TEM de sair da paleta.
-- Junto vai a regra de enquadramento: a foto cortou a cabeça da modelo.
--
-- A v1 NÃO está neste consolidado de propósito. Aplicar as duas em sequência
-- só funciona uma vez: a v2 apaga a marca `CFY_BG_COLOR`, e numa segunda
-- passada a v1 acha que nunca rodou e se re-insere ACIMA da v2 — duas
-- instruções de fundo contraditórias no mesmo prompt. O `regexp_replace`
-- abaixo continua removendo a v1 de quem já rodou a 20261062 avulsa.
UPDATE email_agent_configs
SET user_template =
  '{{#if BG_COLOR}}
CFY_BACKDROP_V2 — BACKDROP COLOUR, NOT NEGOTIABLE.
The section this image sits in is painted {{BG_COLOR}}. When the composition calls for a plain, continuous or studio backdrop, the photograph''s background MUST be that exact hex, so photo and section read as ONE CONTINUOUS SURFACE with no visible seam. That continuity is the point of the layout, not a detail.
If the direction asks for a different backdrop, it still has to be one of the STORE''s OWN colours — {{primary_colors}} {{secondary_colors}}. Never a neutral you chose yourself: no generic studio grey, no off-white, no colour from outside the brand palette.
The only thing that overrides this is a direction explicitly asking for a real setting (a room, a street, outdoors) — then shoot the setting.

FRAMING PEOPLE. When a person appears, the frame NEVER cuts the top of the head or crops the face out. Either the head is fully inside the frame, or the crop is a deliberate, recognisable one that starts BELOW the shoulders (a torso or detail shot). A head sliced by the top edge reads as a mistake and ruins the section.

{{/if}}' ||
  regexp_replace(user_template, '\{\{#if BG_COLOR\}\}[\s\S]*?\{\{/if\}\}\s*', '', 'g')
WHERE agent_type = 'image'
  AND is_active = true
  AND user_template NOT LIKE '%CFY_BACKDROP_V2%';


-- ── 20261064 — Prompt do Taguedor zerado (schema-first) ──────────────
-- O prompt do Taguedor ganhou a regra que faltava: tag divergente do schema
-- é RENOMEADA para {{MAIÚSCULA_DA_KEY}}. Antes a regra dizia o oposto
-- ("mantenha a tag existente, não renomeie") — era ela que produzia a
-- biblioteca desalinhada. Enquanto houver texto no banco, o default in-code
-- NUNCA é usado; zerar é o corte seco (mesmo padrão das 20261044-46).
UPDATE email_agent_configs
SET system_prompt = '',
    user_template = ''
WHERE agent_type = 'component_tagger'
  AND is_active = true
  AND (length(system_prompt) > 0 OR length(user_template) > 0);


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
UNION ALL
SELECT 60, '20261063 · fundo pela paleta + enquadramento',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COUNT(*) AS r FROM public.email_agent_configs
                        WHERE agent_type='image' AND is_active = true
                          AND user_template LIKE '%CFY_BACKDROP_V2%'$q$,
                   false, true, '')))[1]::text::int, 0) > 0 THEN 'ok'
            ELSE 'AUSENTE' END
UNION ALL
SELECT 70, '20261064 · prompt do Taguedor zerado (0/0 = default in-code)',
       CASE WHEN to_regclass('public.email_agent_configs') IS NULL THEN 'AUSENTE'
            WHEN COALESCE((xpath('//r/text()', query_to_xml(
                   $q$SELECT COALESCE(SUM(length(system_prompt)
                                        + length(user_template)), 0) AS r
                        FROM public.email_agent_configs
                       WHERE agent_type='component_tagger'
                         AND is_active = true$q$,
                   false, true, '')))[1]::text::int, 0) = 0 THEN 'ok'
            ELSE 'PENDENTE' END
ORDER BY ordem;
