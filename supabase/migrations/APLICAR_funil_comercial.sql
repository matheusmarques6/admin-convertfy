-- ═══════════════════════════════════════════════════════════════
-- APLICAR — Funil Comercial (migrations 20261052 + 20261053)
--
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e rode uma vez.
--
-- Seguro para rodar mais de uma vez: tudo usa IF NOT EXISTS, os UPDATEs
-- de auto-mapeamento só tocam etapas ainda sem mapeamento, e as policies
-- ignoram duplicidade. Se já tiver aplicado uma parte, roda só o que falta.
--
-- Depois de aplicar, confira com VERIFICAR_funil_comercial.sql.
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════ PARTE 1 de 2 — 20261052 ═══════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Funil Comercial — dashboard de funil com métricas de tráfego
-- (Leads → MQLs → Agendamentos → Reuniões → Vendas)
--
-- 1. pipeline_stages.funnel_step — mapeamento semântico da etapa do
--    kanban pra etapa canônica do funil (mql|agendamento|reuniao|venda).
--    O topo "leads" vem de crm_leads, não é etapa de pipeline.
--    Auto-mapeia as etapas existentes por nome + stage_type.
-- 2. deals.cash_collected — valor efetivamente recebido do deal
--    (cash collect ≠ value contratado).
-- 3. crm_ad_spend — investimento em tráfego por dia/plataforma/conta.
--    Lançamento manual via /admin/comercial/funil; estrutura pronta
--    pra sync futuro via Meta/Google Ads API.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Mapeamento semântico de etapa ─────────────────────────────

ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS funnel_step TEXT
  CHECK (funnel_step IS NULL OR funnel_step IN ('mql', 'agendamento', 'reuniao', 'venda'));

COMMENT ON COLUMN pipeline_stages.funnel_step IS
  'Etapa canônica do funil comercial (mql|agendamento|reuniao|venda). NULL = etapa fora do funil.';

-- Auto-map das etapas seed/existentes. Ordem importa: "agendad" antes
-- de "reuniao" (senão "Reuniao agendada" cairia em reuniao).
UPDATE pipeline_stages SET funnel_step = 'venda'
WHERE funnel_step IS NULL AND stage_type = 'won';

UPDATE pipeline_stages SET funnel_step = 'agendamento'
WHERE funnel_step IS NULL AND stage_type = 'open'
  AND (name ILIKE '%agendad%' OR name ILIKE '%agendament%');

UPDATE pipeline_stages SET funnel_step = 'reuniao'
WHERE funnel_step IS NULL AND stage_type = 'open'
  AND (
    name ILIKE '%reuni%realizad%'
    OR name ILIKE '%discovery realizad%'
    OR name ILIKE '%call realizad%'
  );

UPDATE pipeline_stages SET funnel_step = 'mql'
WHERE funnel_step IS NULL AND stage_type = 'open'
  AND (name ILIKE '%qualificad%' OR name ILIKE 'mql%');

-- ── 2. Cash collect no deal ──────────────────────────────────────

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS cash_collected NUMERIC(12,2)
  CHECK (cash_collected IS NULL OR cash_collected >= 0);

COMMENT ON COLUMN deals.cash_collected IS
  'Valor efetivamente recebido (cash collect). NULL = não informado; taxa cash collect usa 0.';

-- ── 3. Investimento em tráfego ───────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_ad_spend (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  platform TEXT NOT NULL DEFAULT 'meta'
    CHECK (platform IN ('meta', 'google', 'tiktok', 'other')),
  account_name TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, day, platform, account_name)
);

CREATE INDEX IF NOT EXISTS idx_crm_ad_spend_org_day
  ON crm_ad_spend(org_id, day DESC);

DROP TRIGGER IF EXISTS trg_crm_ad_spend_updated_at ON crm_ad_spend;
CREATE TRIGGER trg_crm_ad_spend_updated_at BEFORE UPDATE ON crm_ad_spend
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

ALTER TABLE crm_ad_spend ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_ad_spend_all" ON crm_ad_spend
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══════════════ PARTE 2 de 2 — 20261053 ═══════════════════════

