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

-- ── Storage bucket: crm-files ────────────────────────────────
-- Bucket private (signed URLs via API). Cria o bucket se nao existir.
-- O Storage no Supabase tem RLS proprio em storage.objects;
-- nosso fluxo passa pelo service_role das APIs, entao nao precisa
-- de policies para clientes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'crm-files',
  'crm-files',
  false,
  52428800,  -- 50 MB por arquivo
  ARRAY[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket: leitura/escrita por usuarios autenticados.
-- O proprio servico (API rota) ja usa service_role bypass, mas isso
-- permite que o front faca upload direto pelo Storage client com cookie
-- de sessao (browser → supabase storage).
DROP POLICY IF EXISTS "crm_files_authenticated_read" ON storage.objects;
CREATE POLICY "crm_files_authenticated_read" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'crm-files');

DROP POLICY IF EXISTS "crm_files_authenticated_insert" ON storage.objects;
CREATE POLICY "crm_files_authenticated_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'crm-files');

DROP POLICY IF EXISTS "crm_files_authenticated_delete" ON storage.objects;
CREATE POLICY "crm_files_authenticated_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'crm-files');
