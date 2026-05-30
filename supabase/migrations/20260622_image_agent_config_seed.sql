-- ============================================================
-- Epic AE-Image Niche-Adaptive
-- Story AE-11: seed inicial do agent_type='image' v1
--
-- Insere a primeira config ativa do agente de imagem em
-- email_agent_configs. O template usa a sintaxe handlebars-lite
-- documentada em src/lib/agents/image/template-renderer.ts:
--   {{#case VAR}}{{#when "x"}}...{{/when}}{{/case}}  switch
--   {{#if VAR}}...{{/if}}                            condicional
--   {{VAR}}                                          substituicao
--
-- Vars disponiveis: ver buildImagePromptVars em
-- src/lib/agents/email-generation.service.ts (12 niche-adaptive
-- UPPERCASE da AE-10) + flow_type, email_number (snake_case,
-- adicionadas em AE-11) + INSTRUCAO_ADICIONAL (UPPERCASE, hook
-- pra AE-16 — instrucao por bloco).
--
-- Os prompts Welcome E1..E6 ficam como PLACEHOLDERS aqui — AE-14
-- substitui pelos prompts mestres reais (data-only migration). O
-- pipeline funciona end-to-end ja desde esta migration.
--
-- Idempotente via WHERE NOT EXISTS — o index parcial
-- idx_agent_config_active (agent_type WHERE is_active = true)
-- garante 1 row ativo por agent_type.
-- ============================================================

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
  'image',
  'openai/gpt-5.4-image-2',
  $SYSTEM$You are an e-commerce email image generator. Generate photographic, realistic images strictly anchored to the brand niche and product hero. Never invent products outside the catalogue. Follow universal restrictions at the end.

Template syntax: handlebars-lite (see src/lib/agents/image/template-renderer.ts). Variables come from buildImagePromptVars (12 niche-adaptive UPPERCASE vars from AE-10 plus flow_type, email_number, INSTRUCAO_ADICIONAL).$SYSTEM$,
  $USER$Generate a hero image for an e-commerce email.

{{#case flow_type}}
  {{#when "welcome"}}
    {{#case email_number}}
      {{#when 1}}<<E1 — hero lifestyle/produto 4:5. Placeholder substituido na AE-14. Por enquanto: photographic hero of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}, neutral {{NEUTRO}}, bottom third reserved for text overlay. Target audience: {{PUBLICO}}.>>{{/when}}
      {{#when 2}}<<E2 — social proof produto 4:5. Placeholder substituido na AE-14. Por enquanto: studio product still of {{PRODUTO_HEROI}}, dramatic light, bottom darkened for 10%OFF overlay. Brand {{MARCA}} palette {{PALETA_1}}+{{PALETA_2}}.>>{{/when}}
      {{#when 3}}<<E3 — central vertical 3:5 sem overlay reserve. Placeholder substituido na AE-14. Por enquanto: clean product-in-use shot of {{PRODUTO_HEROI}} in {{CENARIO}}, vertical card framing, mood {{MOOD}}.>>{{/when}}
      {{#when 4}}<<E4 — aspiracional hero 4:5. Placeholder substituido na AE-14. Por enquanto: aspirational lifestyle in {{CENARIO}} at the most sophisticated level for {{NICHO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}.>>{{/when}}
      {{#when 5}}<<E5 — fachada loja 4:3, placa em branco. Placeholder substituido na AE-14. Por enquanto: storefront in style of {{NICHO}} brand {{MARCA}}, blank sign above door for logo overlay, palette {{PALETA_1}}+{{NEUTRO}}.>>{{/when}}
      {{#when 6}}<<E6 — ultima oportunidade high-impact 4:5. Placeholder substituido na AE-14. Por enquanto: highest-energy version of {{PRODUTO_HEROI}}, dramatic light, bottom darkened for big discount overlay, mood {{MOOD}}.>>{{/when}}
    {{/case}}
  {{/when}}
  {{#when "abandoned_cart"}}Generic fallback for abandoned_cart: studio product shot of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}, language context {{IDIOMA}}, currency {{MOEDA}}.{{/when}}
  {{#when "browse_abandonment"}}Generic fallback for browse_abandonment: lifestyle product of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}.{{/when}}
  {{#when "win_back"}}Generic fallback for win_back: aspirational lifestyle of {{PRODUTO_HEROI}} in {{CENARIO}}, mood {{MOOD}}, palette {{PALETA_1}}+{{PALETA_2}}.{{/when}}
  {{#when "upsell"}}Generic fallback for upsell: premium product shot of {{PRODUTO_HEROI}}, palette {{PALETA_1}}+{{PALETA_2}}, neutral {{NEUTRO}}, mood {{MOOD}}.{{/when}}
  {{#when "post_purchase"}}Generic fallback for post_purchase: warm product-in-use of {{PRODUTO_HEROI}} in {{CENARIO}}, mood warm.{{/when}}
{{/case}}

UNIVERSAL RESTRICTIONS:
- Photographic realism, campaign quality.
- No text, letters, numbers, logos or watermarks rendered in the image (text is added in the design layer).
- No distorted faces, no deformed hands, no frame, no watermark.
- Brand identity for {{MARCA}}: logo style {{LOGO_STYLE}}, palette {{PALETA_1}}/{{PALETA_2}}, neutral {{NEUTRO}}, mood {{MOOD}}.
- Target audience: {{PUBLICO}}. Cultural context: {{IDIOMA}}, currency hint {{MOEDA}}.

{{#if INSTRUCAO_ADICIONAL}}
ADDITIONAL BLOCK-SPECIFIC INSTRUCTIONS:
{{INSTRUCAO_ADICIONAL}}
{{/if}}$USER$,
  0.7,
  2048,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'image' AND is_active = true
);
