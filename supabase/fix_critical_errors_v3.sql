-- ============================================================================
-- SCRIPT CORRETIVO v3: Fix RLS USING(true) em campaigns
-- Data: 2026-02-16
-- Executar no Supabase Dashboard > SQL Editor
-- ============================================================================

BEGIN;

-- ============================================================================
-- Corrigir RLS USING(true) em campaigns
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
-- VERIFICAÇÃO
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  count_issues INT := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND qual = 'true'
      AND NOT (roles::text[] @> ARRAY['service_role']::text[])
      AND roles::text[] @> ARRAY['authenticated']::text[]
  LOOP
    RAISE NOTICE 'USING(true) restante: % -> %', r.tablename, r.policyname;
    count_issues := count_issues + 1;
  END LOOP;

  IF count_issues = 0 THEN
    RAISE NOTICE 'OK - Nenhuma policy USING(true) para authenticated';
  ELSE
    RAISE NOTICE '% policies com USING(true) restantes', count_issues;
  END IF;
END $$;

COMMIT;
