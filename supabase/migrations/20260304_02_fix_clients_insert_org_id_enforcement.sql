-- =============================================
-- FIX: clients INSERT policy - enforce org_id
-- =============================================
-- Concern 2 do QA: a policy de INSERT em clients verificava apenas se o
-- caller é owner/admin, mas não restringia qual org_id a linha nova carregava.
-- Um owner mal-intencionado poderia inserir um cliente com org_id de outra org.
--
-- Fix: WITH CHECK agora valida que org_id da nova linha = current_org_id()
-- (ou NULL para o admin que não precisa de org). Admin bypass mantido.
-- =============================================

DROP POLICY IF EXISTS "Admin can manage clients" ON clients;
CREATE POLICY "Admin can manage clients"
  ON clients FOR INSERT TO authenticated
  WITH CHECK (
    -- Caller must have permission to create clients
    (is_admin() OR is_org_owner(current_org_id()) OR has_feature('create_clients'))
    AND
    -- The new row's org_id must belong to the caller's org (or be null for admin)
    (org_id IS NULL OR org_id = current_org_id() OR is_admin())
  );