-- ═══════════════════════════════════════════════════════════════
-- Conexão Meta Ads do funil comercial
--
-- 1. crm_ad_accounts — conta de anúncios conectada por org (token de
--    System User criptografado). Org-level, diferente das credenciais
--    Meta em client_stores (que são por loja de cliente).
-- 2. crm_ad_insights — métricas diárias por campanha/adset/anúncio,
--    sincronizadas da Graph API. A atribuição ao CRM é feita por NOME
--    (padrão de UTM da casa):
--      utm_source=meta-ads
--      utm_medium={{adset.name}}
--      utm_campaign={{campaign.name}}
--      utm_content={{ad.name}} - {{placement}}
--    Por isso os *_name são indexados: é a chave de junção com
--    crm_leads.utm / deals.utm.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_ad_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'meta' CHECK (platform IN ('meta', 'google')),
  account_id TEXT NOT NULL,              -- act_123456789
  account_name TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'BRL',
  business_id TEXT,
  access_token TEXT NOT NULL,            -- criptografado (encrypt())
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('ok', 'error', 'running')),
  last_sync_error TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_ad_accounts_org
  ON crm_ad_accounts(org_id) WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_crm_ad_accounts_updated_at ON crm_ad_accounts;
CREATE TRIGGER trg_crm_ad_accounts_updated_at BEFORE UPDATE ON crm_ad_accounts
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

COMMENT ON TABLE crm_ad_accounts IS
  'Contas de anúncio da própria agência conectadas ao funil comercial. access_token criptografado.';

-- ── Insights diários ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_ad_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_account_id UUID NOT NULL REFERENCES crm_ad_accounts(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('campaign', 'adset', 'ad')),
  entity_id TEXT NOT NULL,               -- id da campanha/adset/ad na Meta
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT,
  ad_name TEXT,
  spend NUMERIC(12,2) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  reach BIGINT NOT NULL DEFAULT 0,
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC(8,4),
  cpc NUMERIC(12,4),
  cpm NUMERIC(12,4),
  leads INTEGER NOT NULL DEFAULT 0,      -- actions: lead / onsite_conversion.lead_grouped
  thumbnail_url TEXT,
  raw JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ad_account_id, day, level, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_ad_insights_org_day
  ON crm_ad_insights(org_id, day DESC);

CREATE INDEX IF NOT EXISTS idx_crm_ad_insights_level_day
  ON crm_ad_insights(org_id, level, day DESC);

-- Junção por nome com as UTMs do CRM (lower() casa com o normalizador
-- da aplicação, que compara case-insensitive).
CREATE INDEX IF NOT EXISTS idx_crm_ad_insights_campaign_name
  ON crm_ad_insights(org_id, lower(campaign_name));

CREATE INDEX IF NOT EXISTS idx_crm_ad_insights_ad_name
  ON crm_ad_insights(org_id, lower(ad_name));

COMMENT ON COLUMN crm_ad_insights.ad_name IS
  'Nome do anúncio na Meta — casa com o prefixo de utm_content ({{ad.name}} - {{placement}}).';

ALTER TABLE crm_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_ad_insights ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_ad_accounts_all" ON crm_ad_accounts
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_ad_insights_all" ON crm_ad_insights
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Origem do investimento no funil ──────────────────────────────
-- crm_ad_spend (manual) ganha a marca de qual conta sincronizada o
-- gerou, pra o cálculo do funil não somar manual + sync em duplicidade.

ALTER TABLE crm_ad_spend
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'meta_sync', 'google_sync'));

COMMENT ON COLUMN crm_ad_spend.source IS
  'manual = lançado na UI; *_sync = espelho do insights (o funil prefere insights quando há conta ativa).';


-- ═══════════════ CONFERÊNCIA FINAL ═════════════════════════════
-- Deve retornar 6 linhas, todas com situacao = 'OK'.

SELECT item, CASE WHEN existe THEN 'OK' ELSE 'FALTA' END AS situacao
FROM (
  VALUES
    ('pipeline_stages.funnel_step', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='funnel_step')),
    ('deals.cash_collected',        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='deals' AND column_name='cash_collected')),
    ('crm_ad_spend',                EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name='crm_ad_spend')),
    ('crm_ad_spend.source',         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='crm_ad_spend' AND column_name='source')),
    ('crm_ad_accounts',             EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name='crm_ad_accounts')),
    ('crm_ad_insights',             EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_name='crm_ad_insights'))
) AS t(item, existe);
