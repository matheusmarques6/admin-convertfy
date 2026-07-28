-- ─────────────────────────────────────────────────────────────────────
-- Estúdio de Geração de Imagens (/admin/imagens) — standalone
--
-- Aba independente onde qualquer usuário do admin monta LOTES de geração
-- de imagem para QUALQUER conjunto de lojas ativas da org, com N
-- VARIAÇÕES por loja (cada variação com direção opcional). Espelha a
-- arquitetura da geração de campanha (20260807_campaign_images.sql) num
-- domínio paralelo: MESMO motor (agente campaign_image + image.chain),
-- ZERO ligação de dados com campaign_image_batches/results.
--
-- Diferenças deliberadas vs. campanha:
--   - sem suggestion_id/task_id (o lote é soberano)
--   - store_ids no lote (seleção livre, lembrada antes de gerar)
--   - variations JSONB + variation_index no result (o novo eixo N×X)
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. image_studio_batches ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_studio_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT 'hero'
    CHECK (format IN ('hero', 'square', 'story', 'portrait', 'landscape', 'banner', 'vertical')),
  instruction TEXT NOT NULL DEFAULT '',
  reference_image_url TEXT,
  -- Flags de adaptação por loja: { idioma, cores, logo, catalogo }.
  adapt_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Contexto textual opt-in: { nicho, publico, tom, moeda, headline }.
  text_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Seleção livre de lojas do lote (client_stores.id).
  store_ids UUID[] NOT NULL DEFAULT '{}',
  -- Variações por loja: [{"label": "...", "direction": "..."}]. X = length.
  -- direction vazia = variação livre sobre a instrução-base.
  variations JSONB NOT NULL DEFAULT '[{}]'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_image_studio_batches_org
  ON image_studio_batches(org_id, created_at DESC);

-- ── 2. image_studio_results ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS image_studio_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES image_studio_batches(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  -- Índice da variação dentro do lote (0..X-1).
  variation_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating', 'ready', 'adjustment', 'failed')),
  image_url TEXT,
  adjustment_notes TEXT,
  error_message TEXT,
  generated_via TEXT,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, store_id, variation_index)
);

CREATE INDEX IF NOT EXISTS idx_image_studio_results_batch
  ON image_studio_results(batch_id, status);

-- ── updated_at triggers (reusa a função do campaign_central) ──────────
DROP TRIGGER IF EXISTS trg_image_studio_batches_updated ON image_studio_batches;
CREATE TRIGGER trg_image_studio_batches_updated
  BEFORE UPDATE ON image_studio_batches
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

DROP TRIGGER IF EXISTS trg_image_studio_results_updated ON image_studio_results;
CREATE TRIGGER trg_image_studio_results_updated
  BEFORE UPDATE ON image_studio_results
  FOR EACH ROW EXECUTE FUNCTION campaign_central_set_updated_at();

-- ── RLS (org isolation via org_members — padrão campaign_images) ──────
ALTER TABLE image_studio_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_studio_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_image_studio_batches" ON image_studio_batches;
CREATE POLICY "org_members_image_studio_batches" ON image_studio_batches
  FOR ALL TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = TRUE
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = TRUE
    )
  );

DROP POLICY IF EXISTS "org_members_image_studio_results" ON image_studio_results;
CREATE POLICY "org_members_image_studio_results" ON image_studio_results
  FOR ALL TO authenticated
  USING (
    batch_id IN (
      SELECT b.id FROM image_studio_batches b
      WHERE b.org_id IN (
        SELECT org_id FROM org_members
        WHERE profile_id = auth.uid() AND is_active = TRUE
      )
    )
  )
  WITH CHECK (
    batch_id IN (
      SELECT b.id FROM image_studio_batches b
      WHERE b.org_id IN (
        SELECT org_id FROM org_members
        WHERE profile_id = auth.uid() AND is_active = TRUE
      )
    )
  );

COMMENT ON TABLE image_studio_batches IS
  'Estúdio de imagens standalone (/admin/imagens): lotes de geração livre por loja × variação. Sem ligação com campaign_image_batches.';
COMMENT ON TABLE image_studio_results IS
  'Resultados do estúdio: 1 linha por (lote × loja × variação), status ao vivo do polling.';
