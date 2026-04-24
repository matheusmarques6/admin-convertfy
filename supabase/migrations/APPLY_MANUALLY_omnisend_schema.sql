-- =====================================================================
-- APLICAR MANUALMENTE no Supabase SQL Editor caso a migration
-- 20260417_omnisend_metrics_tables.sql nao tenha rodado em producao.
--
-- Evidencia nos logs do Vercel (Azzurro Milano, abr/2026):
--   error: "Could not find the 'omnisend_campaign_revenue' column of
--          'store_revenue_summary' in the schema cache"
--   error: "Could not find the table 'public.omnisend_campaign_metrics'"
--   error: "Could not find the table 'public.omnisend_flow_metrics'"
--   warn:  "[detectStorePlatform] email_platform column missing"
--
-- Copie o bloco inteiro abaixo e execute no SQL Editor do projeto
-- admin-convertfy. Todas as operacoes sao idempotentes (IF NOT EXISTS).
-- =====================================================================

SET search_path = public, extensions;

-- ── 1. Colunas omnisend_* em store_revenue_summary ───────────────────────
ALTER TABLE public.store_revenue_summary
  ADD COLUMN IF NOT EXISTS omnisend_total_revenue    NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omnisend_campaign_revenue NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omnisend_flow_revenue     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS omnisend_total_orders     INTEGER       NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.store_revenue_summary.omnisend_total_revenue IS
  'Receita atribuida ao Omnisend (attributedRevenue da Statistics API).';
COMMENT ON COLUMN public.store_revenue_summary.omnisend_total_orders IS
  'Pedidos atribuidos ao Omnisend (attributedOrders da Statistics API).';

-- ── 2. Tabela omnisend_campaign_metrics ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.omnisend_campaign_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.client_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),

  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  campaign_status TEXT,
  send_time TIMESTAMPTZ,
  subject TEXT,
  channel TEXT DEFAULT 'email',

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_label TEXT,

  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2),

  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2),
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2),
  click_to_open_rate DECIMAL(5,2),

  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2),
  conversion_value DECIMAL(12,2),
  revenue_per_recipient DECIMAL(10,2),
  average_order_value DECIMAL(10,2),

  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2),
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2),
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2),

  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(store_id, campaign_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_omnisend_camp_org_period
  ON public.omnisend_campaign_metrics(org_id, period_label);
CREATE INDEX IF NOT EXISTS idx_omnisend_camp_store
  ON public.omnisend_campaign_metrics(store_id, period_label);

ALTER TABLE public.omnisend_campaign_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omnisend_campaigns_select_org" ON public.omnisend_campaign_metrics;
CREATE POLICY "omnisend_campaigns_select_org" ON public.omnisend_campaign_metrics
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_store(store_id)
  );

DROP POLICY IF EXISTS "omnisend_campaigns_write_service" ON public.omnisend_campaign_metrics;
CREATE POLICY "omnisend_campaigns_write_service" ON public.omnisend_campaign_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. Tabela omnisend_flow_metrics ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.omnisend_flow_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.client_stores(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),

  flow_id TEXT NOT NULL,
  flow_name TEXT,
  flow_status TEXT DEFAULT 'live',
  trigger_type TEXT,

  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_label TEXT,

  recipients INTEGER DEFAULT 0,
  delivered INTEGER DEFAULT 0,
  delivery_rate DECIMAL(5,2),

  opened INTEGER DEFAULT 0,
  open_rate DECIMAL(5,2),
  clicked INTEGER DEFAULT 0,
  click_rate DECIMAL(5,2),
  click_to_open_rate DECIMAL(5,2),

  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2),
  conversion_value DECIMAL(12,2),
  revenue_per_recipient DECIMAL(10,2),
  average_order_value DECIMAL(10,2),

  bounced INTEGER DEFAULT 0,
  bounce_rate DECIMAL(5,2),
  unsubscribed INTEGER DEFAULT 0,
  unsubscribe_rate DECIMAL(5,2),
  spam_complaints INTEGER DEFAULT 0,
  spam_rate DECIMAL(5,2),

  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(store_id, flow_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_omnisend_flow_org_period
  ON public.omnisend_flow_metrics(org_id, period_label);
CREATE INDEX IF NOT EXISTS idx_omnisend_flow_store
  ON public.omnisend_flow_metrics(store_id, period_label);

ALTER TABLE public.omnisend_flow_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omnisend_flows_select_org" ON public.omnisend_flow_metrics;
CREATE POLICY "omnisend_flows_select_org" ON public.omnisend_flow_metrics
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_store(store_id)
  );

DROP POLICY IF EXISTS "omnisend_flows_write_service" ON public.omnisend_flow_metrics;
CREATE POLICY "omnisend_flows_write_service" ON public.omnisend_flow_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. Colunas de credencial/plataforma em client_stores ────────────────
ALTER TABLE public.client_stores
  ADD COLUMN IF NOT EXISTS omnisend_api_key TEXT,
  ADD COLUMN IF NOT EXISTS omnisend_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS omnisend_validation_error TEXT,
  ADD COLUMN IF NOT EXISTS omnisend_has_reporting_access BOOLEAN;

ALTER TABLE public.client_stores
  ADD COLUMN IF NOT EXISTS email_platform TEXT
    CHECK (email_platform IN ('klaviyo', 'omnisend', 'none'));

COMMENT ON COLUMN public.client_stores.email_platform IS
  'Plataforma de email marketing usada: klaviyo | omnisend | none.';

-- Backfill baseado nas credenciais existentes
UPDATE public.client_stores
SET email_platform = CASE
  WHEN omnisend_api_key IS NOT NULL AND omnisend_api_key != '' THEN 'omnisend'
  WHEN klaviyo_private_key IS NOT NULL AND klaviyo_private_key != '' THEN 'klaviyo'
  WHEN klaviyo_api_key IS NOT NULL AND klaviyo_api_key != '' THEN 'klaviyo'
  ELSE 'none'
END
WHERE email_platform IS NULL;

CREATE INDEX IF NOT EXISTS idx_client_stores_email_platform
  ON public.client_stores(email_platform) WHERE email_platform != 'none';

-- ── 5. Forcar Supabase a recarregar o schema cache ──────────────────────
-- Sem isso, o PostgREST pode continuar devolvendo "Could not find ..."
-- por alguns minutos apos a migration.
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- Verificacao: as 4 queries abaixo devem todas retornar linha(s).
-- =====================================================================
-- 1) Colunas novas em store_revenue_summary
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'store_revenue_summary'
--    AND column_name LIKE 'omnisend%';
--
-- 2) Tabela omnisend_campaign_metrics
-- SELECT COUNT(*) FROM public.omnisend_campaign_metrics;
--
-- 3) Tabela omnisend_flow_metrics
-- SELECT COUNT(*) FROM public.omnisend_flow_metrics;
--
-- 4) Coluna email_platform em client_stores
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'client_stores'
--    AND column_name  = 'email_platform';
