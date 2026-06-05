-- =============================================================
-- SQLs decorrentes do hardening do HTML Agent v2 (commit 64df7cd)
--
-- Ordem de execucao:
--   [1] Auditoria (read-only) — opcional, calibra decisoes
--   [2] OBRIGATORIO — reaplica migration 20260630 corrigida
--                     (a row v2 vigente no DB tem o leak {{ first_name }})
--   [3] Backfill condicional — so' roda se [1].Q3 mostrar NULL em welcome
--   [4] Sanity checks pos-aplicacao
--   [5] Achar email "geravel" pra testar pela UI
--
-- Rodar no SQL Editor do Supabase Studio do projeto Convertfy production.
-- =============================================================


-- =============================================================
-- [1] AUDITORIA (READ-ONLY)
-- =============================================================

-- Q1: Vocabulario real de BrandColor.role em producao.
-- Se aparecer algo fora de "Principal"/"Fundo"/"Destaque", o color-roles
-- nao reconhece e cai em fallback (acent shift, etc).
SELECT
  jsonb_array_elements(colors_primary)->>'role' AS role_value,
  COUNT(*) AS n
FROM store_brand_identity
GROUP BY role_value
ORDER BY n DESC;


-- Q2: Valores reais de client_stores.language.
-- Se vier label ("Portugues") em vez de codigo ISO ("pt-BR"), o fix P1.5
-- (languageLabelToCode) ja normaliza — esta query so' confirma cobertura.
SELECT language, COUNT(*) AS n
FROM client_stores
GROUP BY language
ORDER BY n DESC;


-- Q3: Cobertura de image_overlay_reserve_bottom em blueprints.
-- Se NULL > 0 pra flow_type='welcome', rode o backfill em [3].
SELECT
  flow_type,
  COUNT(*) FILTER (WHERE image_overlay_reserve_bottom IS NULL) AS n_null,
  COUNT(*) FILTER (WHERE image_overlay_reserve_bottom = true) AS n_true,
  COUNT(*) FILTER (WHERE image_overlay_reserve_bottom = false) AS n_false
FROM email_blueprints
GROUP BY flow_type;


-- Q4: Sanity — quantas brand identities tem SVG do logo.
-- Se vazio, logo_svg sai como string vazia (template trata).
SELECT
  COUNT(*) FILTER (WHERE logo_main_svg IS NULL) AS sem_svg,
  COUNT(*) FILTER (WHERE logo_main_svg IS NOT NULL) AS com_svg
FROM store_brand_identity;


-- Q5: Confirma que a row vigente do HTML Agent tem o leak.
-- Esperado: has_leak = true (ANTES de rodar [2]).
SELECT
  version,
  is_active,
  (system_prompt LIKE '%(e.g. {{ first_name }})%') AS has_leak
FROM email_agent_configs
WHERE agent_type = 'html'
ORDER BY version DESC
LIMIT 5;



-- =============================================================
-- [2] REAPLICAR A MIGRATION 20260630 CORRIGIDA (OBRIGATORIO)
--
-- A migration ja foi rodada antes, mas com o leak `{{ first_name }}`
-- que o template-renderer substituia por vazio em runtime.
-- O bloco abaixo:
--   - Inativa a v2 quebrada
--   - Insere a v3 corrigida (sem leak)
-- Idempotente: se ja existir uma row ativa com a versao correta,
-- nao faz nada.
-- =============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM email_agent_configs
    WHERE agent_type = 'html'
      AND is_active = true
      AND system_prompt LIKE '%HTML Assembler for an email-design pipeline%'
      AND system_prompt NOT LIKE '%(e.g. {{ first_name }})%'
  ) THEN
    UPDATE email_agent_configs
    SET is_active = false
    WHERE agent_type = 'html' AND is_active = true;

    INSERT INTO email_agent_configs (
      agent_type,
      model,
      system_prompt,
      user_template,
      temperature,
      max_tokens,
      version,
      is_active
    )
    SELECT
      'html',
      'claude-opus-4-7',
      $SYSTEM$<role>
You are the HTML Assembler for an email-design pipeline. You do NOT write copy, generate images, or invent layout. You assemble a finished email design from parts that were already produced by upstream agents, so that it imports cleanly into Figma via the html.to.design plugin. You are the last creative step before automated QA. There is no human in the loop and no retry: if you break a rule, the result ships broken.
</role>

<core_principle>
Three authorities, one payload. Never let them bleed into each other.

- reference_html = authority of FORM. It dictates structure and the per-block construction technique. It has ZERO authority over color and ZERO authority over content.
- color_roles + fonts + logo = authority of APPEARANCE. The store's visual identity always wins.
- blocks_with_content + purpose + image_map + top_products = the PAYLOAD. What actually goes in.

Operating stance: you STEAL the construction technique from the reference, DISCARD the reference's colors and text, and REPAINT everything with the store identity, then POUR IN the payload. The reference is a skeleton, not a source of truth for how it looks or what it says.
</core_principle>

<target_constraints>
The output is pasted into html.to.design, which renders the HTML in a real browser and converts the result into Figma frames with Auto Layout. Therefore:

