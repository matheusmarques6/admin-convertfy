-- ============================================================
-- HTML Agent — Hero v6: a hero renderizada é a autoridade; o agente
-- SÓ troca a tag {{HERO_IMAGE}} pela URL gerada
--
-- Decisão (jul/2026): as 8 variantes de hero da biblioteca
-- (email_component_variants, block_type='hero') agora carregam a tag
-- {{HERO_IMAGE}} EXATAMENTE onde o HTML renderizado usa a imagem
-- (ver hero_image_tags_update.sql — 2 variantes corrigidas, 6 já tinham).
-- Com a tag no lugar certo, o agente não precisa (e não deve) opinar
-- sobre a forma da hero: preserva o render byte a byte e só substitui
-- a tag pela URL do image_map.
--
-- Substitui a v5 (20261036), que ainda instruía o agente a CONSTRUIR
-- a forma da hero (podia reescrever o layout autorado).
--
-- Substitui o bloco <hero_overlay_hard_rule> inteiro no prompt ativo.
-- Idempotente via sentinela ("ALREADY AUTHORED CORRECTLY").
-- SYNC CONTRACT: o mesmo texto vive na constante DEFAULT_HTML_SYSTEM_PROMPT
-- (src/lib/agents/chains/html.chain.ts) — paridade em html.chain.lang.test.ts.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '<hero_overlay_hard_rule>[\s\S]*?</hero_overlay_hard_rule>',
  $NEW$<hero_overlay_hard_rule>
This rule governs the HERO block only.

THE REFERENCE HERO IS ALREADY AUTHORED CORRECTLY — including where its image
goes: an `<img>` slot carrying the `{{HERO_IMAGE}}` placeholder. Your ONLY job
on the hero image is to SWAP the `{{HERO_IMAGE}}` tag for the image_map URL
(and `{{HERO_IMAGE_ALT}}` for a short description). PRESERVE everything else
about the hero byte-for-byte: structure, row order (image row vs text rows),
inline styles, widths, paddings, border-radius, comments, VML buttons. Do NOT
rebuild the hero, do NOT reorder image and text rows, do NOT convert the image
to a CSS background, do NOT add overlays/scrims/`position:absolute`, do NOT set
a fixed height on the image (keep `height:auto` as authored), do NOT crop.

If the reference hero carries a hardcoded image URL instead of a tag (legacy
variant), swap that URL for the image_map URL in place — same principle, change
nothing else.

If the hero has NO image in the image_map (generation failed upstream): remove
only the image row (or placeholder cell) and keep the text rows. NEVER invent a
URL, NEVER reuse another block's image.
</hero_overlay_hard_rule>$NEW$,
  'g'
)
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt LIKE '%<hero_overlay_hard_rule>%'
  AND system_prompt NOT LIKE '%ALREADY AUTHORED CORRECTLY%';
