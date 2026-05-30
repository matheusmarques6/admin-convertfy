-- ============================================================
-- Epic AE-Image Niche-Adaptive
-- Story AE-10: schema base
-- Idempotente (IF NOT EXISTS, CHECK guards).
-- ============================================================

ALTER TABLE email_blueprints
  ADD COLUMN IF NOT EXISTS image_brief TEXT,
  ADD COLUMN IF NOT EXISTS image_aspect TEXT DEFAULT '4:5',
  ADD COLUMN IF NOT EXISTS image_mode TEXT DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS image_overlay_reserve_bottom BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS image_produto_heroi_hint TEXT;

-- CHECKs com guards (Postgres não tem ADD CONSTRAINT IF NOT EXISTS)
DO $$ BEGIN
  ALTER TABLE email_blueprints
    ADD CONSTRAINT email_blueprints_image_aspect_check
    CHECK (image_aspect IN ('4:5','3:5','4:3','1:1','3:4'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE email_blueprints
    ADD CONSTRAINT email_blueprints_image_mode_check
    CHECK (image_mode IN ('auto','product_ref','text2img'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS store_image_overrides (
  store_id UUID PRIMARY KEY REFERENCES client_stores(id) ON DELETE CASCADE,
  cenario_override TEXT,
  produto_heroi_override TEXT,
  produto_heroi_image_url TEXT,
  logo_style_override TEXT,
  neutro_override TEXT,
  mood_override TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE store_image_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_full_access" ON store_image_overrides;
CREATE POLICY "authenticated_full_access" ON store_image_overrides
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE store_image_overrides IS
  'Per-store overrides para variaveis niche-adaptive (Epic AE-Image / AE-10). '
  'Override sempre vence helpers de derivacao.';
