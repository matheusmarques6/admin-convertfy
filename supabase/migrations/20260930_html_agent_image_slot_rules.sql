-- ============================================================
-- HTML Agent — image_slot_rules v2: casamento slot↔imagem por TAG,
-- RETROCOMPATÍVEL com payload legado
--
-- Bug provado (Luxe Lift welcome#1, 20/jul): o reference do Montador pedia
-- 7 slots de imagem, o image_map chegou com 1 única URL e o agente CLONOU
-- essa imagem 10 vezes pelo email — inclusive sobre placeholders de TEXTO.
--
-- v2 (20/jul, pós-incidente): a v1 destas regras foi aplicada ANTES do
-- deploy do código que enriquece o image_map (tag/render_width_px) — o
-- agente, sem tags pra casar, REMOVEU os slots e o email saiu em branco.
-- A regra 0 (LEGACY PAYLOAD GUARD) torna o prompt seguro nas duas fases:
-- payload legado ({id,url,aspect_ratio,overlay}) → comportamento clássico
-- por posição, NUNCA remove slot; payload novo (com "tag") → regras
-- completas. aspect_ratio é respeitado POR ENTRADA nos dois modos (cada
-- imagem foi composta para o formato do próprio slot — hero 4:5, produto
-- 4:3, avatar 1:1).
--
-- ⚠️ ORDEM DE ROLLOUT: seguro aplicar a qualquer momento (graças à regra
-- 0), mas o ganho completo só existe com o código do image_map v2
-- deployado (buildImageMap em src/lib/agents/html/build-vars.ts).
--
-- Idempotente: remove versão anterior do bloco e re-anexa.
-- ============================================================

-- 1) Remove versão anterior do bloco (v1 ou v2) — permite reaplicar.
UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '\n?<image_slot_rules>[\s\S]*?</image_slot_rules>\n?',
  ''
)
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt LIKE '%<image_slot_rules>%';

-- 2) Anexa o bloco canônico (v2) ao final do prompt ativo.
UPDATE email_agent_configs
SET system_prompt = system_prompt || $RULES$

<image_slot_rules>
Image placement is TAG-DRIVEN. The reference marks image slots with {{*_IMAGE}} / {{*_THUMB}} placeholders (e.g. {{HERO_IMAGE}}, {{PRODUCTS_IMAGE}}, {{REVIEW_1_IMAGE}}); <image_map> entries may carry "tag", "block_type", "aspect_ratio" and "render_width_px". These rules OVERRIDE item 4 of <substitute_only_these> wherever they conflict:

0. LEGACY PAYLOAD GUARD: if the <image_map> entries do NOT carry a "tag" field, this is a legacy payload — match images by entry id only (IMG_{position} ↔ the block at that position), respect each entry's aspect_ratio, and NEVER remove a slot because a tag is missing: fill what you can and leave the rest as authored (rule 3 does NOT apply). Rules 1–3 apply ONLY when entries carry "tag".
1. MATCH BY TAG: fill a slot ONLY with the image_map entry whose "tag" matches the slot's placeholder name (indexes count: {{REVIEW_2_IMAGE}} matches tag REVIEW_2_IMAGE, not REVIEW_1_IMAGE). If no entry carries that tag, match by block position (entry id IMG_{position} vs the block the slot belongs to). Still no match → rule 3.
2. ONE SLOT PER IMAGE: each image_map URL appears AT MOST ONCE in the whole email. NEVER reuse an image to fill a second slot, never use one block's image inside another block. Fewer images than slots means some slots stay unfilled — that is correct.
3. UNFILLED SLOT → REMOVE: a slot with no matching image is REMOVED — delete the placeholder element (or its dedicated <tr>); if siblings share the row, collapse only that cell. Do NOT leave the raw {{TAG}} token, do NOT substitute a different image, do NOT invent a URL.
4. TEXT SLOTS ARE NOT IMAGE SLOTS: never insert an <img> where the reference has a TEXT placeholder ({{BADGE_1_TEXT}}, {{USP_1_TITLE}}, {{REVIEW_1_NAME}}...). A colored box holding a text token is a TEXT element even if it visually resembles a placeholder box.
5. RENDER SIZE: respect each entry's aspect_ratio — the image was composed and sized for THAT slot (hero 4:5, product 4:3, avatar/thumb 1:1); a 1:1 avatar/thumb stays small and square, never stretched into a banner. When the entry carries render_width_px, the inserted <img> carries width="{render_width_px}" as an HTML attribute AND style="display:block;width:100%;max-width:{render_width_px}px;height:auto;". When it does not (legacy payload), keep the slot's authored width.
</image_slot_rules>$RULES$
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt NOT LIKE '%<image_slot_rules>%';
