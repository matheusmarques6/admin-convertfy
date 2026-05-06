-- ════════════════════════════════════════════════════════════════════
-- CRM Convertfy — Fase 6: BI snapshot-first
--
-- Filosofia: jamais agregar em runtime. Cron diario popula snapshots.
-- Reports leem direto da tabela de snapshots (timeseries cheap).
--
-- Tres tabelas:
-- - crm_pipeline_snapshots: por (org_id, pipeline_id, day) — open count,
--   open value, won count/value, lost count/value, ciclo medio.
-- - crm_org_snapshots: agregado da org por dia — totais cross-pipeline.
-- - crm_lead_funnel_snapshots: leads por status por dia (new, qualified,
--   converted, lost).
-- ════════════════════════════════════════════════════════════════════

-- ── crm_pipeline_snapshots ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_pipeline_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL,

  -- Estados atuais
  open_count INTEGER NOT NULL DEFAULT 0,
  open_value NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Eventos no dia (won/lost ocorridos exatamente neste dia)
  won_count_today INTEGER NOT NULL DEFAULT 0,
  won_value_today NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lost_count_today INTEGER NOT NULL DEFAULT 0,
  lost_value_today NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Acumulados ate o dia (rolling 30d)
  won_count_30d INTEGER NOT NULL DEFAULT 0,
  won_value_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lost_count_30d INTEGER NOT NULL DEFAULT 0,
  lost_value_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,

  -- Performance
  win_rate_30d NUMERIC(5, 2),
  avg_cycle_days_30d NUMERIC(8, 2),

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, pipeline_id, day)
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_snapshots_org_day
  ON crm_pipeline_snapshots(org_id, day DESC);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_snapshots_pipeline_day
  ON crm_pipeline_snapshots(pipeline_id, day DESC);

-- ── crm_org_snapshots ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_org_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL,

  -- Sales metrics (scope=sales)
  sales_pipeline_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_open_count INTEGER NOT NULL DEFAULT 0,
  sales_won_value_30d NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_won_count_30d INTEGER NOT NULL DEFAULT 0,
  sales_win_rate_30d NUMERIC(5, 2),
  sales_avg_cycle_days_30d NUMERIC(8, 2),

  -- Carteira (CS)
  active_stores_count INTEGER NOT NULL DEFAULT 0,
  total_mrr_cents BIGINT NOT NULL DEFAULT 0,
  avg_health_score NUMERIC(5, 2),
  critical_health_count INTEGER NOT NULL DEFAULT 0,
  warning_health_count INTEGER NOT NULL DEFAULT 0,
  healthy_count INTEGER NOT NULL DEFAULT 0,

  -- NPS
  nps_score NUMERIC(5, 2),
  nps_responses_30d INTEGER NOT NULL DEFAULT 0,

  -- Inbox
  inbox_open_threads INTEGER NOT NULL DEFAULT 0,
  inbox_pending_threads INTEGER NOT NULL DEFAULT 0,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, day)
);

CREATE INDEX IF NOT EXISTS idx_crm_org_snapshots_org_day
  ON crm_org_snapshots(org_id, day DESC);

-- ── crm_lead_funnel_snapshots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_lead_funnel_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  day DATE NOT NULL,

  new_count INTEGER NOT NULL DEFAULT 0,
  qualified_count INTEGER NOT NULL DEFAULT 0,
  unqualified_count INTEGER NOT NULL DEFAULT 0,
  converted_count INTEGER NOT NULL DEFAULT 0,
  lost_count INTEGER NOT NULL DEFAULT 0,

  -- Eventos no dia (transicoes hoje)
  qualified_today INTEGER NOT NULL DEFAULT 0,
  converted_today INTEGER NOT NULL DEFAULT 0,
  created_today INTEGER NOT NULL DEFAULT 0,

  -- Por fonte (top 5 sources do dia em jsonb)
  by_source JSONB DEFAULT '{}'::jsonb,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (org_id, day)
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_funnel_snapshots_org_day
  ON crm_lead_funnel_snapshots(org_id, day DESC);

-- ── RLS permissive ────────────────────────────────────────────────
ALTER TABLE crm_pipeline_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_org_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_funnel_snapshots  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_pipeline_snapshots_authenticated" ON crm_pipeline_snapshots
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_org_snapshots_authenticated" ON crm_org_snapshots
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "crm_lead_funnel_snapshots_authenticated" ON crm_lead_funnel_snapshots
    FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
