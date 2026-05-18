-- ============================================================
-- Workspace de Produção de Emails (Onboarding)
--
-- Modelo de dados pra tela "Preview em produção · Welcome Flow":
--   - email_flows: container do flow (Welcome, Abandoned Cart, etc.)
--   - email_flow_emails: cada email do flow (E-mail #01, #02...)
--   - email_blocks: blocos do email (Hero, Cupom, Produtos, Rodapé...)
--   - email_qa_checklist: items de QA do flow
--   - store_brand_identity: identidade visual versionada
--   - store_briefings: briefing tratado versionado
-- ============================================================

-- ── store_brand_identity ────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_brand_identity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  -- Logos: SVG + PNG urls
  logo_main_svg TEXT,
  logo_main_png TEXT,
  logo_alt_svg TEXT,
  logo_alt_png TEXT,
  logo_monogram_svg TEXT,
  logo_monogram_png TEXT,
  logo_reverse_svg TEXT,
  logo_reverse_png TEXT,
  -- Cores: array de { hex, name, role }
  colors_primary JSONB NOT NULL DEFAULT '[]'::jsonb,
  colors_secondary JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Tipografia
  font_heading TEXT,
  font_body TEXT,
  -- Tom + selos
  voice JSONB NOT NULL DEFAULT '[]'::jsonb,
  trust_icons JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Top produtos (snapshot Shopify)
  top_products JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ai_capture', 'manual', 'edited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE (store_id, version)
);

CREATE INDEX IF NOT EXISTS idx_store_brand_identity_store
  ON store_brand_identity(store_id, version DESC);

-- ── store_briefings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS store_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  -- raw_input: o que o cliente preencheu no formulario
  raw_input JSONB,
  -- Marca: nicho, slogan, diferencial, persona, tom, posicionamento, hashtags
  marca JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Briefing: liberdade, aprovacao, sensibilidade, conceito, politicas, etc.
  briefing JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('ai_treatment', 'manual', 'edited')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE (store_id, version)
);

CREATE INDEX IF NOT EXISTS idx_store_briefings_store
  ON store_briefings(store_id, version DESC);

-- ── email_flows ─────────────────────────────────────────────
-- Container de um flow inteiro: Welcome, Abandoned Cart, Browse, Pos-compra, Win-back.
CREATE TABLE IF NOT EXISTS email_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  -- Tipo do flow (chave estavel) + nome legível
  flow_type TEXT NOT NULL
    CHECK (flow_type IN ('welcome', 'abandoned_cart', 'browse_abandonment', 'post_purchase', 'win_back', 'custom')),
  name TEXT NOT NULL,
  description TEXT,
  -- Status do flow:
  --   blocked: ainda bloqueado (dependência nao atendida)
  --   in_progress: equipe produzindo
  --   ready_for_review: pronto pra revisão
  --   approved: cliente aprovou
  --   live: rodando em producao no Klaviyo
  status TEXT NOT NULL DEFAULT 'blocked'
    CHECK (status IN ('blocked', 'in_progress', 'ready_for_review', 'approved', 'live')),
  -- Ordem de exibição na sidebar (welcome=1, abandoned_cart=2...)
  position INTEGER NOT NULL DEFAULT 0,
  -- assigned_to: CSM/copywriter/designer responsavel
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  -- progresso geral 0-100 (calculado)
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, flow_type)
);

CREATE INDEX IF NOT EXISTS idx_email_flows_store
  ON email_flows(store_id, position);

-- ── email_flow_emails ───────────────────────────────────────
-- Cada email individual dentro de um flow.
CREATE TABLE IF NOT EXISTS email_flow_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES email_flows(id) ON DELETE CASCADE,
  -- Numero do email no flow (1, 2, 3...)
  number INTEGER NOT NULL,
  name TEXT NOT NULL,
  -- Envelope
  from_name TEXT,
  from_email TEXT,
  subject TEXT,
  preheader TEXT,
  -- HTML do email (gerado pelo template ou builder externo)
  html TEXT,
  -- delay_hours: quantas horas apos o trigger envia
  delay_hours INTEGER DEFAULT 0,
  -- Status individual
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'ready', 'approved', 'live')),
  -- progresso 0-100 (calculado: blocos aplicados / total)
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  -- Klaviyo
  klaviyo_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, number)
);

CREATE INDEX IF NOT EXISTS idx_email_flow_emails_flow
  ON email_flow_emails(flow_id, number);

-- ── email_blocks ────────────────────────────────────────────
-- Blocos individuais do email (Hero, Texto, Cupom, Produtos, Rodape).
-- "Estrutura & Copy" no painel direito.
CREATE TABLE IF NOT EXISTS email_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES email_flow_emails(id) ON DELETE CASCADE,
  -- Tipo do bloco (define o schema do content)
  block_type TEXT NOT NULL
    CHECK (block_type IN ('hero', 'text', 'coupon', 'products', 'footer', 'image', 'cta', 'divider', 'spacer', 'social')),
  -- Posicao do bloco no email (1, 2, 3...)
  position INTEGER NOT NULL,
  -- Nome do bloco no painel (ex: "Hero", "Cupom", "Produtos")
  label TEXT NOT NULL,
  -- Conteudo do bloco (JSONB livre, depende do block_type):
  --   hero:    { eyebrow, headline, body, image_url, cta_text, cta_url }
  --   coupon:  { code, hint, cta_text }
  --   products:{ title, products: [{ id, name, price, image_url }] }
  --   footer:  { columns: [{ title, links: [{ label, url }] }] }
  --   text:    { headline, body }
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Estado de aplicacao no builder externo (Klaviyo)
  applied BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ,
  applied_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email_id, position)
);

CREATE INDEX IF NOT EXISTS idx_email_blocks_email
  ON email_blocks(email_id, position);

-- ── email_qa_checklist ──────────────────────────────────────
-- Items de QA por email (links, alt-text, mobile, dark mode, etc.).
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

-- ── RLS (service_role bypass — APIs gerenciam acesso) ─────
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
      'DROP POLICY IF EXISTS %I_admin_all ON %I',
      tbl || '_admin_all', tbl
    );
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl || '_admin_all', tbl
    );
  END LOOP;
END $$;

-- ── Trigger pra atualizar updated_at em flows e emails ────
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

-- ── Trigger pra recalcular progresso do email + flow quando block muda
CREATE OR REPLACE FUNCTION recompute_email_progress()
RETURNS TRIGGER AS $$
DECLARE
  v_email_id UUID;
  v_flow_id UUID;
  v_email_pct INTEGER;
  v_flow_pct INTEGER;
BEGIN
  v_email_id := COALESCE(NEW.email_id, OLD.email_id);

  -- Recalcula progresso do email (% blocks applied)
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

  -- Recalcula progresso do flow (média de progresso dos emails)
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

-- ── Seed: cria os 5 flows defaults pra cada store_id ja existente
-- Isso garante que toda loja em onboarding ja tem o esqueleto da estrutura
-- de emails. Welcome eh in_progress (start), outros sao blocked ate aprovacao.
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
