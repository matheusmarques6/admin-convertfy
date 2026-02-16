-- ============================================================
-- PIPELINE FILE 09: FIX PIPELINE ACCESS
-- ============================================================
-- Inserts: All profiles as pipeline members
-- Recreates: All pipeline, pipeline_stages, deals, pipeline_members RLS policies
-- Creates: auto_add_pipeline_owner() function and trigger
-- ============================================================

BEGIN;

-- ========================
-- 1. Garantir que pipeline_members tem dados
-- ========================

-- Adicionar TODOS os profiles como membros da pipeline padrao
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
-- 2. Atualizar RLS de pipelines
-- ========================

DROP POLICY IF EXISTS "Users can view pipelines" ON pipelines;
DROP POLICY IF EXISTS "Users can manage pipelines" ON pipelines;
DROP POLICY IF EXISTS "Members can view their pipelines" ON pipelines;
DROP POLICY IF EXISTS "Authenticated users can create pipelines" ON pipelines;
DROP POLICY IF EXISTS "Owners can update pipelines" ON pipelines;
DROP POLICY IF EXISTS "Owners can delete pipelines" ON pipelines;
DROP POLICY IF EXISTS "pipeline_select" ON pipelines;
DROP POLICY IF EXISTS "pipeline_insert" ON pipelines;
DROP POLICY IF EXISTS "pipeline_update" ON pipelines;
DROP POLICY IF EXISTS "pipeline_delete" ON pipelines;

CREATE POLICY "pipeline_select" ON pipelines
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY "pipeline_insert" ON pipelines
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "pipeline_update" ON pipelines
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = id AND pm.user_id = auth.uid() AND pm.role = 'owner'
    )
    OR is_admin()
  );

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
DROP POLICY IF EXISTS "stage_select" ON pipeline_stages;
DROP POLICY IF EXISTS "stage_manage" ON pipeline_stages;

CREATE POLICY "stage_select" ON pipeline_stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_stages.pipeline_id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

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
DROP POLICY IF EXISTS "deal_select" ON deals;
DROP POLICY IF EXISTS "deal_insert" ON deals;
DROP POLICY IF EXISTS "deal_update" ON deals;
DROP POLICY IF EXISTS "deal_delete" ON deals;

CREATE POLICY "deal_select" ON deals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = deals.pipeline_id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

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
DROP POLICY IF EXISTS "pm_select" ON pipeline_members;
DROP POLICY IF EXISTS "pm_insert" ON pipeline_members;
DROP POLICY IF EXISTS "pm_update" ON pipeline_members;
DROP POLICY IF EXISTS "pm_delete" ON pipeline_members;

CREATE POLICY "pm_select" ON pipeline_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id AND pm.user_id = auth.uid()
    )
    OR is_admin()
  );

CREATE POLICY "pm_insert" ON pipeline_members
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipeline_members pm
      WHERE pm.pipeline_id = pipeline_members.pipeline_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
    OR is_admin()
    OR auth.uid() = user_id
  );

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

COMMIT;

-- ============================================================
-- 09_fix_pipeline_access.sql DONE
-- ============================================================
