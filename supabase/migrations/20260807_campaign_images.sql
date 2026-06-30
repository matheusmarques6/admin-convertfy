-- ─────────────────────────────────────────────────────────────────────
-- Central de Campanhas — Geração de Imagens por Loja (etapa de PRODUÇÃO)
--
-- Na etapa de produção do design de campanha, a task "Criação das imagens"
-- abre um modal onde o designer define LOTES de instrução (cada lote = um
-- tipo de imagem: formato + instrução + imagem-base opcional + flags de
-- adaptação) e gera, por LOTE × LOJA, uma imagem adaptada à marca de cada
-- loja, reusando o agente de imagem do pipeline de email.
--
-- Tabelas:
--   1. campaign_image_batches  — um row por lote de instrução (1 tipo de img)
--   2. campaign_image_results  — um row por (lote × loja) com status ao vivo
--
-- Seed: agent_type 'campaign_image' em email_agent_configs (direção de arte
-- por loja). Editável/versionado na UI de prompts existente.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. campaign_image_batches ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_image_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  suggestion_id UUID NOT NULL REFERENCES campaign_suggestions(id) ON DELETE CASCADE,
  -- Task de campanha (produção) que abriu o modal. Informativo/auditoria.
  task_id UUID,
  name TEXT NOT NULL,
  -- Formato/aspecto-alvo do lote (mapeia pra AspectKey no service).
  format TEXT NOT NULL DEFAULT 'hero'
    CHECK (format IN ('hero', 'square', 'story')),
  instruction TEXT NOT NULL DEFAULT '',
  -- URL da imagem-base opcional (referência visual via OpenRouter content array).
  reference_image_url TEXT,
  -- Flags de adaptação por loja: { idioma, cores, logo, catalogo, tom }.
  adapt_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_image_batches_suggestion
  ON campaign_image_batches(suggestion_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_image_batches_org
  ON campaign_image_batches(org_id);

-- ── 2. campaign_image_results ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_image_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES campaign_image_batches(id) ON DELETE CASCADE,
  store_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'ready', 'adjustment', 'failed')),
  image_url TEXT,
  -- Notas de ajuste apensadas ao prompt no "regerar com ajuste".
  adjustment_notes TEXT,
  error_message TEXT,
  -- Como foi gerada (model/mode) — auditoria leve.
  generated_via TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_image_results_batch
  ON campaign_image_results(batch_id, status);

-- ── updated_at triggers (reusa a função do campaign_central) ──────────
-- campaign_central_set_updated_at() definida em 20260716_campaign_central.sql.
DROP TRIGGER IF EXISTS trg_campaign_image_batches_updated ON campaign_image_batches;
CREATE TRIGGER trg_campaign_image_batches_updated
  BEFORE UPDATE ON campaign_image_batches
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

DROP TRIGGER IF EXISTS trg_campaign_image_results_updated ON campaign_image_results;
CREATE TRIGGER trg_campaign_image_results_updated
  BEFORE UPDATE ON campaign_image_results
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

-- ── RLS (padrão campaign_suggestions: org isolation via org_members) ──
ALTER TABLE campaign_image_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_image_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_image_batches_org" ON campaign_image_batches;
CREATE POLICY "campaign_image_batches_org" ON campaign_image_batches
  FOR ALL USING (
    org_id IN (SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true)
  );

-- results não tem org_id direto: isola via batch->suggestion (mesma org).
DROP POLICY IF EXISTS "campaign_image_results_org" ON campaign_image_results;
CREATE POLICY "campaign_image_results_org" ON campaign_image_results
  FOR ALL USING (
    batch_id IN (
      SELECT b.id FROM campaign_image_batches b
      WHERE b.org_id IN (
        SELECT org_id FROM org_members WHERE profile_id = auth.uid() AND is_active = true
      )
    )
  );

-- ── 3. Expandir CHECK de email_agent_configs.agent_type ──────────────
-- Mesmo padrão dinâmico das migrations de campaign_* (descobre o nome do
-- CHECK, dropa e recria incluindo 'campaign_image').
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_agent_configs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent_type%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_agent_configs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_agent_configs
    ADD CONSTRAINT email_agent_configs_agent_type_check
    CHECK (agent_type IN (
      'copy','image','html','qa','blueprint','assembler','assembler_chooser',
      'campaign_suggestion','campaign_trends','campaign_copy_master',
      'campaign_architect','campaign_image'
    ));
END $$;

-- ── 4. Seed do agent_type 'campaign_image' v1 ────────────────────────
-- Direção de arte por loja. Usa as vars de buildImagePromptVars (12 vars
-- niche-adaptive UPPERCASE da AE-10: MARCA, PALETA_1/2, IDIOMA, MOEDA,
-- PRODUTO_HEROI, NICHO, MOOD, CENARIO, PUBLICO, NEUTRO, LOGO_STYLE) +
-- INSTRUCAO_ADICIONAL (instrução do lote + flags + notas de ajuste).
-- Idempotente via WHERE NOT EXISTS (1 row ativo por agent_type).
INSERT INTO email_agent_configs (
  agent_type, model, system_prompt, user_template,
  temperature, max_tokens, version, is_active
)
SELECT
  'campaign_image',
  'openai/gpt-5.4-image-2',
  $SYSTEM$You are a campaign image generator for e-commerce brands. Each store has its own brand identity (palette, logo style, products, voice). Generate a single photographic, campaign-quality image adapted to THIS store's brand, strictly anchored to its niche and product hero.

UNIVERSAL RESTRICTIONS:
- Photographic realism, campaign quality.
- No text, letters, numbers, logos or watermarks rendered in the image (text is added later in the design layer).
- No distorted faces, no deformed hands, no frame, no watermark.
- Never invent products outside the store catalogue.

When a reference image is provided, match material, color and proportions of that exact product closely; do not invent a different SKU.

Template syntax: handlebars-lite (see src/lib/agents/image/template-renderer.ts).$SYSTEM$,
  $USER$Generate a campaign image for the brand {{MARCA}} ({{NICHO}}).

Brand identity:
- Palette: {{PALETA_1}} + {{PALETA_2}}, neutral {{NEUTRO}}
- Logo style: {{LOGO_STYLE}}
- Mood: {{MOOD}}
- Target audience: {{PUBLICO}}
- Scene hint: {{CENARIO}}
- Language/cultural context: {{IDIOMA}}, currency hint {{MOEDA}}

Product hero: {{PRODUTO_HEROI}}

{{#if INSTRUCAO_ADICIONAL}}
ART DIRECTION (campaign instruction for this batch + per-store adaptation flags):
{{INSTRUCAO_ADICIONAL}}
{{/if}}

Render a single campaign-quality image that an e-commerce brand would proudly use. Anchor it to the brand palette, mood and niche above.$USER$,
  0.7,
  2048,
  1,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM email_agent_configs
  WHERE agent_type = 'campaign_image' AND is_active = true
);
