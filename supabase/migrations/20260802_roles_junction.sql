-- =============================================
-- ROLES SIMPLIFICATION (Minimal) — PARTE 2/2: junction + backfill + RLS
-- =============================================
-- Pre-requisito: 20260801 (ADD VALUE dos novos roles) ja aplicado e
-- COMMITADO. Rode este arquivo numa execucao SEPARADA do 20260801.
--
-- O que faz:
--   1. Cria a junction org_member_roles (fonte de verdade do gating).
--   2. Backfill a partir do org_members.role legado (mapa -> 6 canonicos).
--   3. Habilita RLS + GRANT na junction. ISSO E' CRITICO: sem policy/grant
--      para `authenticated`, o embed do PostgREST
--      `org_members?select=...,org_member_roles(role)` falha com permission
--      denied e a tela "Equipe" volta VAZIA.
--   4. Torna o trigger assign_default_features um noop (features deprecadas).

-- ---------------------------------------------
-- 1. Junction multi-funcao
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS org_member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id UUID REFERENCES org_members(id) ON DELETE CASCADE NOT NULL,
  role org_role NOT NULL,
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_member_id, role)
);

CREATE INDEX IF NOT EXISTS idx_org_member_roles_member ON org_member_roles(org_member_id);
CREATE INDEX IF NOT EXISTS idx_org_member_roles_role ON org_member_roles(role);

COMMENT ON TABLE org_member_roles IS
  'Funcoes ativas de um org_member. Acesso = UNIAO. Fonte de verdade do gating.';

-- ---------------------------------------------
-- 2. Backfill (espelha o mapa de toCanonicalRole no app)
--      owner             -> admin
--      coo               -> coo
--      developer         -> implementacao
--      designer          -> designer
--      support           -> suporte
--      manager/coordinator/copywriter/analyst/... -> suporte (ajustar via UI)
-- ---------------------------------------------
INSERT INTO org_member_roles (org_member_id, role)
SELECT
  om.id,
  (CASE om.role::text
    WHEN 'owner'      THEN 'admin'
    WHEN 'coo'        THEN 'coo'
    WHEN 'developer'  THEN 'implementacao'
    WHEN 'designer'   THEN 'designer'
    WHEN 'support'    THEN 'suporte'
    WHEN 'admin'      THEN 'admin'
    WHEN 'dev'        THEN 'dev'
    WHEN 'suporte'    THEN 'suporte'
    WHEN 'implementacao' THEN 'implementacao'
    ELSE 'suporte'
  END)::org_role
FROM org_members om
WHERE om.is_active = true
ON CONFLICT (org_member_id, role) DO NOTHING;

-- ---------------------------------------------
-- 3. RLS + GRANT (mesma forma das demais tabelas — ver 20250125_06)
-- ---------------------------------------------
ALTER TABLE org_member_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View org member roles" ON org_member_roles;
CREATE POLICY "View org member roles"
  ON org_member_roles FOR SELECT TO authenticated
  USING (
    is_admin()
    OR org_member_id IN (
      SELECT id FROM org_members WHERE org_id = current_org_id()
    )
  );

DROP POLICY IF EXISTS "Manage org member roles" ON org_member_roles;
CREATE POLICY "Manage org member roles"
  ON org_member_roles FOR ALL TO authenticated
  USING (is_admin() OR is_org_owner())
  WITH CHECK (is_admin() OR is_org_owner());

DROP POLICY IF EXISTS "Service role full access org_member_roles" ON org_member_roles;
CREATE POLICY "Service role full access org_member_roles"
  ON org_member_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_member_roles TO authenticated;
GRANT ALL ON org_member_roles TO service_role;

-- ---------------------------------------------
-- 4. Trigger assign_default_features vira noop
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION assign_default_features()
RETURNS TRIGGER AS $$
BEGIN
  -- noop: features deprecadas em favor de org_member_roles
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION assign_default_features() IS
  'NOOP desde 20260801. Sistema de features deprecado em favor de org_member_roles.';

-- ---------------------------------------------
-- 5. Verificacao (rode manualmente apos aplicar)
-- ---------------------------------------------
-- SELECT COUNT(*) FROM org_members om
-- WHERE om.is_active
--   AND NOT EXISTS (SELECT 1 FROM org_member_roles r WHERE r.org_member_id = om.id);
-- -- esperado: 0
