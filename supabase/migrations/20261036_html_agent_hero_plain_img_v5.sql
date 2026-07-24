-- ============================================================
-- HTML Agent — Hero v5: imagem = <img> full-width + texto HTML separado
--
-- Correção da v4 (20261035). A v4 forçou o hero como CSS background-image
-- com texto sobreposto (+ VML + cover) — ficou "muito ruim": o cover CORTA a
-- foto, o texto vivo sobre a imagem fica ilegível/desalinhado, e o background
-- é frágil entre clientes de email.
--
-- Decisão (jul/2026): seguir os templates reais da marca (exports Builder.io):
-- a imagem do hero é um <img> SIMPLES, largura total, ALTURA NATURAL (nunca
-- cortada, sem background-image, sem overlay, sem cover), e o headline/subcopy/
-- CTA são TEXTO HTML de verdade em linhas próprias (empilhamento limpo). Vale
-- para TODOS os flows.
--
-- Substitui o bloco <hero_overlay_hard_rule> inteiro no prompt ativo.
-- Idempotente via sentinela ("THE HERO IMAGE IS A PLAIN").
-- SYNC CONTRACT: o mesmo texto vive na constante DEFAULT_HTML_SYSTEM_PROMPT
-- (src/lib/agents/chains/html.chain.ts) — paridade em html.chain.lang.test.ts.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '<hero_overlay_hard_rule>[\s\S]*?</hero_overlay_hard_rule>',
  $NEW$<hero_overlay_hard_rule>
This rule governs the HERO block only.

THE HERO IMAGE IS A PLAIN, FULL-WIDTH `<img>` — NEVER a CSS `background-image`,
NEVER an overlay, NEVER text burned on top of the photo, NEVER
`background-size:cover`, NEVER a fixed height. The headline, subcopy and CTA are
REAL HTML TEXT in their OWN rows, stacked cleanly with the image (image on its
own row; the text on separate rows, in the order the reference authored them).
This holds for EVERY flow and EVERY reference — if a reference authored the hero
as a background/overlay, CONVERT it to a plain `<img>` + separate text rows.

IMAGE PLACEMENT:
- Render the hero image as a single tag:
  `<img src="{url}" alt="{short description}" width="600" style="display:block;
  width:100%;max-width:600px;height:auto;border:0;">`.
- NATURAL ASPECT — `height:auto`. Show the WHOLE image; NEVER crop it into a
  fixed-height strip, NEVER `background-size:cover`, NEVER set a height on the
  image or its cell.
- The image sits in its OWN `<tr><td style="padding:0;font-size:0;line-height:0;">`.
  The text is in SEPARATE `<tr>`s. Nothing overlaps and nothing bleeds between
  cells.

TEXT (real HTML, its own rows): kicker/eyebrow 11-13px uppercase with
letter-spacing, headline 28-40px, subcopy 15-17px, CTA as a bulletproof button.
Apply color_roles + fonts. NEVER place the text on top of the image.

If the hero has NO image (generation failed upstream): drop the image row and
keep the text rows. NEVER invent a URL or reuse another block's image.
</hero_overlay_hard_rule>$NEW$,
  'g'
)
WHERE agent_type = 'html'
  AND is_active = true
  AND system_prompt LIKE '%<hero_overlay_hard_rule>%'
  AND system_prompt NOT LIKE '%THE HERO IMAGE IS A PLAIN%';
