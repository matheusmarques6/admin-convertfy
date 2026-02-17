-- ============================================================================
-- SCRIPT CORRETIVO v2: Correções de RLS no Banco de Dados
-- Data: 2026-02-16
-- Executar no Supabase Dashboard > SQL Editor
--
-- Correções:
--   1. RLS USING(true) em campaigns → can_access_store / can_manage_store_campaigns
--   2. RLS USING(true) em campaign_history → via campaigns.store_id
--   3. Verificação final de policies residuais
--
-- NOTA: As tabelas de advanced_reporting (product_costs, klaviyo_flow_metrics, etc.)
--       ainda não existem no banco. A migration local já foi corrigida para quando
--       forem criadas, usarem client_stores corretamente.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PARTE 1: Corrigir RLS USING(true) em campaigns
-- ============================================================================

-- Drop todas as policies antigas
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
-- PARTE 2: Corrigir RLS USING(true) em campaign_history
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
-- VERIFICAÇÃO: Listar policies USING(true) restantes para authenticated
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  count_issues INT := 0;
BEGIN
  FOR r IN
    SELECT
      tablename,
      policyname,
      roles
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual = 'true'
      AND NOT (roles @> ARRAY['service_role'])
      AND roles @> ARRAY['authenticated']
  LOOP
    RAISE NOTICE 'ATENÇÃO - USING(true) para authenticated: % → %', r.tablename, r.policyname;
    count_issues := count_issues + 1;
  END LOOP;

  IF count_issues = 0 THEN
    RAISE NOTICE 'OK - Nenhuma policy USING(true) para authenticated encontrada';
  ELSE
    RAISE NOTICE '% policies com USING(true) para authenticated ainda existem', count_issues;
  END IF;
END $$;

COMMIT;
