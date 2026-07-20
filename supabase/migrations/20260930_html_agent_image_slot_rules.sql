-- ============================================================
-- HTML Agent — image_slot_rules: casamento slot↔imagem por TAG
--
-- Bug provado (Luxe Lift welcome#1, 20/jul): o reference do Montador pedia
-- 7 slots de imagem ({{HERO_IMAGE}}, {{PRODUCTS_IMAGE}}, {{REVIEW_N_IMAGE}}...),
-- o image_map chegou com 1 única URL e o agente CLONOU essa imagem 10 vezes
-- pelo email (17 <img> no HTML final), inclusive em elementos que carregavam
-- placeholder de TEXTO ({{BADGE_N_TEXT}}) — a regra antiga definia slot como
-- "td com background accent", pré-contrato de tags, e mandava width:100% cego.
--
-- O image_map agora carrega, por entrada: tag canônica do slot, block_type,
-- aspect_ratio DO BLOCO e render_width_px (deploy junto: buildImageMap em
-- src/lib/agents/html/build-vars.ts — inclui também os avatares de
-- testimonial gravados em items[].avatar_url, antes invisíveis).
--
-- Este bloco de regras casa slot↔imagem pela tag, proíbe reuso de URL,
-- manda REMOVER slot sem imagem e dimensiona o <img> pelo render_width_px.
-- Idempotente: só aplica se o prompt ativo ainda não contém o bloco;
-- regexp_replace remove versão anterior do bloco antes de re-anexar
-- (permite re-rodar para atualizar o texto).
-- ============================================================

-- 1) Remove versão anterior do bloco (se existir) — permite reaplicar.
UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '\n?<image_slot_rules>[\s\S]*?</image_slot_rules>\n?',
  ''
)
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt LIKE '%<image_slot_rules>%';

-- 2) Anexa o bloco canônico ao final do prompt ativo.
UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULES$

<image_slot_rules>
Image placement is TAG-DRIVEN. The reference marks image slots with {{*_IMAGE}} / {{*_THUMB}} placeholders (e.g. {{HERO_IMAGE}}, {{PRODUCTS_IMAGE}}, {{REVIEW_1_IMAGE}}); each <image_map> entry carries "tag", "block_type", "aspect_ratio" and "render_width_px". These rules OVERRIDE item 4 of <substitute_only_these> wherever they conflict:

1. MATCH BY TAG: fill a slot ONLY with the image_map entry whose "tag" matches the slot's placeholder name (indexes count: {{REVIEW_2_IMAGE}} matches tag REVIEW_2_IMAGE, not REVIEW_1_IMAGE). If no entry carries the tag, match by block position (entry id IMG_{position} vs the block the slot belongs to). Still no match → rule 3.
2. ONE SLOT PER IMAGE: each image_map URL appears AT MOST ONCE in the whole email. NEVER reuse an image to fill a second slot, never use one block's image inside another block. Fewer images than slots means some slots stay unfilled — that is correct.
3. UNFILLED SLOT → REMOVE: a slot with no matching image is REMOVED — delete the placeholder element (or its dedicated <tr>); if siblings share the row, collapse only that cell. Do NOT leave the raw {{TAG}} token, do NOT substitute a different image, do NOT invent a URL.
4. TEXT SLOTS ARE NOT IMAGE SLOTS: never insert an <img> where the reference has a TEXT placeholder ({{BADGE_1_TEXT}}, {{USP_1_TITLE}}, {{REVIEW_1_NAME}}...). A colored box holding a text token is a TEXT element even if it visually resembles a placeholder box.
5. RENDER SIZE: every inserted <img> carries width="{render_width_px}" as an HTML attribute AND style="display:block;width:100%;max-width:{render_width_px}px;height:auto;". Respect the entry's aspect_ratio — a 1:1 avatar/thumb stays small and square, never stretched into a banner.
</image_slot_rules>$RULES$
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt NOT LIKE '%<image_slot_rules>%';
