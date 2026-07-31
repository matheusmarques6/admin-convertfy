-- ═══════════════════════════════════════════════════════════════
-- Metas comerciais
--
-- "Batemos a meta?" é a pergunta nº 1 de qualquer gestor comercial e
-- o admin não tinha onde guardar a resposta. Sem meta não existe
-- atingimento, ritmo necessário nem projeção — só valor absoluto, que
-- não diz se está bom ou ruim.
--
-- Escopo: meta do time (owner_id NULL) ou de uma pessoa. Pipeline NULL
-- = soma todos os pipelines de vendas.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_sales_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- revenue_won = R$ ganho no período; deals_won = quantidade fechada
  goal_type TEXT NOT NULL DEFAULT 'revenue_won'
    CHECK (goal_type IN ('revenue_won', 'deals_won')),
  period_type TEXT NOT NULL DEFAULT 'month'
    CHECK (period_type IN ('month', 'quarter', 'year')),
  -- Sempre o primeiro dia do período (mês/trimestre/ano)
  period_start DATE NOT NULL,
  target_value NUMERIC(14,2) NOT NULL CHECK (target_value > 0),
  -- NULL = meta do time inteiro
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  -- NULL = todos os pipelines de vendas
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE CASCADE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma meta por combinação. COALESCE porque UNIQUE ignora NULL — sem
-- isso daria pra cadastrar duas metas de time para o mesmo mês.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_sales_goals_unique
  ON crm_sales_goals (
    org_id,
    goal_type,
    period_type,
    period_start,
    COALESCE(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(pipeline_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_crm_sales_goals_period
  ON crm_sales_goals(org_id, period_start DESC);

DROP TRIGGER IF EXISTS trg_crm_sales_goals_updated_at ON crm_sales_goals;
CREATE TRIGGER trg_crm_sales_goals_updated_at BEFORE UPDATE ON crm_sales_goals
  FOR EACH ROW EXECUTE FUNCTION crm_set_updated_at();

ALTER TABLE crm_sales_goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "crm_sales_goals_all" ON crm_sales_goals
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE crm_sales_goals IS
  'Metas comerciais por período. owner_id NULL = meta do time; pipeline_id NULL = todos os pipelines de vendas.';
