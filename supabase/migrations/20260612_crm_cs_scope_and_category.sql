-- ============================================================
-- CS extensions for crm_leads + crm_forms
-- ============================================================
-- Adiciona scope (sales|cs) e category (NULL pra sales; pra cs:
-- health_alert | renewal_opportunity | feedback_followup) em
-- crm_leads, mais um store_id opcional pra linkar um lead CS a uma
-- loja existente.
--
-- Adiciona scope (sales|cs|either) em crm_forms pra permitir filtrar
-- formularios por area. Forms 'either' aparecem nas duas listagens
-- (uso: forms de feedback genericos).

-- ── crm_leads ──────────────────────────────────────────────────

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'sales'
    CHECK (scope IN ('sales', 'cs'));

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS category TEXT
    CHECK (
      category IS NULL OR category IN (
        'health_alert',
        'renewal_opportunity',
        'feedback_followup',
        'churn_recovery'
      )
    );

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS store_id UUID
    REFERENCES client_stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_scope
  ON crm_leads(scope);
CREATE INDEX IF NOT EXISTS idx_crm_leads_scope_category
  ON crm_leads(scope, category) WHERE scope = 'cs';
CREATE INDEX IF NOT EXISTS idx_crm_leads_store
  ON crm_leads(store_id) WHERE store_id IS NOT NULL;

COMMENT ON COLUMN crm_leads.scope IS
  'sales: lead de aquisicao (default). cs: lead de pos-venda (health alert, renewal, feedback followup).';
COMMENT ON COLUMN crm_leads.category IS
  'Sub-tipo do lead CS. NULL para sales. Pra cs: health_alert | renewal_opportunity | feedback_followup | churn_recovery.';
COMMENT ON COLUMN crm_leads.store_id IS
  'Loja associada (so faz sentido em scope=cs, onde o lead descreve um problema de uma loja existente).';

-- ── crm_forms ──────────────────────────────────────────────────

ALTER TABLE crm_forms
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'sales'
    CHECK (scope IN ('sales', 'cs', 'either'));

CREATE INDEX IF NOT EXISTS idx_crm_forms_scope
  ON crm_forms(scope);

COMMENT ON COLUMN crm_forms.scope IS
  'Area onde o form aparece: sales (default — aquisicao), cs (pos-venda: NPS, health check, feedback), either (aparece nas duas listagens).';
