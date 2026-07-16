-- ============================================================
-- HTML Agent — Hero Overlay v2 (biblioteca é a autoridade)
--
-- Problemas observados (Luxe Lift, abandoned cart):
--  1) O hero (background-image + texto) TRANSBORDAVA a altura fixa (750px)
--     e o bloco seguinte cobria o excesso — texto absolute escapava a célula.
--  2) Os tamanhos do texto do hero (ex.: kicker) saíam INVENTADOS pelo agente,
--     maiores que na arquitetura.
--
-- Causa: a hero_overlay_hard_rule mandava o agente CONSTRUIR o hero do zero
-- ("ALWAYS build... even if the reference stacks") — improvisando altura e
-- tamanhos.
--
-- Correção: a VARIANTE da biblioteca (email_component_variants) passa a ser a
-- AUTORIDADE do hero. Se o hero da referência já é overlay (background-image
-- OU um comentário de construção), o agente PRESERVA fielmente (repaint) — sem
-- re-derivar altura/tamanhos. Só constrói do zero quando não há overlay, e aí
-- com ALTURA ADAPTÁVEL (padding, nunca position:absolute) e tamanhos por papel
-- (kicker pequeno). Continua SEMPRE overlay (nunca stacked, nunca burned).
--
-- Substitui o bloco <hero_overlay_hard_rule> inteiro no prompt ativo.
-- Idempotente via sentinela.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '<hero_overlay_hard_rule>[\s\S]*?</hero_overlay_hard_rule>',
  $NEW$<hero_overlay_hard_rule>
This rule governs the HERO block only. The hero is ALWAYS text-over-image
(overlay): the image is a BACKGROUND and headline/copy/CTA sit ON TOP of it.
NEVER stack the text below the image, and NEVER expect the text baked inside
the image.

THE REFERENCE (library variant) IS THE AUTHORITY — do NOT re-invent the hero:
- If the hero in reference_html is ALREADY an overlay (its cell/div carries a
  `background-image`, OR an HTML comment describing the overlay construction,
  e.g. `<!-- hero: overlay, adaptive height, kicker 12px -->`), PRESERVE it
  faithfully. Repaint ONLY: swap the background-image URL for the image_map
  URL, apply color_roles + fonts, pour in the copy. KEEP every inline
  font-size, padding, gradient, structure AND the comment exactly as authored.
  Do NOT re-derive heights or sizes. Follow any instruction written in the
  comment verbatim.
- Only if the hero is a PLAIN image slot with no overlay authored do you BUILD
  the overlay, following the construction rules below.

CONSTRUCTION (only when the reference had no overlay authored):
- ADAPTIVE HEIGHT — never a fixed height that the text can overflow. Use a
  table cell with the image as `background-image` (`background-size:cover;
  background-position:center top`) and GENEROUS VERTICAL PADDING (e.g.
  `padding-top:320px; padding-bottom:44px`) so the cell GROWS with the text
  and the next block always starts BELOW it. DO NOT use `position:absolute`
  for the hero text — absolute escapes the cell and the next block overlaps it
  (the exact bug this rule prevents).
- Legibility: a gradient scrim behind the text
  (`linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.6) 100%)`).
- FONT SIZES by role (small kicker, large headline) — NEVER enlarge the
  eyebrow/kicker: eyebrow/kicker 11-13px uppercase with letter-spacing,
  headline 34-44px, subcopy 15-17px, CTA 13-15px.
- The hero is its OWN `<tr><td>`; the next block is a SEPARATE `<tr>`. Nothing
  may bleed from one cell into the next.

If the hero has NO image (generation failed upstream): render a text-only hero
(solid brand color, text in normal flow). NEVER invent a URL or reuse another
block's image.
</hero_overlay_hard_rule>$NEW$,
  'g'
)
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt LIKE '%<hero_overlay_hard_rule>%'
  AND system_prompt NOT LIKE '%THE REFERENCE (library variant) IS THE AUTHORITY%';
