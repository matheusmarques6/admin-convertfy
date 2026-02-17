-- ============================================================================
-- SCRIPT CORRETIVO: Correções Críticas no Banco de Dados
-- Data: 2026-02-16
-- Executar no Supabase Dashboard > SQL Editor
--
-- Correções:
--   1. FK references stores → client_stores (7 tabelas advanced_reporting)
--   2. Views com JOIN stores → client_stores (4 views)
--   3. RLS policies advanced_reporting com stores → client_stores (14 policies)
--   4. RLS USING(true) em campaigns → can_access_store / can_manage_store_campaigns
--   5. RLS USING(true) em campaign_history → via campaigns.store_id
-- ============================================================================

BEGIN;

-- ============================================================================
-- PARTE 1: Corrigir FK constraints (stores → client_stores)
-- As constraints foram criadas inline, então têm nomes auto-gerados.
-- Vamos dropar por nome da tabela referenciada e recriar apontando para client_stores.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  -- Encontra todas as FK constraints que referenciam a tabela 'stores' (que não existe mais)
  -- nas tabelas de advanced_reporting
  FOR r IN
    SELECT
      tc.table_name,
      tc.constraint_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
      AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'stores'
      AND tc.table_name IN (
        'product_costs',
        'store_cost_settings',
        'order_attribution',
        'klaviyo_flow_metrics',
        'klaviyo_campaign_metrics',
        'store_top_customers',
        'attribution_summary'
      )
  LOOP
    RAISE NOTICE 'Corrigindo FK: %.% (constraint: %)', r.table_name, r.column_name, r.constraint_name;

    -- Drop a FK antiga
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);

    -- Recria apontando para client_stores
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES client_stores(id) ON DELETE CASCADE',
      r.table_name,
      r.table_name || '_store_id_fkey',
      r.column_name
    );
  END LOOP;

  -- Se nenhuma FK foi encontrada referenciando 'stores', pode ser que as tabelas
  -- já tenham sido criadas com client_stores ou que as tabelas não existam ainda
  IF NOT FOUND THEN
    RAISE NOTICE 'Nenhuma FK referenciando stores encontrada - tabelas podem não existir ou já estão corretas';
  END IF;
END $$;

-- ============================================================================
-- PARTE 2: Recriar Views com JOIN correto (client_stores em vez de stores)
-- ============================================================================

-- View: Flows ordenados por revenue
CREATE OR REPLACE VIEW v_flows_by_revenue AS
SELECT
  fm.*,
  s.name as store_name,
  c.name as client_name
FROM klaviyo_flow_metrics fm
JOIN client_stores s ON fm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY fm.conversion_value DESC;

-- View: Campanhas ordenadas por revenue
CREATE OR REPLACE VIEW v_campaigns_by_revenue AS
SELECT
  cm.*,
  s.name as store_name,
  c.name as client_name
FROM klaviyo_campaign_metrics cm
JOIN client_stores s ON cm.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY cm.conversion_value DESC;

-- View: Top customers com atribuição Klaviyo
CREATE OR REPLACE VIEW v_top_customers_klaviyo AS
SELECT
  tc.*,
  s.name as store_name,
  c.name as client_name
FROM store_top_customers tc
JOIN client_stores s ON tc.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
WHERE tc.klaviyo_attributed_revenue > 0
ORDER BY tc.klaviyo_attributed_revenue DESC;

-- View: Resumo de atribuição por fonte
CREATE OR REPLACE VIEW v_attribution_by_source AS
SELECT
  a.*,
  s.name as store_name,
  c.name as client_name
FROM attribution_summary a
JOIN client_stores s ON a.store_id = s.id
LEFT JOIN clients c ON s.client_id = c.id
ORDER BY a.total_revenue DESC;

-- ============================================================================
-- PARTE 3: Recriar RLS policies de advanced_reporting (stores → client_stores)
-- ============================================================================

-- ----- product_costs -----
DROP POLICY IF EXISTS "product_costs_select" ON product_costs;
DROP POLICY IF EXISTS "product_costs_insert" ON product_costs;
DROP POLICY IF EXISTS "product_costs_update" ON product_costs;
DROP POLICY IF EXISTS "product_costs_delete" ON product_costs;

CREATE POLICY "product_costs_select" ON product_costs
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "product_costs_insert" ON product_costs
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "product_costs_update" ON product_costs
  FOR UPDATE USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "product_costs_delete" ON product_costs
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- ----- store_cost_settings -----
DROP POLICY IF EXISTS "store_cost_settings_select" ON store_cost_settings;
DROP POLICY IF EXISTS "store_cost_settings_all" ON store_cost_settings;

CREATE POLICY "store_cost_settings_select" ON store_cost_settings
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "store_cost_settings_all" ON store_cost_settings
  FOR ALL USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- ----- order_attribution -----
DROP POLICY IF EXISTS "order_attribution_select" ON order_attribution;
DROP POLICY IF EXISTS "order_attribution_all" ON order_attribution;

