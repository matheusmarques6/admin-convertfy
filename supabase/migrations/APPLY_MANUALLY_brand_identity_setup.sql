-- ============================================================
-- APPLY MANUALLY · Brand Identity setup
--
-- INSTRUCOES:
--   1. Abra o Supabase Dashboard -> SQL Editor
--   2. Cole TUDO deste arquivo num novo query
--   3. Clique em Run
--   4. Confira as mensagens NOTICE no final
--
-- IDEMPOTENTE: pode rodar varias vezes sem efeito colateral.
-- Cria as 3 tabelas usadas pela tela "Identidade Visual" se ainda
-- nao existirem, e adiciona as colunas de peso da fonte (Fase 1
-- do redesign).
--
-- TABELAS CRIADAS:
--   - store_brand_identity   (logos, cores, fontes, voz, selos, top products)
--   - store_briefings        (slogan, nicho, posicionamento, tom_voz)
--   - store_top_products     (sync N8N/Shopify dos 5 produtos mais vendidos)
--
-- PRE-REQUISITOS (devem ja estar aplicados):
--   - client_stores (referenciada por todas as FKs)
--   - profiles      (referenciada por created_by)
-- ============================================================

DO $$ BEGIN RAISE NOTICE '[brand-identity-setup] pre-flight check'; END $$;

-- ── store_brand_identity ────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_brand_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  logo_main_svg TEXT,
  logo_main_png TEXT,
  logo_alt_svg TEXT,
  logo_alt_png TEXT,
  logo_monogram_svg TEXT,
  logo_monogram_png TEXT,
  logo_reverse_svg TEXT,
  logo_reverse_png TEXT,
  colors_primary JSONB NOT NULL DEFAULT '[]'::jsonb,
  colors_secondary JSONB NOT NULL DEFAULT '[]'::jsonb,
  font_heading TEXT,
  font_body TEXT,
  voice JSONB NOT NULL DEFAULT '[]'::jsonb,
  trust_icons JSONB NOT NULL DEFAULT '[]'::jsonb,
  top_products JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ai_capture', 'manual', 'edited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE (store_id, version)
);

CREATE INDEX IF NOT EXISTS idx_store_brand_identity_store
  ON store_brand_identity(store_id, version DESC);

-- Adiciona peso/variante da fonte (migration 20260619)
ALTER TABLE store_brand_identity
  ADD COLUMN IF NOT EXISTS font_heading_weight TEXT,
  ADD COLUMN IF NOT EXISTS font_body_weight TEXT;

COMMENT ON COLUMN store_brand_identity.font_heading_weight IS
  'Peso/variante da fonte de headlines. Ex: "Black 900", "Bold 700".';
COMMENT ON COLUMN store_brand_identity.font_body_weight IS
  'Peso/variante da fonte de body. Ex: "Regular 400 / Medium 500".';

-- ── store_briefings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  raw_input JSONB,
  marca JSONB NOT NULL DEFAULT '{}'::jsonb,
  briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ai_treatment', 'manual', 'edited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE (store_id, version)
);

CREATE INDEX IF NOT EXISTS idx_store_briefings_store
  ON store_briefings(store_id, version DESC);

-- ── store_top_products ──────────────────────────────────────
-- Sincronizado via webhook N8N. NAO confundir com store_brand_identity.top_products
-- (snapshot estatico). UI nova usa essa tabela; o snapshot fica como fallback.
CREATE TABLE IF NOT EXISTS store_top_products (
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  title TEXT NOT NULL,
  price NUMERIC,
  currency TEXT,
  handle TEXT,
  image_url TEXT,
  external_id TEXT,
  source TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (store_id, rank)
);

CREATE INDEX IF NOT EXISTS idx_store_top_products_store
  ON store_top_products(store_id, rank);

-- ── Storage bucket pros logos (idempotente) ─────────────────
-- Bucket onde os SVG/PNG dos logos sao armazenados. Privado;
-- access via signed URL (7d) gerada pelo endpoint /upload.
INSERT INTO storage.buckets (id, name, public)
VALUES ('onboarding-visual-assets', 'onboarding-visual-assets', false)
ON CONFLICT (id) DO NOTHING;

-- ── pos-flight ──────────────────────────────────────────────
DO $$
DECLARE
  v_brand_id_count INT;
  v_briefings_count INT;
  v_top_products_count INT;
BEGIN
  SELECT count(*) INTO v_brand_id_count FROM information_schema.tables
   WHERE table_schema='public' AND table_name='store_brand_identity';
  SELECT count(*) INTO v_briefings_count FROM information_schema.tables
   WHERE table_schema='public' AND table_name='store_briefings';
  SELECT count(*) INTO v_top_products_count FROM information_schema.tables
   WHERE table_schema='public' AND table_name='store_top_products';

  RAISE NOTICE '[brand-identity-setup] tabelas presentes:';
  RAISE NOTICE '  store_brand_identity: % (1=ok)', v_brand_id_count;
  RAISE NOTICE '  store_briefings:      % (1=ok)', v_briefings_count;
  RAISE NOTICE '  store_top_products:   % (1=ok)', v_top_products_count;

  IF v_brand_id_count = 1 AND v_briefings_count = 1 AND v_top_products_count = 1 THEN
    RAISE NOTICE '[brand-identity-setup] ✓ TUDO OK — tela Identidade Visual ja deve funcionar.';
  ELSE
    RAISE NOTICE '[brand-identity-setup] ✗ FALTA ALGO — verifique os logs acima.';
  END IF;
END $$;

-- IMPORTANTE: apos rodar este SQL, recarregue a aba do admin
-- (ctrl+shift+r) pra forcar o PostgREST a re-cachear o schema.
