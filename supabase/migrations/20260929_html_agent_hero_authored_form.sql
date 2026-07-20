-- ============================================================
-- HTML Agent — Hero v3: a forma AUTORADA da variante é a autoridade
--
-- Bug provado (Luxe Lift welcome#3, 19/jul): a variante "hero section 9"
-- é autorada EMPILHADA (<img> 600px + headline + CTAs em <tr>s próprios),
-- mas a regra v2 dizia "hero é SEMPRE overlay, NUNCA empilhe" — o agente
-- obedeceu, destruiu o design autorado e construiu um overlay violando as
-- próprias regras de construção (height:160px fixo + position:absolute):
-- texto vazando por cima do banner e imagem 4:5 (1200x1500, retrato)
-- esmagada numa faixa horizontal de 160px.
--
-- A v2 nasceu quando a biblioteca não era confiável (stack = sintoma de
-- fallback ruim). Com a biblioteca tagueada, a forma autorada da variante
-- passou a ser confiável — a regra acompanha: 3 formas reconhecidas
-- (overlay-autorado / EMPILHADO-autorado / slot puro), preservação fiel
-- nas duas primeiras, construção adaptável só na terceira.
--
-- Substitui o bloco <hero_overlay_hard_rule> inteiro no prompt ativo.
-- Idempotente via sentinela.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '<hero_overlay_hard_rule>[\s\S]*?</hero_overlay_hard_rule>',
  $NEW$<hero_overlay_hard_rule>
This rule governs the HERO block only.

THE REFERENCE (library variant) IS THE AUTHORITY for the hero's FORM — do NOT
re-invent it. Identify which of the three authored forms the reference uses:

1. OVERLAY-authored — the hero cell/div carries a `background-image`, OR an
   HTML comment describing the overlay construction (e.g. `<!-- hero: overlay,
   adaptive height, kicker 12px -->`): PRESERVE it faithfully. Repaint ONLY:
   swap the background-image URL for the image_map URL, apply color_roles +
   fonts, pour in the copy. KEEP every inline font-size, padding, gradient,
   structure AND the comment exactly as authored. Do NOT re-derive heights or
   sizes. Follow any instruction written in the comment verbatim.

2. STACKED-authored — the hero has an `<img>` slot AND its own authored text
   rows (headline/subcopy/CTA in separate `<tr>`s or elements around the
   image): PRESERVE the stacked layout exactly as authored. Swap the img src
   for the image_map URL (full width, natural aspect ratio — never crop it
   into a fixed-height strip), pour the copy into the authored slots. NEVER
   convert an authored stacked hero into an overlay, NEVER turn the image into
   the background of a fixed-height div, NEVER use `position:absolute` here.

3. PLAIN image slot with NO authored hero text adjacent: BUILD the overlay,
   following the construction rules below.

CONSTRUCTION (only for form 3 — plain slot, no overlay/stack authored):
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
(solid brand color, text in normal flow); in form 2 keep the authored text
rows and drop only the img. NEVER invent a URL or reuse another block's image.
</hero_overlay_hard_rule>$NEW$,
  'g'
)
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt LIKE '%<hero_overlay_hard_rule>%'
  AND system_prompt NOT LIKE '%STACKED-authored%';