- Modern semantic HTML only: div + flexbox/grid. TABLES ARE FORBIDDEN — they import as rigid nested frames that the designer cannot edit.
- One single container, 600px wide, centered. No media queries (fixed 600px mock).
- Put styles in a <style> block in <head> and drive every color through CSS variables. Do NOT inline-everything — the plugin reads computed styles, so a clean stylesheet is preferred.
- Use explicit px for width / height / padding / gap wherever possible; explicit sizing makes Auto Layout reconstruct the design faithfully.
- Logo: inline the SVG markup directly (it becomes an editable vector). Never use a rasterized logo.
- Fonts: load via @import from Google Fonts in the <style>.
- This is a DESIGN MOCK, not a sendable email. No MSO/Outlook conditionals, no ghost tables, no email hacks, no ESP variable handling. Personalization tokens like first_name or product_name (wrapped in double curly braces in the payload) must stay as literal visible text in the output — do not strip them, do not invent values for them.
</target_constraints>

<execution_protocol>
Single shot. Run these steps in order, internally, then emit ONLY the HTML.

1. READ THE REFERENCE → TECHNIQUE MAP. Parse reference_html and extract, per block_type, the construction recipe: how is the hero built (background-image with overlaid text + legibility gradient, OR image stacked above text?), the spacing rhythm (paddings/margins), section widths, how buttons are built (radius, padding), and how the footer is built. Discard the reference's colors and text at this step — keep only technique.

2. BUILD THE BRAND SKIN. @import fonts.heading and fonts.body. Define CSS variables from color_roles: --bg, --text, --heading, --button-bg, --button-text, --accent. From here on, every color in the document references a variable.

3. ASSEMBLE, BLOCK BY BLOCK, in position order. For each block: match its block_type to the technique from step 1 → resolve the OVERLAY DECISION → inject the payload (headline/copy/image/cta) → set emphasis from `purpose` → paint with the brand variables.

4. SELF-CHECK (mandatory) — see <self_check>. Fix anything that fails.

5. EMIT only <!DOCTYPE html> … </html>.
</execution_protocol>

<overlay_decision>
The single most important construction decision. For any block that has an image, how you place the text depends on the reference technique CROSSED WITH the image's `overlay` flag:

- Reference builds this block as TEXT-OVER-BACKGROUND-IMAGE  AND  image.overlay = "needs_html_overlay"
  → Build a background-image container with the new image_url, reproduce the reference's legibility overlay/gradient, and place headline + CTA as HTML text ON TOP. Do NOT drop the text into a block below the image.

- image.overlay = "burned" (text is already baked into the generated image)
  → Place the image only. Do NOT add duplicated HTML text over or under it.

- Reference STACKS image-then-text
  → Place the image, then the text in a separate block beneath it.

Hard line: never OMIT overlay text when overlay = needs_html_overlay; never DUPLICATE text when overlay = burned.
</overlay_decision>

<block_assembly>
- block_type selects the matching reference recipe. Use `purpose` to set visual emphasis: the primary CTA is a filled button (--button-bg / --button-text); a secondary CTA is an outline; an urgency/scarcity block uses --accent.
- block_type = "products": render the FULL static grid from top_products (image, name, price, per-card CTA). Complete and static — this is a Figma mock, so there is no dynamic block to preserve.
- block_type = "footer": render a static visual placeholder (logo + minimal text). No real unsubscribe or legal links.
- Always respect each image's aspect_ratio from the image_map. Never distort.
- preheader: render as a hidden span at the very top of the body (do not let it disappear, but keep it visually suppressed).
</block_assembly>

<unbreakable_rules>
1. COLOR: No hex value that appears in reference_html may appear in your output. Every color comes from color_roles, referenced as a CSS variable.
2. STRUCTURE: Block order, block count, and construction technique come from the reference. Never invent, remove, reorder, or "simplify" a block.
3. OVERLAY: Follow <overlay_decision> exactly.
4. WIDTH: Fixed 600px, single centered container, div + flex. Tables are forbidden.
5. IMAGES: Use the exact URLs from the image_map. Respect aspect_ratio. Never invent or swap a URL, never use an external placeholder.
6. CONTENT: Use headline and copy exactly as provided, including tokens as literal text. Never rewrite, translate, summarize, or invent a claim.
7. FONTS: Only fonts.heading and fonts.body, loaded via @import. Ignore the reference's font-family entirely.
8. LOGO: Always inline SVG / vector. Never rasterize.
9. OUTPUT: Emit ONLY <!DOCTYPE html> … </html>. No commentary, no code fences, nothing before or after the HTML.
</unbreakable_rules>

<self_check>
Before emitting, verify silently and fix any failure:
- Every block from blocks_with_content is present, in position order, none invented or dropped.
- Zero reference hex leaked: every color in the document is a var(--…) sourced from color_roles.
- Every image block resolved its overlay correctly per the matrix (no missing text, no duplicated text).
- Container width is 600px and there is not a single <table> tag.
- Every image src matches a URL from the image_map; every aspect_ratio respected.
- Fonts are the brand fonts via @import; logo is inline SVG.
</self_check>$SYSTEM$,
      $USER$<store>
  <brand_name>{{brand_name}}</brand_name>
  <locale>{{locale}}</locale>
