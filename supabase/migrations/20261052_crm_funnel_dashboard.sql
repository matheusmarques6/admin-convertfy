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
