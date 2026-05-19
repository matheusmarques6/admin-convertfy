-- ============================================================
-- SQL CONSOLIDADO — admin-convertfy (sessao Set/2026)
--
-- INSTRUÇÕES:
--   1. Abra o Supabase Dashboard → SQL Editor
--   2. Cole TUDO deste arquivo num novo query
--   3. Clique em Run
--   4. Confira as mensagens NOTICE (pre-flight + pos-flight)
--
-- IDEMPOTENTE: pode rodar várias vezes — cada bloco verifica
-- existência antes de criar/alterar. Nada é destruído.
--
-- CONTÉM:
--   PARTE 1 · CRM Pipeline V2 (categorias + favoritos + arquivos)
--   PARTE 2 · Email Production Workspace (6 tabelas + triggers + seeds)
--
-- PRÉ-REQUISITOS (devem já estar aplicados):
--   - 20260507_crm_phase1_core.sql       (pipelines, deals, crm_*)
--   - 20250502_client_stores.sql ou eq.  (tabela client_stores)
--   - 20251031_profiles.sql ou eq.       (tabela profiles)
--
-- COMPATÍVEL COM POSTGRES 14+ / SUPABASE
-- ============================================================

-- ═══════════════════════════════════════════════════════════════════
-- ╔═════════════════════════════════════════════════════════════════╗
-- ║  PARTE 1 — CRM PIPELINE V2                                      ║
-- ║  pipelines.category + is_favorite + crm_deal_files + bucket     ║
-- ╚═════════════════════════════════════════════════════════════════╝
-- ═══════════════════════════════════════════════════════════════════

-- ── Pre-flight check (P1) ────────────────────────────────────
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
  RAISE NOTICE 'PRE-FLIGHT P1 · CRM Pipeline V2';
  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'pipelines.category .......... %', CASE WHEN has_category THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'pipelines.is_favorite ....... %', CASE WHEN has_favorite THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'crm_deal_files table ........ %', CASE WHEN has_files_table THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'storage bucket crm-files .... %', CASE WHEN has_storage_bucket THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE '──────────────────────────────────────────────';
END $$;

-- ── P1.1: pipelines.category + is_favorite ──────────────────
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

-- ── P1.2: crm_deal_files (anexos do deal) ───────────────────
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE crm_deal_files IS
  'Anexos do deal. Storage real fica em Supabase Storage (bucket crm-files).';

CREATE INDEX IF NOT EXISTS idx_crm_deal_files_deal
  ON crm_deal_files(deal_id);

CREATE INDEX IF NOT EXISTS idx_crm_deal_files_created
  ON crm_deal_files(created_at DESC);

-- ── P1.3: RLS em crm_deal_files ─────────────────────────────
ALTER TABLE crm_deal_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_deal_files_admin_all ON crm_deal_files;
CREATE POLICY crm_deal_files_admin_all ON crm_deal_files
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── P1.4: Backfill de categorias por scope ───────────────────
-- Apenas onde category IS NULL — não sobrescreve escolhas do user.
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

  RAISE NOTICE 'P1.4 Backfill categorias: % pipelines atualizados', updated_count;
END $$;

-- ── P1.5: Storage bucket crm-files ──────────────────────────
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

-- ── P1.6: Storage policies (upload direto via Supabase JS) ──
DROP POLICY IF EXISTS "crm_files_authenticated_read" ON storage.objects;
CREATE POLICY "crm_files_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'crm-files');

DROP POLICY IF EXISTS "crm_files_authenticated_insert" ON storage.objects;
CREATE POLICY "crm_files_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'crm-files');

DROP POLICY IF EXISTS "crm_files_authenticated_delete" ON storage.objects;
CREATE POLICY "crm_files_authenticated_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'crm-files');


-- ═══════════════════════════════════════════════════════════════════
-- ╔═════════════════════════════════════════════════════════════════╗
-- ║  PARTE 2 — EMAIL PRODUCTION WORKSPACE                           ║
-- ║  6 tabelas + RLS + triggers + seeds (welcome flow completo)     ║
-- ╚═════════════════════════════════════════════════════════════════╝
-- ═══════════════════════════════════════════════════════════════════

