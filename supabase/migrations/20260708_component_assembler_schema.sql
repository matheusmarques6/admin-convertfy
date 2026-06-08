-- ============================================================
-- Epic AE — Component Assembler
--
-- A IA passa a ser fonte dos blueprints e das referências: a partir de
-- uma estrutura geral (outline) + biblioteca de componentes, gera por
-- (loja × email) o blueprint detalhado e o HTML de referência.
--
-- 4 tabelas novas + extensão dos CHECKs de agent type para incluir os
-- dois novos agentes: `blueprint` (gera estrutura) e `assembler`
-- (escolhe variantes e monta o reference HTML).
-- ============================================================

-- ── 1. email_outline_templates ─────────────────────────────
-- Estrutura geral (INPUT), global e curável. Consumida SOMENTE pelo
-- agente gerador, que a expande no blueprint detalhado por loja.
CREATE TABLE IF NOT EXISTS email_outline_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_type TEXT NOT NULL,
  email_number INT NOT NULL,
  objective TEXT NOT NULL,
  guidance TEXT,
  suggested_blocks JSONB NOT NULL DEFAULT '[]',
  tone_hint TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_type, email_number)
);

-- ── 2. email_component_variants ────────────────────────────
-- Biblioteca global de variantes de componente catalogadas por
-- block_type. As dimensões de matching alimentam o pré-filtro
-- determinístico antes da escolha final pelo LLM.
CREATE TABLE IF NOT EXISTS email_component_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Seções de negócio da biblioteca (não os 19 block_types técnicos do
  -- blueprint). O assembler traduz bloco→seção via blockTypeToCategory.
  block_type TEXT NOT NULL CHECK (block_type IN (
    'header','hero','body','products','reviews','cta','offer','footer'
  )),
  name TEXT NOT NULL,
  html TEXT NOT NULL,
  slots JSONB NOT NULL DEFAULT '[]',
  niche_affinity TEXT[] NOT NULL DEFAULT '{}',
  positioning TEXT[] NOT NULL DEFAULT '{}',
  mood TEXT[] NOT NULL DEFAULT '{}',
  density TEXT CHECK (density IN ('minimal','balanced','rich')),
  tags TEXT[] NOT NULL DEFAULT '{}',
  thumbnail TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pré-filtro: primário por block_type (ativos) + GIN nas dimensões.
CREATE INDEX IF NOT EXISTS idx_ecv_type_active
  ON email_component_variants(block_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ecv_niche
  ON email_component_variants USING GIN (niche_affinity);
CREATE INDEX IF NOT EXISTS idx_ecv_mood
  ON email_component_variants USING GIN (mood);
CREATE INDEX IF NOT EXISTS idx_ecv_positioning
  ON email_component_variants USING GIN (positioning);
CREATE INDEX IF NOT EXISTS idx_ecv_tags
  ON email_component_variants USING GIN (tags);

-- ── 3. store_email_blueprints ──────────────────────────────
-- Blueprint detalhado GERADO por (loja × email). Mesmo shape lógico de
-- email_blueprints, porém escopado à loja, com proveniência (source).
CREATE TABLE IF NOT EXISTS store_email_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  flow_type TEXT NOT NULL,
  email_number INT NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  messaging TEXT NOT NULL DEFAULT '',
  subject_hint TEXT,
  blocks JSONB NOT NULL DEFAULT '[]',
  image_brief TEXT,
  image_mode TEXT CHECK (image_mode IN ('auto','product_ref','text2img')),
  image_aspect TEXT CHECK (image_aspect IN ('4:5','3:5','4:3','1:1','3:4')),
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','manual')),
  model TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, flow_type, email_number)
);

CREATE INDEX IF NOT EXISTS idx_seb_lookup
  ON store_email_blueprints(store_id, flow_type, email_number);

-- ── 4. store_email_references ──────────────────────────────
-- Reference HTML GERADO por (loja × email). Ocupa o papel do
-- reference_html consumido pelo HTML agent (build-vars.ts).
CREATE TABLE IF NOT EXISTS store_email_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  flow_type TEXT NOT NULL,
  email_number INT NOT NULL,
  html TEXT NOT NULL,
  variant_ids UUID[] NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','manual')),
  model TEXT,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, flow_type, email_number)
);

CREATE INDEX IF NOT EXISTS idx_ser_lookup
  ON store_email_references(store_id, flow_type, email_number);

-- ── RLS (padrão authenticated_full_access do projeto) ──────
ALTER TABLE email_outline_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_component_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_email_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_email_references ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_full_access" ON email_outline_templates;
CREATE POLICY "authenticated_full_access" ON email_outline_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_full_access" ON email_component_variants;
CREATE POLICY "authenticated_full_access" ON email_component_variants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_full_access" ON store_email_blueprints;
CREATE POLICY "authenticated_full_access" ON store_email_blueprints
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_full_access" ON store_email_references;
CREATE POLICY "authenticated_full_access" ON store_email_references
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Triggers updated_at (set_updated_at já existe em 20260621) ──
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_eot_updated_at ON email_outline_templates;
CREATE TRIGGER trg_eot_updated_at BEFORE UPDATE ON email_outline_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ecv_updated_at ON email_component_variants;
CREATE TRIGGER trg_ecv_updated_at BEFORE UPDATE ON email_component_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_seb_updated_at ON store_email_blueprints;
CREATE TRIGGER trg_seb_updated_at BEFORE UPDATE ON store_email_blueprints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ser_updated_at ON store_email_references;
CREATE TRIGGER trg_ser_updated_at BEFORE UPDATE ON store_email_references
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Extensão dos CHECKs de agent type ──────────────────────
-- Descobre dinamicamente a constraint de check existente (o nome pode
-- variar conforme a migration que estendeu para 'qa'), dropa e recria
-- com a lista completa incluindo 'blueprint' e 'assembler'. Idempotente.
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
    CHECK (agent_type IN ('copy','image','html','qa','blueprint','assembler'));
END $$;

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'email_generation_runs'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%agent%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE email_generation_runs DROP CONSTRAINT %I', cname);
  END IF;
  ALTER TABLE email_generation_runs
    ADD CONSTRAINT email_generation_runs_agent_check
    CHECK (agent IN ('seed','copy','image','html','qa','blueprint','assembler'));
END $$;