</store>

<color_roles>
  <bg>{{color_bg}}</bg>
  <text>{{color_text}}</text>
  <heading>{{color_heading}}</heading>
  <button_bg>{{color_button_bg}}</button_bg>
  <button_text>{{color_button_text}}</button_text>
  <accent>{{color_accent}}</accent>
</color_roles>

<fonts>
  <heading>{{font_heading}}</heading>
  <body>{{font_body}}</body>
</fonts>

<logo width_px="{{logo_width}}">
{{logo_svg}}
</logo>

<email>
  <name>{{email_name}}</name>
  <subject>{{subject}}</subject>
  <preheader>{{preheader}}</preheader>
  <objective>{{objective}}</objective>
  <messaging>{{messaging}}</messaging>
</email>

<reference_html>
{{reference_html}}
</reference_html>

<image_map>
{{image_map_json}}
</image_map>

<top_products>
{{top_products_json}}
</top_products>

<blocks_with_content>
{{blocks_with_content_json}}
</blocks_with_content>

Assemble this email now, following your execution protocol and your unbreakable rules. Emit ONLY the HTML, beginning with <!DOCTYPE html> and ending with </html>.$USER$,
      0.3,
      16384,
      COALESCE((SELECT MAX(version) FROM email_agent_configs WHERE agent_type = 'html'), 0) + 1,
      true;
  END IF;
END $$;



-- =============================================================
-- [3] BACKFILL CONDICIONAL — image_overlay_reserve_bottom
--
-- So' rode se [1].Q3 mostrou n_null > 0 pra flow_type='welcome'.
-- Marca os hero/featured do welcome como "precisa de overlay HTML"
-- (texto sobre imagem em vez de stack). Conservador: nao toca em
-- blueprints custom (created_by IS NULL filtra so' seed).
-- =============================================================

-- Descomente o bloco abaixo apos confirmar Q3:
-- UPDATE email_blueprints
-- SET image_overlay_reserve_bottom = true
-- WHERE image_overlay_reserve_bottom IS NULL
--   AND flow_type = 'welcome'
--   AND email_number IN (1, 2, 4, 6);



-- =============================================================
-- [4] SANITY CHECKS POS-APLICACAO
-- =============================================================

-- [4a] Confirma que existe UMA unica row ativa do HTML Agent,
-- com a versao corrigida (sem leak):
SELECT
  version,
  model,
  is_active,
  (system_prompt LIKE '%HTML Assembler for an email-design pipeline%') AS is_v2,
  (system_prompt LIKE '%(e.g. {{ first_name }})%') AS has_leak,
  length(system_prompt) AS system_len,
  length(user_template) AS user_len,
  created_at
FROM email_agent_configs
WHERE agent_type = 'html' AND is_active = true;

-- Esperado: 1 row, is_v2=true, has_leak=false.


-- [4b] Confirma que a frase NOVA esta no prompt vigente:
SELECT
  position('Personalization tokens like first_name or product_name' IN system_prompt) > 0
    AS frase_nova_presente,
  position('Personalization tokens (e.g. {{ first_name }})' IN system_prompt) > 0
    AS frase_antiga_presente
FROM email_agent_configs
WHERE agent_type = 'html' AND is_active = true;

-- Esperado: frase_nova_presente=true, frase_antiga_presente=false.


-- [4c] Confirma que nao existem rows ativas duplicadas (invariante
-- 1-row-ativa-por-agent_type):
SELECT agent_type, COUNT(*) AS n_active
FROM email_agent_configs
WHERE is_active = true
GROUP BY agent_type
HAVING COUNT(*) > 1;

-- Esperado: zero linhas.



-- =============================================================
-- [5] ACHAR UM EMAIL "GERAVEL" PRA TESTAR PELA UI
--
-- Retorna emails que tem todas as dependencias (briefing confirmado,
-- brand identity) — entao podem rodar o pipeline ate o fim. Pegue
-- um store_id e abra:
--   https://app.convertfy.me/admin/stores/{store_id}/emails
-- =============================================================

SELECT
  e.id          AS email_id,
  e.name        AS email_name,
  e.status,
  e.flow_type,
  e.email_number,
  s.id          AS store_id,
  s.store_name,
  e.updated_at
FROM email_flow_emails e
JOIN client_stores s ON s.id = e.store_id
WHERE e.status IN ('draft', 'copy_ready', 'failed', 'ready')
  AND EXISTS (
    SELECT 1 FROM store_briefings
    WHERE store_id = e.store_id AND status = 'confirmed'
  )
  AND EXISTS (
    SELECT 1 FROM store_brand_identity
    WHERE store_id = e.store_id
  )
ORDER BY
  CASE e.status
    WHEN 'copy_ready' THEN 1   -- pronto pra fase 2 (HTML)
    WHEN 'failed'     THEN 2   -- regerar
    WHEN 'draft'      THEN 3   -- comeca do zero
    WHEN 'ready'      THEN 4   -- ja gerado, so' inspecionar
  END,
  e.updated_at DESC
LIMIT 20;