-- ── Pre-flight check (P2) ────────────────────────────────────
DO $$
DECLARE
  t_brand BOOLEAN;
  t_brief BOOLEAN;
  t_flow BOOLEAN;
  t_email BOOLEAN;
  t_block BOOLEAN;
  t_qa BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='store_brand_identity') INTO t_brand;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='store_briefings') INTO t_brief;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='email_flows') INTO t_flow;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='email_flow_emails') INTO t_email;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='email_blocks') INTO t_block;
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='email_qa_checklist') INTO t_qa;

  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'PRE-FLIGHT P2 · Email Production Workspace';
  RAISE NOTICE '──────────────────────────────────────────────';
  RAISE NOTICE 'store_brand_identity ........ %', CASE WHEN t_brand THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'store_briefings ............. %', CASE WHEN t_brief THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'email_flows ................. %', CASE WHEN t_flow THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'email_flow_emails ........... %', CASE WHEN t_email THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'email_blocks ................ %', CASE WHEN t_block THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE 'email_qa_checklist .......... %', CASE WHEN t_qa THEN 'JA EXISTE' ELSE 'sera CRIADO' END;
  RAISE NOTICE '──────────────────────────────────────────────';
END $$;

-- ── P2.1: store_brand_identity ──────────────────────────────
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

-- ── P2.2: store_briefings ───────────────────────────────────
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

-- ── P2.3: email_flows ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  flow_type TEXT NOT NULL
    CHECK (flow_type IN ('welcome', 'abandoned_cart', 'browse_abandonment', 'post_purchase', 'win_back', 'custom')),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'blocked'
    CHECK (status IN ('blocked', 'in_progress', 'ready_for_review', 'approved', 'live')),
  position INTEGER NOT NULL DEFAULT 0,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, flow_type)
);

CREATE INDEX IF NOT EXISTS idx_email_flows_store
  ON email_flows(store_id, position);

-- ── P2.4: email_flow_emails ─────────────────────────────────
CREATE TABLE IF NOT EXISTS email_flow_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  from_name TEXT,
  from_email TEXT,
  subject TEXT,
  preheader TEXT,
  html TEXT,
  delay_hours INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'ready', 'approved', 'live')),
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  klaviyo_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, number)
);

CREATE INDEX IF NOT EXISTS idx_email_flow_emails_flow
  ON email_flow_emails(flow_id, number);

-- ── P2.5: email_blocks ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES email_flow_emails(id) ON DELETE CASCADE,
  block_type TEXT NOT NULL
    CHECK (block_type IN ('hero', 'text', 'coupon', 'products', 'footer', 'image', 'cta', 'divider', 'spacer', 'social')),
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, position)
);

CREATE INDEX IF NOT EXISTS idx_email_blocks_email
  ON email_blocks(email_id, position);

-- ── P2.6: email_qa_checklist ────────────────────────────────
CREATE TABLE IF NOT EXISTS email_qa_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES email_flow_emails(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  category TEXT
    CHECK (category IN ('content', 'design', 'tech', 'compliance')),
  done BOOLEAN NOT NULL DEFAULT false,
  done_at TIMESTAMPTZ,
  done_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, position)
);

CREATE INDEX IF NOT EXISTS idx_email_qa_email
  ON email_qa_checklist(email_id, position);

-- ── P2.7: RLS (service_role bypass) ─────────────────────────
ALTER TABLE store_brand_identity ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_flow_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_qa_checklist ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'store_brand_identity', 'store_briefings', 'email_flows',
    'email_flow_emails', 'email_blocks', 'email_qa_checklist'
  ]) LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I',
      tbl || '_admin_all', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl || '_admin_all', tbl
    );
  END LOOP;
END $$;

-- ── P2.8: Trigger update_updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_flows_updated ON email_flows;
CREATE TRIGGER trg_email_flows_updated
  BEFORE UPDATE ON email_flows
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_email_flow_emails_updated ON email_flow_emails;
CREATE TRIGGER trg_email_flow_emails_updated
  BEFORE UPDATE ON email_flow_emails
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── P2.9: Trigger recompute_email_progress ──────────────────
CREATE OR REPLACE FUNCTION recompute_email_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_email_id UUID;
  v_flow_id UUID;
  v_email_pct INTEGER;
  v_flow_pct INTEGER;
