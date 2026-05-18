-- ============================================================
-- CRM Convertfy — Pipeline V2: categories + favoritos + deal files
--
-- IDEMPOTENTE: pode rodar varias vezes sem quebrar nada.
-- Cada bloco verifica existencia antes de criar/alterar.
--
-- Pre-requisitos:
--   - 20260507_crm_phase1_core.sql (tabelas pipelines, deals, crm_*)
--
-- Mudancas:
--   1. pipelines.category — agrupamento livre na sidebar
--   2. pipelines.is_favorite — destaque com estrela
--   3. crm_deal_files — anexos do deal (Storage bucket crm-files)
--   4. Storage bucket crm-files + policies
--
-- COMO RODAR:
--   - Cole TUDO no SQL Editor do Supabase Dashboard
--   - Execute (botao Run)
--   - Mensagens NOTICE mostram o que foi feito vs ja existia
-- ============================================================

-- ── Bloco 0: Pre-flight check ────────────────────────────────
-- Lista estado ATUAL antes de qualquer mudanca. Util pra
-- conferir o que vai mudar. Apenas mostra, nao altera.
DO $$
DECLARE
  has_category BOOLEAN;
  has_favorite BOOLEAN;
  has_files_table BOOLEAN;
  has_storage_bucket BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipelines'
      AND column_name = 'category'
  ) INTO has_category;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipelines'
      AND column_name = 'is_favorite'
  ) INTO has_favorite;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_deal_files'
  ) INTO has_files_table;

  SELECT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'crm-files'
  ) INTO has_storage_bucket;

  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'PRE-FLIGHT CHECK · Pipeline V2 migration';
  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'pipelines.category .......... %', CASE WHEN has_category THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'pipelines.is_favorite ....... %', CASE WHEN has_favorite THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'crm_deal_files table ........ %', CASE WHEN has_files_table THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'storage bucket crm-files .... %', CASE WHEN has_storage_bucket THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE '──────────────────────────────────────────────';
END $$;

-- ── Bloco 1: pipelines.category + is_favorite ───────────────
-- Ambos com IF NOT EXISTS — seguros pra re-execucao.
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

-- ── Bloco 2: crm_deal_files ──────────────────────────────────
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

-- ── Bloco 3: RLS em crm_deal_files ───────────────────────────
-- Padrao do CRM: RLS habilitado mas com policy permissiva pra
-- service_role. As APIs do projeto usam service_role e fazem o
-- isolamento via org_id na propria query.
ALTER TABLE crm_deal_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_deal_files_admin_all ON crm_deal_files;
CREATE POLICY crm_deal_files_admin_all ON crm_deal_files
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Bloco 4: Backfill de categorias por scope ────────────────
-- Pipelines existentes sem categoria recebem uma default baseada
-- em scope. Roda so onde category IS NULL — re-execucao nao
-- sobrescreve categorias ja definidas pelo usuario.
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  WITH upd AS (
    UPDATE pipelines
    SET category = CASE
      WHEN scope = 'sales' THEN 'Comerciais'
      WHEN scope = 'cs' THEN 'Operacoes'
      WHEN scope = 'internal' THEN 'Producao'
      ELSE 'Outros'
    END
    WHERE category IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO updated_count FROM upd;

  RAISE NOTICE 'Backfill categorias: % pipelines atualizados', updated_count;
END $$;

-- ── Bloco 5: Storage bucket crm-files ────────────────────────
-- Bucket privado (signed URLs). Cria so se nao existir.
-- file_size_limit 50MB · mime types curados.
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

-- ── Bloco 6: Policies do bucket ──────────────────────────────
-- Permite usuarios autenticados ler/inserir/deletar no bucket
-- crm-files. As APIs do projeto usam service_role (bypass), mas
-- isso permite upload direto via Supabase Storage client no front.
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

-- ── Bloco 7: Pos-flight verification ────────────────────────
-- Confirma o estado FINAL apos as mudancas.
DO $$
DECLARE
  cat_count INTEGER;
  fav_count INTEGER;
  files_count INTEGER;
  pipelines_with_cat INTEGER;
BEGIN
  SELECT COUNT(*) INTO cat_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = 'category';
  SELECT COUNT(*) INTO fav_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = 'is_favorite';
  SELECT COUNT(*) INTO files_count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_deal_files';
  SELECT COUNT(*) INTO pipelines_with_cat FROM pipelines WHERE category IS NOT NULL;

  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'POS-FLIGHT · Estado final';
  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'pipelines.category .......... % (esperado: 1)', cat_count;
  RAISE NOTICE 'pipelines.is_favorite ....... % (esperado: 1)', fav_count;
  RAISE NOTICE 'crm_deal_files table ........ % (esperado: 1)', files_count;
  RAISE NOTICE 'Pipelines com categoria ..... %', pipelines_with_cat;
  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'Migration aplicada com sucesso ✓';
END $$;
