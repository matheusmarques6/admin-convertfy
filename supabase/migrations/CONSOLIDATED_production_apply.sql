-- ================================================================
-- CONSOLIDATED MIGRATION — Colar no Supabase SQL Editor
-- ================================================================
-- Reune ~15 migrations pendentes em um unico script idempotente.
-- Pre-requisitos: client_stores, organizations, current_org_id(),
-- can_access_store() ja devem existir.
--
-- Tabelas criadas:
--   1. cron_locks (IF NOT EXISTS)
--   2. store_revenue_summary (nova)
--   3. omnisend_campaign_metrics (nova)
--   4. omnisend_flow_metrics (nova)
--
-- Colunas adicionadas:
--   - client_stores: omnisend_api_key, email_platform, validacao
--   - klaviyo_flow_metrics: org_id, period_label, expires_at
--   - klaviyo_campaign_metrics: org_id, period_label, expires_at
--
-- Gerado em: 2026-04-22
-- ================================================================

-- ── 0. cron_locks (pode ja existir) ─────────────────────────────

CREATE TABLE IF NOT EXISTS cron_locks (
  lock_name   VARCHAR(100) PRIMARY KEY,
  is_running  BOOLEAN      NOT NULL DEFAULT FALSE,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE cron_locks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cron_locks' AND policyname = 'service_cron_locks_all'
  ) THEN
    CREATE POLICY "service_cron_locks_all" ON cron_locks
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO cron_locks (lock_name, is_running)
VALUES ('sync_reports', false)
ON CONFLICT (lock_name) DO NOTHING;

-- ── 1. store_revenue_summary (estado FINAL com todas as colunas) ─

