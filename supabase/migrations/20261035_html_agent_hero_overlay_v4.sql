-- ============================================================
-- HTML Agent — Hero v4: o hero é SEMPRE um overlay integrado de background
--
-- Decisão (jul/2026): o hero deve renderizar como as referências de mercado
-- (Royal Codes / London Brow) — a imagem é o FUNDO da seção e logo/kicker/
-- headline/subcopy/CTA ficam SOBREPOSTOS. Isso vale para TODOS os flows.
--
-- A v3 (20260929) preservava a forma AUTORADA da variante; como a biblioteca
-- de heroes é autorada EMPILHADA (<img> + linhas de texto separadas), o hero
-- saía empilhado (imagem num bloco, texto noutro) — nunca virava o background
-- integrado desejado. A v4 força o overlay sempre e COLAPSA heroes empilhados
-- num único cell.
--
-- O bug que motivou a v3 (imagem 4:5 esmagada numa faixa de 160px) é evitado
-- pela CONSTRUÇÃO de altura adaptativa (padding vertical + background-size:cover,
-- sem altura fixa e sem position:absolute) — mantida aqui. Novidades da v4:
--   • fallback VML obrigatório (Outlook desktop ignora CSS background-image —
--     sem isso o hero renderiza como banda vazia);
--   • scrim de legibilidade via multi-background (gradiente + url);
--   • texto branco por padrão.
--
-- Substitui o bloco <hero_overlay_hard_rule> inteiro no prompt ativo.
-- Idempotente via sentinela ("ALWAYS AN INTEGRATED BACKGROUND-IMAGE OVERLAY").
-- SYNC CONTRACT: o mesmo texto vive na constante DEFAULT_HTML_SYSTEM_PROMPT
-- (src/lib/agents/chains/html.chain.ts) — teste de paridade em
-- html.chain.lang.test.ts.
-- ============================================================

UPDATE email_agent_configs
SET system_prompt = regexp_replace(
  system_prompt,
  '<hero_overlay_hard_rule>[\s\S]*?</hero_overlay_hard_rule>',
  $NEW$<hero_overlay_hard_rule>
This rule governs the HERO block only.

THE HERO IS ALWAYS AN INTEGRATED BACKGROUND-IMAGE OVERLAY: a single full-bleed
cell whose BACKGROUND is the hero image, with the brand logo/kicker, headline,
subcopy and CTA laid OVER the image. This holds for EVERY flow and EVERY
reference. If the reference authored the hero as a stacked `<img>` plus separate
text rows, or as a plain image slot, COLLAPSE it into this one overlay cell.
NEVER render the hero image as a standalone `<img>` row with the text stacked in
a separate row above or below it.

REPAINT, don't reinvent: if the reference hero ALREADY carries a
`background-image` overlay (or a `<!-- hero: overlay ... -->` comment), keep its
structure and comment; swap ONLY the background-image URL for the image_map URL,
apply color_roles + fonts, and pour in the copy.

CONSTRUCTION (this exact recipe is what prevents the image from being squashed
into a thin strip — the bug older versions hit):
- ONE hero cell `<tr><td>`. Put the image on the cell as BOTH the
  `background="{url}"` attribute AND a `background-image` that layers a
  legibility scrim UNDER the text:
  `background-image:linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.5) 100%), url('{url}')`
  with `background-size:cover; background-position:center center;
  background-repeat:no-repeat`, over a solid dark `background-color` fallback.
- ADAPTIVE HEIGHT via GENEROUS VERTICAL PADDING on the cell (e.g.
  `padding:56px 40px 60px 40px`) so the cell GROWS with the text and the next
  block always starts BELOW it. NEVER a fixed height, NEVER `position:absolute`
  (both let the text overflow the image or the next block overlap it).
- OUTLOOK FALLBACK (MANDATORY — Outlook desktop ignores CSS background-image;
  without this the hero renders as an empty band). Wrap the overlaid content in
  VML so the background still paints in Outlook:
  `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;"><v:fill type="frame" src="{url}" color="{bgFallback}" /><v:textbox inset="0,0,0,0"><![endif]-->`
  ... the overlaid content ...
  `<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->`
- TEXT COLOR: white (`#FFFFFF`) by default — it reads over the scrim on any
  photo. Use a dark brand color only if the copy stays clearly legible.
- FONT SIZES by role — NEVER enlarge the eyebrow/kicker: eyebrow/kicker 11-13px
  uppercase with letter-spacing, headline 34-44px, subcopy 15-17px, CTA 13-15px.
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
  AND system_prompt NOT LIKE '%ALWAYS AN INTEGRATED BACKGROUND-IMAGE OVERLAY%';