BEGIN
  v_email_id := COALESCE(NEW.email_id, OLD.email_id);

  SELECT
    COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE applied) / NULLIF(COUNT(*), 0)), 0)
  INTO v_email_pct
  FROM email_blocks
  WHERE email_id = v_email_id;

  UPDATE email_flow_emails
    SET progress_percent = v_email_pct,
        status = CASE
          WHEN v_email_pct = 100 THEN 'ready'
          WHEN v_email_pct > 0 THEN 'in_progress'
          ELSE 'draft'
        END
  WHERE id = v_email_id
  RETURNING flow_id INTO v_flow_id;

  IF v_flow_id IS NOT NULL THEN
    SELECT COALESCE(ROUND(AVG(progress_percent)), 0)
    INTO v_flow_pct
    FROM email_flow_emails
    WHERE flow_id = v_flow_id;

    UPDATE email_flows
      SET progress_percent = v_flow_pct
    WHERE id = v_flow_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_blocks_progress ON email_blocks;
CREATE TRIGGER trg_email_blocks_progress
  AFTER INSERT OR UPDATE OF applied OR DELETE ON email_blocks
  FOR EACH ROW EXECUTE FUNCTION recompute_email_progress();

-- ── P2.10: Seed dos 5 flows defaults por client_store ───────
INSERT INTO email_flows (store_id, flow_type, name, description, status, position)
SELECT cs.id, t.flow_type, t.name, t.description, t.status, t.position
FROM client_stores cs
CROSS JOIN (VALUES
  ('welcome', 'Welcome Flow', 'Sequencia de boas-vindas para novos inscritos', 'in_progress', 1),
  ('abandoned_cart', 'Abandoned Cart', 'Recuperacao de carrinho abandonado', 'blocked', 2),
  ('browse_abandonment', 'Browse Abandonment', 'Recuperacao de navegacao sem compra', 'blocked', 3),
  ('post_purchase', 'Pós-compra', 'Engajamento pos-compra', 'blocked', 4),
  ('win_back', 'Win-back', 'Reativacao de clientes inativos', 'blocked', 5)
) AS t(flow_type, name, description, status, position)
WHERE NOT EXISTS (
  SELECT 1 FROM email_flows ef
  WHERE ef.store_id = cs.id AND ef.flow_type = t.flow_type
)
ON CONFLICT (store_id, flow_type) DO NOTHING;

-- ── P2.11: Seed dos 5 emails padrão do Welcome ───────────────
WITH welcome_flows AS (
  SELECT id, store_id FROM email_flows WHERE flow_type = 'welcome'
)
INSERT INTO email_flow_emails (flow_id, number, name, from_name, from_email, subject, preheader, delay_hours, status)
SELECT
  wf.id,
  t.number,
  t.name,
  COALESCE(cs.store_name, 'Loja'),
  COALESCE('atendimento@' || regexp_replace(cs.store_url, '^https?://(www\.)?', ''), 'noreply@email.com'),
  t.subject,
  t.preheader,
  t.delay_hours,
  CASE WHEN t.number = 1 THEN 'in_progress' ELSE 'draft' END
FROM welcome_flows wf
JOIN client_stores cs ON cs.id = wf.store_id
CROSS JOIN (VALUES
  (1, 'Bem-vindo',          'Bem-vindo a bordo · ganhe 10% off',                 'Seu cupom de boas-vindas está disponível', 0),
  (2, 'História da marca',  'De um sonho à revolução no esporte',                'Conheça a história por trás da marca e ganhe 10% off', 24),
  (3, 'Tênis favoritos',    'Os modelos mais vendidos da semana',                'Selecionados pra você que está começando', 48),
  (4, 'Ainda quer 10% OFF?','Seu cupom expira em 24h',                           'Última chance de usar seu desconto de boas-vindas', 96),
  (5, 'Última chance',      'O desconto sai do ar hoje',                         'Encerramento das ofertas exclusivas pra novos clientes', 120)
) AS t(number, name, subject, preheader, delay_hours)
WHERE NOT EXISTS (
  SELECT 1 FROM email_flow_emails efe
  WHERE efe.flow_id = wf.id AND efe.number = t.number
);

