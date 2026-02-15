-- ============================================================
-- Fix Pipeline Access
-- ============================================================
-- Problema: RLS policies de pipeline dependem de pipeline_members,
-- mas a seed só adicionou admins. Usuários sem membership não veem nada.
-- Solução: Garantir que todos os profiles existentes são membros
-- da pipeline padrão, e simplificar RLS para não bloquear.
-- ============================================================

-- ========================
-- 1. Garantir que pipeline_members existe e tem dados
-- ========================

-- Adicionar TODOS os profiles como membros da pipeline padrão
-- (não apenas admins como a migration original fazia)
INSERT INTO pipeline_members (pipeline_id, user_id, role)
SELECT p.id, pr.id,
  CASE WHEN pr.role = 'admin' THEN 'owner'::pipeline_member_role
       ELSE 'editor'::pipeline_member_role
  END
FROM pipelines p
CROSS JOIN profiles pr
WHERE p.is_default = true
ON CONFLICT (pipeline_id, user_id) DO NOTHING;

-- ========================
-- 2. Atualizar RLS de pipelines - tornar mais permissivo para authenticated users
-- ========================

-- Drop todas as policies existentes para recriar de forma limpa
DROP POLICY IF EXISTS "Users can view pipelines" ON pipelines;
DROP POLICY IF EXISTS "Users can manage pipelines" ON pipelines;
DROP POLICY IF EXISTS "Members can view their pipelines" ON pipelines;
DROP POLICY IF EXISTS "Authenticated users can create pipelines" ON pipelines;
DROP POLICY IF EXISTS "Owners can update pipelines" ON pipelines;
DROP POLICY IF EXISTS "Owners can delete pipelines" ON pipelines;

-- SELECT: membros veem suas pipelines, admins veem tudo
CREATE POLICY "pipeline_select" ON pipelines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

-- INSERT: qualquer autenticado pode criar (trigger auto_add_pipeline_owner adiciona como owner)
CREATE POLICY "pipeline_insert" ON pipelines
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: owners e admins
CREATE POLICY "pipeline_update" ON pipelines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid() AND pm.role = 'owner'
    )
    OR is_admin()
  );

-- DELETE: owners e admins
CREATE POLICY "pipeline_delete" ON pipelines
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid() AND pm.role = 'owner'
    )
    OR is_admin()
  );

-- ========================
-- 3. Atualizar RLS de pipeline_stages
-- ========================

DROP POLICY IF EXISTS "Users can view pipeline_stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Users can manage pipeline_stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Members can view stages" ON pipeline_stages;
DROP POLICY IF EXISTS "Owners can manage stages" ON pipeline_stages;

-- SELECT: membros da pipeline ou admin
CREATE POLICY "stage_select" ON pipeline_stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_stages.pipeline_id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

-- INSERT/UPDATE/DELETE: owners/editors da pipeline ou admin
CREATE POLICY "stage_manage" ON pipeline_stages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_stages.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR is_admin()
  );

-- ========================
-- 4. Atualizar RLS de deals
-- ========================

DROP POLICY IF EXISTS "Users can view deals" ON deals;
DROP POLICY IF EXISTS "Users can manage deals" ON deals;
DROP POLICY IF EXISTS "Members can view deals" ON deals;
DROP POLICY IF EXISTS "Editors can manage deals" ON deals;
DROP POLICY IF EXISTS "Editors can update deals" ON deals;
DROP POLICY IF EXISTS "Editors can delete deals" ON deals;

-- SELECT: membros da pipeline ou admin
CREATE POLICY "deal_select" ON deals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

-- INSERT: editors/owners da pipeline ou admin
CREATE POLICY "deal_insert" ON deals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR is_admin()
  );

-- UPDATE: editors/owners da pipeline ou admin
CREATE POLICY "deal_update" ON deals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR is_admin()
  );

-- DELETE: editors/owners da pipeline ou admin
CREATE POLICY "deal_delete" ON deals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
    OR is_admin()
  );

-- ========================
-- 5. Atualizar RLS de pipeline_members
-- ========================

DROP POLICY IF EXISTS "Users see members of their pipelines" ON pipeline_members;
DROP POLICY IF EXISTS "Owners can manage members" ON pipeline_members;
DROP POLICY IF EXISTS "Owners can update members" ON pipeline_members;
DROP POLICY IF EXISTS "Owners can delete members" ON pipeline_members;

-- SELECT: membros da mesma pipeline ou admin
CREATE POLICY "pm_select" ON pipeline_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

-- INSERT: owners da pipeline ou admin
CREATE POLICY "pm_insert" ON pipeline_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR is_admin()
    -- Permitir auto-insert pelo trigger (SECURITY DEFINER)
    OR auth.uid() = user_id
  );

-- UPDATE: owners ou admin
CREATE POLICY "pm_update" ON pipeline_members
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR is_admin()
  );

-- DELETE: owners ou admin
CREATE POLICY "pm_delete" ON pipeline_members
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR is_admin()
  );

-- ========================
-- 6. Garantir que trigger auto_add_pipeline_owner existe
-- ========================

CREATE OR REPLACE FUNCTION auto_add_pipeline_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO pipeline_members (pipeline_id, user_id, role, added_by)
    VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
    ON CONFLICT (pipeline_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_pipeline_created_add_owner ON pipelines;
CREATE TRIGGER on_pipeline_created_add_owner
  AFTER INSERT ON pipelines
  FOR EACH ROW EXECUTE FUNCTION auto_add_pipeline_owner();
