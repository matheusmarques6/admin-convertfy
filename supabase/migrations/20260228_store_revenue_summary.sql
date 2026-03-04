-- =============================================
-- Tabela store_revenue_summary
-- =============================================
-- Cache de receita agregada por loja e período.
-- Atualizado pelo sync job (cron). Fonte única para dashboard revenue.
-- PRD: Seção 3.2 — Opção B (tabela dedicada)

CREATE TABLE IF NOT EXISTS store_revenue_summary (
  -- Chave primária composta — suporta UPSERT direto
  store_id       UUID         NOT NULL REFERENCES client_stores(id) ON DELETE CASCADE,
  period_label   VARCHAR(10)  NOT NULL,

  -- Isolamento multi-tenant — NOT NULL obrigatório
  org_id         UUID         NOT NULL REFERENCES organizations(id),

  -- Intervalo real que o período representa (para debug e reconciliação)
  period_start   TIMESTAMPTZ  NOT NULL,
  period_end     TIMESTAMPTZ  NOT NULL,

  -- Revenue Klaviyo (decomposto por canal)
  klaviyo_total_revenue     NUMERIC(15, 2) NOT NULL DEFAULT 0,
  klaviyo_campaign_revenue  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  klaviyo_flow_revenue      NUMERIC(15, 2) NOT NULL DEFAULT 0,

  -- Store revenue from Klaviyo metric-aggregates (Placed Order)
  store_total_revenue       NUMERIC(15, 2) NOT NULL DEFAULT 0,

  -- Controle de qualidade do sync
  sync_status    VARCHAR(20)  NOT NULL DEFAULT 'pending'
                              CHECK (sync_status IN ('ok', 'partial', 'error', 'pending')),
  sync_error     TEXT,

  -- TTL explícito para invalidação
  expires_at     TIMESTAMPTZ  NOT NULL,

  -- Timestamps
  fetched_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Constraints de validação
  CONSTRAINT valid_period_label CHECK (
    period_label IN ('7d', '15d', '30d', '90d')
  ),
  CONSTRAINT valid_period_range CHECK (period_end > period_start),
  CONSTRAINT klaviyo_revenue_non_negative CHECK (
    klaviyo_total_revenue >= 0
    AND klaviyo_campaign_revenue >= 0
    AND klaviyo_flow_revenue >= 0
  ),
  CONSTRAINT store_revenue_non_negative CHECK (
    store_total_revenue >= 0
  ),

  PRIMARY KEY (store_id, period_label)
);

-- Índice para RLS e queries de overview por org
CREATE INDEX IF NOT EXISTS idx_revenue_summary_org
  ON store_revenue_summary(org_id, period_label);

-- Índice para cleanup job (parcial, mantém tamanho pequeno)
CREATE INDEX IF NOT EXISTS idx_revenue_summary_expires
  ON store_revenue_summary(expires_at)
  WHERE expires_at IS NOT NULL;

-- Índice para health check de sync
CREATE INDEX IF NOT EXISTS idx_revenue_summary_sync_status
  ON store_revenue_summary(sync_status)
  WHERE sync_status IN ('error', 'partial');

-- RLS
ALTER TABLE store_revenue_summary ENABLE ROW LEVEL SECURITY;

-- Leitura: org member com acesso à loja
CREATE POLICY "org_revenue_summary_select" ON store_revenue_summary
  FOR SELECT TO authenticated
  USING (
    org_id = current_org_id()
    OR can_access_store(store_id)
  );

-- Escrita: apenas service_role (sync jobs)
CREATE POLICY "service_revenue_summary_all" ON store_revenue_summary
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Cleanup function
CREATE OR REPLACE FUNCTION clean_expired_revenue_summaries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM store_revenue_summary
  WHERE expires_at < NOW() - INTERVAL '1 hour';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON TABLE store_revenue_summary IS
  'Cache de receita agregada por loja e período. Atualizado pelo sync job. '
  'Fonte única para dashboard de overview e comparativos de revenue.';