-- ── P2.12: Blocks default por email do Welcome ──────────────

-- Email #1 - Bem-vindo: Hero + Cupom + Rodapé
WITH e1 AS (
  SELECT efe.id, cs.store_name, cs.store_url
  FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  JOIN client_stores cs ON cs.id = ef.store_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 1
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e1.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e1
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'BEM-VINDO',
    'headline', 'SUA JORNADA COMECA AQUI',
    'body', 'Estamos felizes em ter voce com a gente. Como agradecimento, ganhe 10% off na sua primeira compra.',
    'cta_text', 'APROVEITAR DESCONTO',
    'image_url', '',
    'image_alt', 'Boas vindas'
  )::text),
  ('coupon', 2, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'VALIDO POR 48H',
    'cta_text', 'COPIAR CUPOM'
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(
      jsonb_build_object('links', jsonb_build_array(
        jsonb_build_object('label', 'LANÇAMENTOS', 'url', '#'),
        jsonb_build_object('label', 'MASCULINO',   'url', '#'),
        jsonb_build_object('label', 'FEMININO',    'url', '#'),
        jsonb_build_object('label', 'INFANTIL',    'url', '#')
      ))
    ),
    'copyright', '© 2026 LOJA · TODOS OS DIREITOS RESERVADOS'
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e1.id
);

-- Email #2 - História da marca: Hero + Texto + Cupom + Produtos + Rodapé
WITH e2 AS (
  SELECT efe.id, cs.store_name FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  JOIN client_stores cs ON cs.id = ef.store_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 2
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e2.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e2
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'NOSSA HISTÓRIA',
    'headline', 'DE UM SONHO À REVOLUÇÃO NO MERCADO',
    'body', 'Em 2021, percebi uma realidade frustrante: talentos incriveis ficavam de fora por falta de acesso. Decidi mudar isso.',
    'cta_text', 'DESCOBRIR NOSSA JORNADA',
    'image_url', '',
    'image_alt', 'Fundador'
  )::text),
  ('text', 2, 'Texto', jsonb_build_object(
    'headline', 'POR QUE SOMOS DIFERENTES',
    'body', 'Cada produto e selecionado pensando em quem ama o que faz. Qualidade premium a preco acessivel.'
  )::text),
  ('coupon', 3, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'POR TEMPO LIMITADO',
    'cta_text', 'APROVEITAR 10%OFF'
  )::text),
  ('products', 4, 'Produtos', jsonb_build_object(
    'title', 'CONHEÇA NOSSOS TÊNIS FAVORITOS',
    'products', jsonb_build_array(
      jsonb_build_object('name', 'Modelo Pro Court',  'price', '49,95', 'image_url', '', 'cta_text', 'BUY NOW'),
      jsonb_build_object('name', 'Modelo Rosa Air',   'price', '49,95', 'image_url', '', 'cta_text', 'BUY NOW'),
      jsonb_build_object('name', 'Modelo Black',      'price', '69,95', 'image_url', '', 'cta_text', 'BUY NOW'),
      jsonb_build_object('name', 'Modelo Galaxy',     'price', '49,95', 'image_url', '', 'cta_text', 'BUY NOW')
    )
  )::text),
  ('footer', 5, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(
      jsonb_build_object('links', jsonb_build_array(
        jsonb_build_object('label', 'LANÇAMENTOS', 'url', '#'),
        jsonb_build_object('label', 'MASCULINO',   'url', '#'),
        jsonb_build_object('label', 'FEMININO',    'url', '#'),
        jsonb_build_object('label', 'INFANTIL',    'url', '#')
      ))
    ),
    'copyright', '© 2026 ' || UPPER(e2.store_name) || ' · TODOS OS DIREITOS RESERVADOS'
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e2.id
);

