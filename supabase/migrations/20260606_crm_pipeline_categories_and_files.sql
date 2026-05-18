-- ============================================================
-- CRM Convertfy — Pipeline V2: categories + deal files
--
-- Pre-requisitos:
--   - 20260507_crm_phase1_core.sql (tabelas pipelines, deals)
--
-- Mudancas:
--   1. pipelines.category — agrupamento livre na sidebar (Comerciais,
--      Operacoes, Producao, etc). NULL = "Sem categoria".
--   2. pipelines.is_favorite — destaque com estrela na sidebar.
--   3. crm_deal_files — anexos do deal (proposta, briefing, mockups).
-- ============================================================

-- ── pipelines: category + is_favorite ────────────────────────
ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE pipelines
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN pipelines.category IS
  'Agrupamento livre na sidebar (ex: "Comerciais", "Operacoes"). NULL = sem categoria.';

COMMENT ON COLUMN pipelines.is_favorite IS
  'Marcado como favorito na sidebar (estrela). Multiplos podem ser favoritos.';

CREATE INDEX IF NOT EXISTS idx_pipelines_category
  ON pipelines(category)
  WHERE is_archived = false AND category IS NOT NULL;

-- ── crm_deal_files ───────────────────────────────────────────
-- Anexos do deal (proposta PDF, briefing, mockups, contratos).
-- Storage real fica em Supabase Storage; aqui mantemos metadata.
CREATE TABLE IF NOT EXISTS crm_deal_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'crm-files',
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category TEXT,
  -- category: livre — "proposta", "briefing", "mockup", "contrato", etc
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crm_deal_files IS
  'Anexos do deal. Storage real fica em Supabase Storage (bucket crm-files).';

CREATE INDEX IF NOT EXISTS idx_crm_deal_files_deal
  ON crm_deal_files(deal_id);

CREATE INDEX IF NOT EXISTS idx_crm_deal_files_created
  ON crm_deal_files(created_at DESC);

-- ── RLS (mesma estrategia do CRM: desabilitado, seguranca via API) ─
ALTER TABLE crm_deal_files ENABLE ROW LEVEL SECURITY;

-- Policy admin: tudo (usado via service_role nas APIs)
DROP POLICY IF EXISTS crm_deal_files_admin_all ON crm_deal_files;
CREATE POLICY crm_deal_files_admin_all ON crm_deal_files
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Backfill: categorias default por scope ──────────────────
-- Atribui categoria default baseado em scope pra pipelines existentes
-- (somente os que ainda nao tem categoria explicita).
UPDATE pipelines
SET category = CASE
  WHEN scope = 'sales' THEN 'Comerciais'
  WHEN scope = 'cs' THEN 'Operacoes'
  WHEN scope = 'internal' THEN 'Producao'
  ELSE 'Outros'
END
WHERE category IS NULL;
