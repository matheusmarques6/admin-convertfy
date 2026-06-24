-- =============================================
-- ROLES SIMPLIFICATION
-- =============================================
-- Reduz ENUM org_role aos 6 valores canonicos (admin, dev, coo, suporte,
-- designer, implementacao) e introduz multi-funcao via tabela junction
-- org_member_roles. Tabelas features_catalog / org_member_features ficam
-- INERTES (preservadas 1 release para janela de rollback; serao removidas
-- em release seguinte). Trigger assign_default_features vira noop.

BEGIN;

-- ---------------------------------------------
-- 1. ENUM novo
-- ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role_v2') THEN
    CREATE TYPE org_role_v2 AS ENUM (
      'admin',
      'dev',
      'coo',
      'suporte',
      'designer',
      'implementacao'
    );
  END IF;
END$$;

-- ---------------------------------------------
-- 2. Junction multi-funcao
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS org_member_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id UUID REFERENCES org_members(id) ON DELETE CASCADE NOT NULL,
  role org_role_v2 NOT NULL,
  granted_by UUID REFERENCES profiles(id),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_member_id, role)
);

CREATE INDEX IF NOT EXISTS idx_org_member_roles_member ON org_member_roles(org_member_id);
CREATE INDEX IF NOT EXISTS idx_org_member_roles_role ON org_member_roles(role);

COMMENT ON TABLE org_member_roles IS 'Funcoes ativas de um org_member. Acesso = UNIAO. Multi-funcao por conta.';

-- ---------------------------------------------
-- 3. Backfill da junction a partir do ENUM antigo
--    Mapa de migracao:
--      owner             -> admin
--      coo               -> coo
--      developer         -> implementacao
--      designer          -> designer
--      support           -> suporte
--      manager/coordinator/copywriter/analyst -> suporte (default operacional;
--      ajustar manualmente apos a migration via UI Equipe)
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
    ELSE 'suporte'
  END)::org_role_v2
FROM org_members om
WHERE om.is_active = true
ON CONFLICT (org_member_id, role) DO NOTHING;

-- ---------------------------------------------
-- 4. Desabilita o trigger antigo antes de trocar o tipo do ENUM
-- ---------------------------------------------
DROP TRIGGER IF EXISTS trg_assign_default_features ON org_members;

-- ---------------------------------------------
-- 5. Substitui o tipo da coluna org_members.role para o ENUM novo
-- ---------------------------------------------
ALTER TABLE org_members
  ALTER COLUMN role DROP DEFAULT;

ALTER TABLE org_members
  ALTER COLUMN role TYPE org_role_v2
  USING (CASE role::text
    WHEN 'owner'      THEN 'admin'
    WHEN 'coo'        THEN 'coo'
    WHEN 'developer'  THEN 'implementacao'
    WHEN 'designer'   THEN 'designer'
    WHEN 'support'    THEN 'suporte'
    ELSE 'suporte'
  END)::org_role_v2;

ALTER TABLE org_members
  ALTER COLUMN role SET DEFAULT 'suporte';

-- ---------------------------------------------
-- 6. Drop o ENUM antigo e renomeia o v2 para o nome canonico
-- ---------------------------------------------
DROP TYPE org_role;
ALTER TYPE org_role_v2 RENAME TO org_role;

-- ---------------------------------------------
-- 7. Trigger assign_default_features vira noop
--    Mantemos a funcao porque podem existir grants/policies referenciando.
--    Reativamos o trigger apenas para preservar o gancho; nada e inserido
--    em org_member_features.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION assign_default_features()
RETURNS TRIGGER AS $$
BEGIN
  -- noop: features deprecadas em favor de org_member_roles
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_assign_default_features
  AFTER INSERT ON org_members
  FOR EACH ROW
  EXECUTE FUNCTION assign_default_features();

COMMENT ON FUNCTION assign_default_features() IS 'NOOP desde 20260801. Sistema de features deprecado em favor de org_member_roles. Tabelas features_catalog e org_member_features sao inertes ate release seguinte.';

COMMIT;
