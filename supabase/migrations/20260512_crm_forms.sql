-- ============================================================
-- CRM Convertfy — Forms (lead capture forms)
--
-- Auditado contra o banco de produção em 08/05/2026:
--   ✓ Tabelas dependentes existem: organizations, profiles,
--     org_members, pipelines, pipeline_stages, deals, crm_leads,
--     crm_deal_activities
--   ✓ Tipos das FKs casam (todas as PKs sao UUID)
--   ✓ Extensions uuid-ossp + pgcrypto ativas
--   ✓ Convencao do projeto: uuid_generate_v4() (uuid-ossp) ao
--     inves de gen_random_uuid() (pgcrypto)
--
-- Implementa formularios publicos que capturam leads e criam deals
-- automaticamente no pipeline configurado.
--
-- Tabelas criadas:
--   - crm_forms             form definicao + tema + pipeline target
--   - crm_form_fields       campos configuraveis (text, email, etc)
--   - crm_form_submissions  respostas + lead_id + deal_id criados
--
-- Idempotente: pode ser rodada multiplas vezes sem erro.
-- ============================================================

-- ── 1. crm_forms ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Quando preenchidos, o submission cria deal nesse pipeline+stage.
  -- Se NULL, so cria lead (sem deal).
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

  name TEXT NOT NULL,
  -- Slug unico por org — usado em /forms/[slug] (view publico).
  slug TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),

  -- Tema visual do form. JSON com cores, fontes, copy etc.
  theme JSONB NOT NULL DEFAULT '{
    "primaryColor": "#2563EB",
    "backgroundColor": "#FFFFFF",
    "textColor": "#0F172A",
    "borderRadius": 8,
    "fontFamily": "Inter",
    "fontSize": 14,
    "headline": "",
    "subheadline": "",
    "buttonText": "Enviar",
    "hideTitle": false,
    "hideLabels": false
  }'::jsonb,

  logo_url TEXT,
  success_message TEXT DEFAULT 'Obrigado! Sua resposta foi registrada.',
  redirect_url TEXT,

  -- Tracking pra Ads (futura entrega — colunas ja prontas).
  facebook_pixel_id TEXT,
  google_ads_id TEXT,
  google_analytics_id TEXT,

  -- Cache de contadores (incrementados via trigger / RPC).
  submissions_count INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_forms_org_slug ON crm_forms(org_id, slug);
CREATE INDEX IF NOT EXISTS idx_crm_forms_org ON crm_forms(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_pipeline ON crm_forms(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_crm_forms_status ON crm_forms(status);


-- ── 2. crm_form_fields ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_form_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,

  field_type TEXT NOT NULL CHECK (field_type IN (
    'text', 'email', 'phone', 'number', 'textarea',
    'select', 'multi_select', 'radio', 'checkbox',
    'date', 'url', 'cpf', 'cnpj', 'cep', 'hidden'
  )),
  label TEXT NOT NULL,
  placeholder TEXT,
  description TEXT,
  required BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,

  -- Para select/radio/checkbox: array de strings ou {label, value}.
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Validation: { min, max, regex, ... }.
  validation JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Mapeia campo do form pra coluna de crm_leads. Quando NULL, valor
  -- vai pro JSONB de answers da submission.
  -- Valores aceitos: name, email, phone, company, source.
  map_to_lead_field TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_fields_form ON crm_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_fields_position ON crm_form_fields(form_id, position);


-- ── 3. crm_form_submissions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_form_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES crm_forms(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Lead/deal criados ou linkados a partir desta submission.
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,

  -- Resposta crua: { field_id: value, ... }
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata pra debugging/atribuição.
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,

  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'contacted', 'qualified', 'converted', 'lost')
  ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_form ON crm_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_org ON crm_form_submissions(org_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_lead ON crm_form_submissions(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_deal ON crm_form_submissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_form_submissions_created ON crm_form_submissions(created_at DESC);


-- ── 4. RLS — leitura/escrita restrita ao org_id do user ────────
-- Endpoints publicos /api/public/forms usam service_role e bypassam RLS.
-- Todas policies tem DROP IF EXISTS pra serem reaplicaveis sem erro.

ALTER TABLE crm_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_forms_org" ON crm_forms;
CREATE POLICY "crm_forms_org" ON crm_forms
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  );

ALTER TABLE crm_form_fields ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_form_fields_via_form" ON crm_form_fields;
CREATE POLICY "crm_form_fields_via_form" ON crm_form_fields
  FOR ALL
  USING (
    form_id IN (
      SELECT id FROM crm_forms
      WHERE org_id IN (
        SELECT org_id FROM org_members
        WHERE profile_id = auth.uid() AND is_active = true
      )
    )
  )
  WITH CHECK (
    form_id IN (
      SELECT id FROM crm_forms
      WHERE org_id IN (
        SELECT org_id FROM org_members
        WHERE profile_id = auth.uid() AND is_active = true
      )
    )
  );

ALTER TABLE crm_form_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_form_submissions_org" ON crm_form_submissions;
CREATE POLICY "crm_form_submissions_org" ON crm_form_submissions
  FOR ALL
  USING (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM org_members
      WHERE profile_id = auth.uid() AND is_active = true
    )
  );


-- ── 5. Trigger: incrementa submissions_count no form ─────────────

CREATE OR REPLACE FUNCTION increment_form_submissions()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE crm_forms
    SET submissions_count = submissions_count + 1,
        updated_at = NOW()
  WHERE id = NEW.form_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_increment_form_submissions ON crm_form_submissions;
CREATE TRIGGER trg_increment_form_submissions
  AFTER INSERT ON crm_form_submissions
  FOR EACH ROW EXECUTE FUNCTION increment_form_submissions();

-- Funcao pra incrementar views chamada via RPC do view publico.
CREATE OR REPLACE FUNCTION increment_form_views(p_form_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE crm_forms
    SET views_count = views_count + 1
  WHERE id = p_form_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── 6. updated_at trigger ───────────────────────────────────────

CREATE OR REPLACE FUNCTION crm_forms_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_forms_updated_at ON crm_forms;
CREATE TRIGGER trg_crm_forms_updated_at
  BEFORE UPDATE ON crm_forms
  FOR EACH ROW EXECUTE FUNCTION crm_forms_updated_at();


-- ── 7. Grants ───────────────────────────────────────────────────

GRANT ALL ON crm_forms TO service_role;
GRANT ALL ON crm_form_fields TO service_role;
GRANT ALL ON crm_form_submissions TO service_role;
GRANT EXECUTE ON FUNCTION increment_form_views(UUID) TO service_role, authenticated, anon;


-- ── 8. Comentarios ───────────────────────────────────────────────

COMMENT ON TABLE crm_forms IS 'Formularios de captacao de leads. Cada form pode estar vinculado a um pipeline+stage e cria deal automaticamente quando submitado.';
COMMENT ON TABLE crm_form_fields IS 'Campos do form (text, email, phone, etc). map_to_lead_field permite popular crm_leads.{name,email,phone,company,source} automaticamente.';
COMMENT ON TABLE crm_form_submissions IS 'Submissoes recebidas. Sempre cria/linka um lead, opcionalmente um deal se o form tem pipeline_id.';

-- ============================================================
-- Verificacao final — descomente pra confirmar apos rodar:
-- ============================================================
-- SELECT
--   table_name,
--   (SELECT COUNT(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name=t.table_name) AS cols
-- FROM (VALUES ('crm_forms'),('crm_form_fields'),('crm_form_submissions')) t(table_name);
-- Esperado: 3 linhas com cols > 0.