CREATE POLICY "order_attribution_select" ON order_attribution
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "order_attribution_all" ON order_attribution
  FOR ALL USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- ----- klaviyo_flow_metrics -----
DROP POLICY IF EXISTS "flow_metrics_select" ON klaviyo_flow_metrics;
DROP POLICY IF EXISTS "flow_metrics_all" ON klaviyo_flow_metrics;

CREATE POLICY "flow_metrics_select" ON klaviyo_flow_metrics
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "flow_metrics_all" ON klaviyo_flow_metrics
  FOR ALL USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- ----- klaviyo_campaign_metrics -----
DROP POLICY IF EXISTS "campaign_metrics_select" ON klaviyo_campaign_metrics;
DROP POLICY IF EXISTS "campaign_metrics_all" ON klaviyo_campaign_metrics;

CREATE POLICY "campaign_metrics_select" ON klaviyo_campaign_metrics
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "campaign_metrics_all" ON klaviyo_campaign_metrics
  FOR ALL USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- ----- store_top_customers -----
DROP POLICY IF EXISTS "top_customers_select" ON store_top_customers;
DROP POLICY IF EXISTS "top_customers_all" ON store_top_customers;

CREATE POLICY "top_customers_select" ON store_top_customers
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "top_customers_all" ON store_top_customers
  FOR ALL USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- ----- attribution_summary -----
DROP POLICY IF EXISTS "attribution_summary_select" ON attribution_summary;
DROP POLICY IF EXISTS "attribution_summary_all" ON attribution_summary;

CREATE POLICY "attribution_summary_select" ON attribution_summary
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "attribution_summary_all" ON attribution_summary
  FOR ALL USING (
    store_id IN (
      SELECT id FROM client_stores WHERE client_id IN (
        SELECT client_id FROM agent_store_access WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PARTE 4: Corrigir RLS USING(true) em campaigns
-- Substituir policies permissivas por controle baseado em store_id
-- ============================================================================

-- Drop todas as policies antigas de campaigns
DROP POLICY IF EXISTS "Users can view all campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can create campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can update campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can delete campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can view campaigns for accessible stores" ON campaigns;
DROP POLICY IF EXISTS "Users can create campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Users can update campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Users can delete campaigns for managed stores" ON campaigns;
DROP POLICY IF EXISTS "Users can view campaigns" ON campaigns;
DROP POLICY IF EXISTS "Users can manage campaigns" ON campaigns;

-- Recriar com controle granular por store
CREATE POLICY "Users can view campaigns for accessible stores"
  ON campaigns FOR SELECT TO authenticated
  USING (can_access_store(store_id));

CREATE POLICY "Users can create campaigns for managed stores"
  ON campaigns FOR INSERT TO authenticated
  WITH CHECK (can_manage_store_campaigns(store_id));

CREATE POLICY "Users can update campaigns for managed stores"
  ON campaigns FOR UPDATE TO authenticated
  USING (can_manage_store_campaigns(store_id))
  WITH CHECK (can_manage_store_campaigns(store_id));

CREATE POLICY "Users can delete campaigns for managed stores"
  ON campaigns FOR DELETE TO authenticated
  USING (can_manage_store_campaigns(store_id));

-- ============================================================================
-- PARTE 5: Corrigir RLS USING(true) em campaign_history
-- ============================================================================

DROP POLICY IF EXISTS "Users can view campaign history" ON campaign_history;
DROP POLICY IF EXISTS "Users can create campaign history" ON campaign_history;
DROP POLICY IF EXISTS "Users can view campaign history for accessible stores" ON campaign_history;
DROP POLICY IF EXISTS "Campaign managers can create history" ON campaign_history;

CREATE POLICY "Users can view campaign history for accessible stores"
  ON campaign_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_access_store(c.store_id)
    )
  );

CREATE POLICY "Campaign managers can create history"
  ON campaign_history FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns c
      WHERE c.id = campaign_history.campaign_id
      AND can_manage_store_campaigns(c.store_id)
    )
  );

-- ============================================================================
-- VERIFICAÇÃO FINAL
-- ============================================================================

-- Listar todas as policies que ainda têm USING(true) para authenticated (não service_role)
DO $$
DECLARE
  r RECORD;
  count_issues INT := 0;
BEGIN
  FOR r IN
    SELECT
      schemaname,
      tablename,
      policyname,
      roles,
      qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual = 'true'
      AND NOT (roles @> ARRAY['service_role'])
      AND roles @> ARRAY['authenticated']
  LOOP
    RAISE NOTICE 'ATENÇÃO - Policy com USING(true) para authenticated: %.% → %',
      r.tablename, r.policyname, r.roles;
    count_issues := count_issues + 1;
  END LOOP;

  IF count_issues = 0 THEN
    RAISE NOTICE '✓ Nenhuma policy USING(true) para authenticated encontrada!';
  ELSE
    RAISE NOTICE '⚠ % policies com USING(true) para authenticated ainda existem', count_issues;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- FIM DO SCRIPT CORRETIVO
-- Se todas as mensagens NOTICE mostrarem ✓, as correções foram aplicadas.
-- ============================================================================