CREATE TABLE IF NOT EXISTS store_revenue_summary (
  store_id                  UUID           NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  period_label              VARCHAR(10)    NOT NULL,
  org_id                    UUID           NOT NULL REFERENCES organizations(id),
  period_start              TIMESTAMPTZ    NOT NULL,
  period_end                TIMESTAMPTZ    NOT NULL,

  -- Klaviyo revenue
  klaviyo_total_revenue     NUMERIC(15,2)  NOT NULL DEFAULT 0,
  klaviyo_campaign_revenue  NUMERIC(15,2)  NOT NULL DEFAULT 0,
  klaviyo_flow_revenue      NUMERIC(15,2)  NOT NULL DEFAULT 0,

  -- Omnisend revenue
  omnisend_total_revenue    NUMERIC(15,2)  DEFAULT 0,
  omnisend_campaign_revenue NUMERIC(15,2)  DEFAULT 0,
  omnisend_flow_revenue     NUMERIC(15,2)  DEFAULT 0,

  -- Store totals
  store_total_revenue       NUMERIC(15,2)  NOT NULL DEFAULT 0,
  store_orders              INTEGER        NOT NULL DEFAULT 0,

  -- Audience
  total_leads               INTEGER        NOT NULL DEFAULT 0,
  engaged_leads             INTEGER        NOT NULL DEFAULT 0,
  engagement_rate           NUMERIC        NOT NULL DEFAULT 0,

  -- Observability
  currency                  VARCHAR(10)    DEFAULT 'BRL',
  sync_status               VARCHAR(20)    NOT NULL DEFAULT 'pending',
  sync_source               VARCHAR(10)    NOT NULL DEFAULT 'cron',
  sync_error                TEXT,
  expires_at                TIMESTAMPTZ    NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  fetched_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  created_at                TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT store_revenue_summary_pkey PRIMARY KEY (store_id, period_label),
  CONSTRAINT valid_period_label CHECK (
    period_label IN ('7d','15d','30d','90d','1d','12m')
    OR period_label LIKE 'custom:%'
  ),
  CONSTRAINT valid_period_range CHECK (period_end > period_start),
  CONSTRAINT klaviyo_revenue_non_negative CHECK (
    klaviyo_total_revenue >= 0 AND klaviyo_campaign_revenue >= 0 AND klaviyo_flow_revenue >= 0
  ),
  CONSTRAINT store_revenue_non_negative CHECK (store_total_revenue >= 0),
  CONSTRAINT store_revenue_summary_sync_source_check CHECK (sync_source IN ('cron','live')),
  CONSTRAINT chk_total_leads_non_negative CHECK (total_leads >= 0),
  CONSTRAINT chk_engaged_leads_non_negative CHECK (engaged_leads >= 0),
  CONSTRAINT chk_engagement_rate_range CHECK (engagement_rate >= 0 AND engagement_rate <= 100)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_revenue_summary_org_period_expires
  ON store_revenue_summary(org_id, period_label, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_summary_expires
  ON store_revenue_summary(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_summary_sync_status
  ON store_revenue_summary(sync_status)
  WHERE sync_status IN ('error','partial');

-- RLS
ALTER TABLE store_revenue_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_revenue_summary_select" ON store_revenue_summary;
CREATE POLICY "org_revenue_summary_select" ON store_revenue_summary
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "service_revenue_summary_all" ON store_revenue_summary;
CREATE POLICY "service_revenue_summary_all" ON store_revenue_summary
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_revenue_summary_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_revenue_summary_updated_at ON store_revenue_summary;
CREATE TRIGGER trg_revenue_summary_updated_at
  BEFORE UPDATE ON store_revenue_summary
  FOR EACH ROW EXECUTE FUNCTION update_revenue_summary_updated_at();

-- Cleanup function (nao deleta rows com sync_status = 'ok')
CREATE OR REPLACE FUNCTION clean_expired_revenue_summaries()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM store_revenue_summary
  WHERE expires_at < NOW() - INTERVAL '1 hour' AND sync_status != 'ok';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END; $$;

-- ── 2. omnisend_campaign_metrics ─────────────────────────────────

CREATE TABLE IF NOT EXISTS omnisend_campaign_metrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id                UUID REFERENCES organizations(id),

  campaign_id           TEXT NOT NULL,
  campaign_name         TEXT,
  campaign_status       TEXT,
  send_time             TIMESTAMPTZ,
  subject               TEXT,
  channel               TEXT DEFAULT 'email',

  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  period_label          TEXT,

  recipients            INTEGER DEFAULT 0,
  delivered             INTEGER DEFAULT 0,
  delivery_rate         NUMERIC,
  opened                INTEGER DEFAULT 0,
  open_rate             NUMERIC,
  clicked               INTEGER DEFAULT 0,
  click_rate            NUMERIC,
  click_to_open_rate    NUMERIC,
  conversions           INTEGER DEFAULT 0,
  conversion_rate       NUMERIC,
  conversion_value      DECIMAL(12,2),
  revenue_per_recipient DECIMAL(10,2),
  average_order_value   DECIMAL(10,2),
  bounced               INTEGER DEFAULT 0,
  bounce_rate           NUMERIC,
  unsubscribed          INTEGER DEFAULT 0,
  unsubscribe_rate      NUMERIC,
  spam_complaints       INTEGER DEFAULT 0,
  spam_rate             NUMERIC,

  fetched_at            TIMESTAMPTZ DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,

  UNIQUE(store_id, campaign_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_omnisend_camp_org_period
  ON omnisend_campaign_metrics(org_id, period_label);
CREATE INDEX IF NOT EXISTS idx_omnisend_camp_store
  ON omnisend_campaign_metrics(store_id, period_label);

ALTER TABLE omnisend_campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omnisend_campaigns_select_org" ON omnisend_campaign_metrics;
CREATE POLICY "omnisend_campaigns_select_org" ON omnisend_campaign_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "omnisend_campaigns_write_service" ON omnisend_campaign_metrics;
CREATE POLICY "omnisend_campaigns_write_service" ON omnisend_campaign_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. omnisend_flow_metrics ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS omnisend_flow_metrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              UUID NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  org_id                UUID REFERENCES organizations(id),

  flow_id               TEXT NOT NULL,
  flow_name             TEXT,
  flow_status           TEXT DEFAULT 'live',
  trigger_type          TEXT,

  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  period_label          TEXT,

  recipients            INTEGER DEFAULT 0,
  delivered             INTEGER DEFAULT 0,
  delivery_rate         NUMERIC,
  opened                INTEGER DEFAULT 0,
  open_rate             NUMERIC,
  clicked               INTEGER DEFAULT 0,
  click_rate            NUMERIC,
  click_to_open_rate    NUMERIC,
  conversions           INTEGER DEFAULT 0,
  conversion_rate       NUMERIC,
  conversion_value      DECIMAL(12,2),
  revenue_per_recipient DECIMAL(10,2),
  average_order_value   DECIMAL(10,2),
  bounced               INTEGER DEFAULT 0,
  bounce_rate           NUMERIC,
  unsubscribed          INTEGER DEFAULT 0,
  unsubscribe_rate      NUMERIC,
  spam_complaints       INTEGER DEFAULT 0,
  spam_rate             NUMERIC,

  fetched_at            TIMESTAMPTZ DEFAULT NOW(),
  expires_at            TIMESTAMPTZ,

  UNIQUE(store_id, flow_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_omnisend_flow_org_period
  ON omnisend_flow_metrics(org_id, period_label);
CREATE INDEX IF NOT EXISTS idx_omnisend_flow_store
  ON omnisend_flow_metrics(store_id, period_label);

ALTER TABLE omnisend_flow_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omnisend_flows_select_org" ON omnisend_flow_metrics;
CREATE POLICY "omnisend_flows_select_org" ON omnisend_flow_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

DROP POLICY IF EXISTS "omnisend_flows_write_service" ON omnisend_flow_metrics;
CREATE POLICY "omnisend_flows_write_service" ON omnisend_flow_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. client_stores — colunas Omnisend + email_platform ─────────

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS omnisend_api_key TEXT,
  ADD COLUMN IF NOT EXISTS omnisend_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS omnisend_validation_error TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_stores' AND column_name = 'email_platform'
  ) THEN
    ALTER TABLE client_stores ADD COLUMN email_platform TEXT;
    ALTER TABLE client_stores ADD CONSTRAINT chk_email_platform
      CHECK (email_platform IN ('klaviyo','omnisend','none'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_stores_email_platform
  ON client_stores(email_platform) WHERE email_platform != 'none';

-- Backfill email_platform baseado em credenciais existentes
UPDATE client_stores
SET email_platform = CASE
  WHEN omnisend_api_key IS NOT NULL AND omnisend_api_key != '' THEN 'omnisend'
  WHEN klaviyo_private_key IS NOT NULL AND klaviyo_private_key != '' THEN 'klaviyo'
  WHEN klaviyo_api_key IS NOT NULL AND klaviyo_api_key != '' THEN 'klaviyo'
  ELSE 'none'
END
WHERE email_platform IS NULL;

-- ── 5. Colunas extras em client_stores (credential validation) ───

ALTER TABLE client_stores
  ADD COLUMN IF NOT EXISTS shopify_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS shopify_validation_error TEXT,
  ADD COLUMN IF NOT EXISTS klaviyo_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS klaviyo_validation_error TEXT,
  ADD COLUMN IF NOT EXISTS klaviyo_has_reporting_access BOOLEAN,
  ADD COLUMN IF NOT EXISTS klaviyo_missing_scopes TEXT[];

-- ── 6. klaviyo_flow_metrics — colunas extras ─────────────────────

ALTER TABLE klaviyo_flow_metrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS period_label TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_klaviyo_flow_metrics_org_id
  ON klaviyo_flow_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_flow_metrics_expires
  ON klaviyo_flow_metrics(expires_at) WHERE expires_at IS NOT NULL;

-- Period label CHECK
ALTER TABLE klaviyo_flow_metrics
  DROP CONSTRAINT IF EXISTS chk_flow_metrics_period_label;
ALTER TABLE klaviyo_flow_metrics
  ADD CONSTRAINT chk_flow_metrics_period_label
  CHECK (period_label IS NULL OR period_label IN ('7d','15d','30d','90d','1d','12m') OR period_label LIKE 'custom:%');

-- RLS padronizado
DROP POLICY IF EXISTS "Users can view flow_metrics" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "Service role can manage flow_metrics" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "service_flow_metrics_all" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "org_flow_metrics_select" ON klaviyo_flow_metrics;

CREATE POLICY "service_flow_metrics_all" ON klaviyo_flow_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "org_flow_metrics_select" ON klaviyo_flow_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

-- ── 7. klaviyo_campaign_metrics — colunas extras ─────────────────

ALTER TABLE klaviyo_campaign_metrics
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS period_label TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_klaviyo_campaign_metrics_org_id
  ON klaviyo_campaign_metrics(org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_expires
  ON klaviyo_campaign_metrics(expires_at) WHERE expires_at IS NOT NULL;

-- Period label CHECK
ALTER TABLE klaviyo_campaign_metrics
  DROP CONSTRAINT IF EXISTS chk_campaign_metrics_period_label;
ALTER TABLE klaviyo_campaign_metrics
  ADD CONSTRAINT chk_campaign_metrics_period_label
  CHECK (period_label IS NULL OR period_label IN ('7d','15d','30d','90d','1d','12m') OR period_label LIKE 'custom:%');

-- RLS padronizado
DROP POLICY IF EXISTS "Users can view campaign_metrics" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "Service role can manage campaign_metrics" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "service_campaign_metrics_all" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "org_campaign_metrics_select" ON klaviyo_campaign_metrics;

CREATE POLICY "service_campaign_metrics_all" ON klaviyo_campaign_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "org_campaign_metrics_select" ON klaviyo_campaign_metrics
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() OR can_access_store(store_id));

-- ── 8. acquire_sync_lock RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION acquire_sync_lock(
  p_lock_name TEXT,
  p_stale_ms BIGINT DEFAULT 600000
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INT;
BEGIN
  UPDATE cron_locks
  SET is_running = true, started_at = now()
  WHERE lock_name = p_lock_name
    AND (is_running = false OR started_at IS NULL
         OR started_at < now() - (p_stale_ms || ' milliseconds')::interval);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END; $$;

REVOKE ALL ON FUNCTION acquire_sync_lock FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_sync_lock TO service_role;

-- acquire_cron_lock: dropar versoes anteriores antes de recriar
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT oid::regprocedure::text AS sig FROM pg_proc WHERE proname = 'acquire_cron_lock'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE'; END LOOP;
END $$;

CREATE OR REPLACE FUNCTION acquire_cron_lock(
  p_lock_name TEXT,
  p_ttl_seconds INTEGER,
  p_now TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_updated INT;
BEGIN
  INSERT INTO cron_locks (lock_name, is_running, started_at)
  VALUES (p_lock_name, true, p_now::timestamptz)
  ON CONFLICT (lock_name) DO UPDATE
  SET is_running = true, started_at = p_now::timestamptz
  WHERE cron_locks.is_running = false
    OR cron_locks.started_at IS NULL
    OR cron_locks.started_at < (p_now::timestamptz - (p_ttl_seconds || ' seconds')::interval);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END; $$;

REVOKE ALL ON FUNCTION acquire_cron_lock(TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_cron_lock(TEXT, INTEGER, TEXT) TO service_role;

-- ── 9. Widening rate columns em klaviyo tables (DECIMAL(5,2) → NUMERIC)

DO $$
DECLARE col_rec RECORD;
BEGIN
  FOR col_rec IN
    SELECT column_name, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('klaviyo_flow_metrics', 'klaviyo_campaign_metrics')
      AND column_name IN ('delivery_rate','open_rate','click_rate','click_to_open_rate',
                          'conversion_rate','bounce_rate','unsubscribe_rate','spam_rate')
      AND data_type = 'numeric' AND numeric_precision IS NOT NULL
  LOOP
    EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE NUMERIC', col_rec.table_name, col_rec.column_name);
  END LOOP;
END $$;

-- ── FIM ──────────────────────────────────────────────────────────
-- Apos rodar, verificar:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--   AND table_name IN ('store_revenue_summary','omnisend_campaign_metrics','omnisend_flow_metrics','cron_locks');