-- Email #3 - Tênis favoritos: Hero + Produtos + Rodapé
WITH e3 AS (
  SELECT efe.id, cs.store_name FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  JOIN client_stores cs ON cs.id = ef.store_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 3
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e3.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e3
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'SELECAO DA CASA',
    'headline', 'OS MAIS VENDIDOS DA SEMANA',
    'body', 'Curadoria especial dos produtos que estao saindo mais. Tudo com 10% off pra voce.',
    'cta_text', 'VER COLEÇÃO COMPLETA'
  )::text),
  ('products', 2, 'Produtos', jsonb_build_object(
    'title', 'TOP 4',
    'products', jsonb_build_array(
      jsonb_build_object('name', 'Produto #1', 'price', '99,90', 'image_url', '', 'cta_text', 'COMPRAR'),
      jsonb_build_object('name', 'Produto #2', 'price', '129,90','image_url', '', 'cta_text', 'COMPRAR'),
      jsonb_build_object('name', 'Produto #3', 'price', '79,90', 'image_url', '', 'cta_text', 'COMPRAR'),
      jsonb_build_object('name', 'Produto #4', 'price', '149,90','image_url', '', 'cta_text', 'COMPRAR')
    )
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(jsonb_build_object('links', jsonb_build_array(
      jsonb_build_object('label', 'EXPLORAR LOJA',  'url', '#'),
      jsonb_build_object('label', 'CENTRAL DE AJUDA','url', '#'),
      jsonb_build_object('label', 'FAQ',             'url', '#')
    )))
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e3.id
);

-- Email #4 - Ainda quer 10% OFF? (urgência): Hero + Cupom + Rodapé
WITH e4 AS (
  SELECT efe.id FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 4
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e4.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e4
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'ULTIMOS DIAS',
    'headline', 'SEU CUPOM EXPIRA EM 24H',
    'body', 'Voce ainda nao usou seu 10% off. Aproveite antes que o tempo acabe.',
    'cta_text', 'USAR AGORA'
  )::text),
  ('coupon', 2, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'EXPIRA EM 24H',
    'cta_text', 'USAR ANTES QUE ACABE'
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(jsonb_build_object('links', jsonb_build_array(
      jsonb_build_object('label', 'COMPRAR AGORA', 'url', '#')
    )))
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e4.id
);

-- Email #5 - Última chance: Hero + Cupom + Rodapé
WITH e5 AS (
  SELECT efe.id FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  WHERE ef.flow_type = 'welcome' AND efe.number = 5
)
INSERT INTO email_blocks (email_id, block_type, position, label, content)
SELECT e5.id, b.block_type, b.position, b.label, b.content::jsonb
FROM e5
CROSS JOIN (VALUES
  ('hero', 1, 'Hero', jsonb_build_object(
    'eyebrow', 'AGORA OU NUNCA',
    'headline', 'A OFERTA SAI DO AR HOJE',
    'body', 'Sua chance de comprar com 10% off termina hoje. Depois disso, volta ao preco normal.',
    'cta_text', 'COMPRAR ANTES QUE ACABE'
  )::text),
  ('coupon', 2, 'Cupom', jsonb_build_object(
    'code', 'BEMVINDO10',
    'hint', 'TERMINA HOJE',
    'cta_text', 'GARANTIR DESCONTO'
  )::text),
  ('footer', 3, 'Rodapé', jsonb_build_object(
    'columns', jsonb_build_array(jsonb_build_object('links', jsonb_build_array(
      jsonb_build_object('label', 'EXPLORAR LOJA', 'url', '#')
    )))
  )::text)
) AS b(block_type, position, label, content)
WHERE NOT EXISTS (
  SELECT 1 FROM email_blocks eb WHERE eb.email_id = e5.id
);

-- ── P2.13: QA checklist default (10 itens por email) ────────
WITH welcome_emails AS (
  SELECT efe.id
  FROM email_flow_emails efe
  JOIN email_flows ef ON ef.id = efe.flow_id
  WHERE ef.flow_type = 'welcome'
)
INSERT INTO email_qa_checklist (email_id, position, label, category)
SELECT we.id, t.position, t.label, t.category
FROM welcome_emails we
CROSS JOIN (VALUES
  (1,  'Assunto tem entre 30 e 50 caracteres',              'content'),
  (2,  'Pré-cabeçalho não repete o assunto',                'content'),
  (3,  'Todas as imagens tem alt text descritivo',          'tech'),
  (4,  'Links principais foram testados e funcionam',       'tech'),
  (5,  'CTA primário aparece acima da dobra',               'design'),
  (6,  'Render OK no Gmail / Outlook / Apple Mail',         'tech'),
  (7,  'Render OK no modo escuro (dark mode)',              'design'),
  (8,  'Cupom inclui prazo de validade visível',            'content'),
  (9,  'Texto de unsubscribe presente no rodapé',           'compliance'),
  (10, 'Footer com endereço físico (CAN-SPAM / LGPD)',      'compliance')
) AS t(position, label, category)
WHERE NOT EXISTS (
  SELECT 1 FROM email_qa_checklist q WHERE q.email_id = we.id
);

