-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — Contexto textual OPT-IN no agente de imagem
--
-- O agente `campaign_image` GERA IMAGEM (não texto). Os 5 campos TEXTUAIS
-- (nicho, persona/público, tom de voz, moeda/locale, headline) viram OPT-IN
-- POR LOTE: cada um é um toggle + valor custom opcional, DESLIGADO por
-- padrão. A identidade VISUAL da marca (MARCA, PALETA_1/2, NEUTRO,
-- LOGO_STYLE, PRODUTO_HEROI, CENARIO, MOOD) continua SEMPRE no prompt.
--
-- 1. campaign_image_batches.text_context (JSONB) — { nicho, publico, tom,
--    moeda, headline } onde cada campo = { include: bool, value?: string }.
-- 2. Reescreve o user_template do agent_type 'campaign_image' (linha ativa):
--    núcleo VISUAL incondicional + 5 linhas textuais envoltas em
--    {{#if INCLUDE_*}}...{{/if}} (renderer handlebars-lite: "" = falsy) +
--    bloco INSTRUCAO_ADICIONAL existente.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE da linha ativa.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. Coluna text_context ───────────────────────────────────────────
ALTER TABLE campaign_image_batches
  ADD COLUMN IF NOT EXISTS text_context JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. Reescreve o user_template do agente (contexto textual gated) ───
-- O service computa INCLUDE_* ("true"/"") + os valores e mescla por cima
-- das vars-base de buildImagePromptVars antes de renderizar.
UPDATE email_agent_configs
SET user_template = $USER$Generate a campaign image for the brand {{MARCA}}.

Visual identity (anchor the image to these):
- Palette: {{PALETA_1}} + {{PALETA_2}}, neutral {{NEUTRO}}
- Logo style: {{LOGO_STYLE}}
- Mood: {{MOOD}}
- Scene hint: {{CENARIO}}

Product hero: {{PRODUTO_HEROI}}
{{#if INCLUDE_NICHO}}Niche / context: {{NICHO}}
{{/if}}{{#if INCLUDE_PUBLICO}}Target audience: {{PUBLICO}}
{{/if}}{{#if INCLUDE_TOM}}Tone of voice: {{TOM_VOZ}}
{{/if}}{{#if INCLUDE_MOEDA}}Locale / currency: {{IDIOMA}} / {{MOEDA}}
{{/if}}{{#if INCLUDE_HEADLINE}}Campaign headline to EVOKE (do NOT render literal text in the image): "{{HEADLINE}}"
{{/if}}
{{#if INSTRUCAO_ADICIONAL}}
ART DIRECTION (batch instruction + per-store adaptation):
{{INSTRUCAO_ADICIONAL}}
{{/if}}

Render a single campaign-quality image that {{MARCA}} would proudly use. Anchor it to the brand palette, mood and niche above.$USER$
WHERE agent_type = 'campaign_image' AND is_active = true;
