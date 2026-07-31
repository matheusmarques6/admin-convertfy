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