-- ── P2.14: Recalcula progress_percent (consistencia inicial) ─
UPDATE email_flow_emails efe
SET progress_percent = COALESCE((
  SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE applied) / NULLIF(COUNT(*), 0))
  FROM email_blocks WHERE email_id = efe.id
), 0)
WHERE EXISTS (SELECT 1 FROM email_blocks WHERE email_id = efe.id);

UPDATE email_flows ef
SET progress_percent = COALESCE((
  SELECT ROUND(AVG(progress_percent)) FROM email_flow_emails WHERE flow_id = ef.id
), 0)
WHERE EXISTS (SELECT 1 FROM email_flow_emails WHERE flow_id = ef.id);


-- ═══════════════════════════════════════════════════════════════════
-- ╔═════════════════════════════════════════════════════════════════╗
-- ║  PÓS-FLIGHT · Verificação final                                 ║
-- ╚═════════════════════════════════════════════════════════════════╝
-- ═══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cat_count INTEGER;
  fav_count INTEGER;
  files_count INTEGER;
  bucket_exists BOOLEAN;
  pipelines_with_cat INTEGER;
  total_flows INTEGER;
  total_emails INTEGER;
  total_blocks INTEGER;
  total_qa INTEGER;
  stores_with_flows INTEGER;
  total_stores INTEGER;
BEGIN
  -- Parte 1
  SELECT COUNT(*) INTO cat_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = 'category';
  SELECT COUNT(*) INTO fav_count FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipelines' AND column_name = 'is_favorite';
  SELECT COUNT(*) INTO files_count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_deal_files';
  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'crm-files') INTO bucket_exists;
  SELECT COUNT(*) INTO pipelines_with_cat FROM pipelines WHERE category IS NOT NULL;

  -- Parte 2
  SELECT COUNT(*) INTO total_flows FROM email_flows;
  SELECT COUNT(*) INTO total_emails FROM email_flow_emails;
  SELECT COUNT(*) INTO total_blocks FROM email_blocks;
  SELECT COUNT(*) INTO total_qa FROM email_qa_checklist;
  SELECT COUNT(DISTINCT store_id) INTO stores_with_flows FROM email_flows;
  SELECT COUNT(*) INTO total_stores FROM client_stores;

  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '✓ MIGRATION COMPLETA · resumo final';
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '── PARTE 1 · Pipeline V2 ──';
  RAISE NOTICE 'pipelines.category .......... % (esperado: 1)', cat_count;
  RAISE NOTICE 'pipelines.is_favorite ....... % (esperado: 1)', fav_count;
  RAISE NOTICE 'crm_deal_files table ........ % (esperado: 1)', files_count;
  RAISE NOTICE 'storage bucket crm-files .... %', CASE WHEN bucket_exists THEN 'OK' ELSE 'FALTANDO' END;
  RAISE NOTICE 'Pipelines com categoria ..... %', pipelines_with_cat;
  RAISE NOTICE '';
  RAISE NOTICE '── PARTE 2 · Email Workspace ──';
  RAISE NOTICE 'email_flows total ........... %', total_flows;
  RAISE NOTICE 'email_flow_emails total ..... %', total_emails;
  RAISE NOTICE 'email_blocks total .......... %', total_blocks;
  RAISE NOTICE 'email_qa_checklist total .... %', total_qa;
  RAISE NOTICE 'Stores com flows ............ % de % stores', stores_with_flows, total_stores;
  RAISE NOTICE '';
  RAISE NOTICE '══════════════════════════════════════════════';
  RAISE NOTICE '✓ Aplicacao concluida com sucesso';
  RAISE NOTICE '══════════════════════════════════════════════';
END $$;
